"use server";

import { revalidatePath } from "next/cache";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { canPermission } from "@/lib/rbac/permissions";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";

export async function recordCustomerCreditPayment(input: {
  invoiceId: string; customerId?: string | null; amount: number; paymentMethod: string;
  paymentDate?: string; locationId?: string | null; notes?: string | null;
}) {
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "Your session expired." };
  if (!await canPermission("accounting", "create")) return { ok: false, error: "You do not have permission to record customer payments." };
  if (!input.invoiceId || !Number.isFinite(input.amount) || input.amount <= 0) return { ok: false, error: "Enter a valid payment amount." };
  if (input.locationId && context.isBranchScoped && !context.allowedLocationIds.includes(input.locationId)) return { ok: false, error: "You are not assigned to this branch." };
  const db = await createClient() as any;
  const paymentMethod = /mobile money|mobile|momo/i.test(input.paymentMethod) ? "MoMo" : input.paymentMethod || "Cash";
  const { error } = await db.from("customer_credit_payments").insert({
    org_id: context.orgId, customer_id: input.customerId || null, invoice_id: input.invoiceId,
    amount: input.amount, payment_method: paymentMethod, payment_date: input.paymentDate || new Date().toISOString().slice(0, 10),
    location_id: input.locationId || (context.isBranchScoped ? context.locationId : null), recorded_by: context.userId, notes: input.notes || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/accounting");
  return { ok: true };
}

export async function sendCustomerReminder(input: {
  invoiceId: string;
  customerName: string;
  message: string;
  locationId?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const context = await getCurrentOrgContext();
  if (!context || !(await canPermission("accounting", "edit"))) {
    return { ok: false, error: "You do not have permission to send payment reminders." };
  }
  if (!input.invoiceId || !input.message.trim()) {
    return { ok: false, error: "A reminder message is required." };
  }
  if (input.locationId && context.isBranchScoped && !context.allowedLocationIds.includes(input.locationId)) {
    return { ok: false, error: "You are not assigned to this branch." };
  }

  const supabase = await createClient();
  const audit = await recordAuditEvent(supabase, {
    orgId: context.orgId,
    actorId: context.userId,
    action: "customer.payment_reminder_sent",
    entityType: "customer_credit_invoices",
    entityId: input.invoiceId,
    module: "Accounts Receivable",
    branchId: input.locationId ?? (context.isBranchScoped ? context.locationId : null),
    description: `Sent a payment reminder to ${input.customerName}`,
    newValues: { customer_name: input.customerName, message: input.message.trim() },
  });
  if (audit.error) return { ok: false, error: audit.error };

  revalidatePath("/accounting");
  return { ok: true };
}

export async function saveAccountingAccount(input: {
  id?: string; code: string; name: string; type: "asset" | "liability" | "equity" | "revenue" | "cogs" | "expense";
  subType?: string; parentId?: string | null; locationId?: string | null; currency: string; description?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const context = await getCurrentOrgContext();
  if (!context || !(await canPermission("accounting", input.id ? "edit" : "create"))) return { ok: false, error: "You do not have permission to manage accounts." };
  if (!input.code.trim() || !input.name.trim()) return { ok: false, error: "Account code and name are required." };
  if (input.locationId && !context.allowedLocationIds.includes(input.locationId) && context.isBranchScoped) {
    return { ok: false, error: "You are not assigned to this branch." };
  }
  const supabase = await createClient() as any;
  const payload = { org_id: context.orgId, code: input.code.trim(), name: input.name.trim(), type: input.type,
    sub_type: input.subType?.trim() || null, parent_id: input.parentId || null, location_id: input.locationId || null,
    currency: input.currency, description: input.description?.trim() || null };
  const query = input.id
    ? supabase.from("accounting_accounts").update(payload).eq("id", input.id).eq("org_id", context.orgId)
    : supabase.from("accounting_accounts").insert(payload);
  const { error } = await query;
  if (error) return { ok: false, error: error.message };
  revalidatePath("/accounting");
  return { ok: true };
}

export async function setAccountingAccountStatus(id: string, active: boolean): Promise<{ ok: boolean; error?: string }> {
  const context = await getCurrentOrgContext();
  if (!context || !(await canPermission("accounting", "edit"))) return { ok: false, error: "You do not have permission to manage accounts." };
  const supabase = await createClient() as any;
  const { error } = await supabase.from("accounting_accounts").update({ is_active: active }).eq("id", id).eq("org_id", context.orgId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/accounting");
  return { ok: true };
}

export async function mergeAccountingAccounts(sourceId: string, targetId: string): Promise<{ ok: boolean; error?: string }> {
  const context = await getCurrentOrgContext();
  if (!context || !(await canPermission("accounting", "edit"))) return { ok: false, error: "You do not have permission to merge accounts." };
  if (!sourceId || !targetId || sourceId === targetId) return { ok: false, error: "Choose two different accounts." };
  const supabase = await createClient() as any;
  const { error } = await supabase.rpc("merge_accounting_accounts", {
    p_org_id: context.orgId,
    p_source_id: sourceId,
    p_target_id: targetId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/accounting");
  return { ok: true };
}

export async function createManualJournal(input: {
  date: string; locationId: string | null; reference: string; description: string; status: "draft" | "posted";
  lines: { accountId: string; description: string; debit: number; credit: number }[];
}): Promise<{ ok: boolean; error?: string }> {
  const context = await getCurrentOrgContext();
  if (!context || !(await canPermission("accounting", "create"))) return { ok: false, error: "You do not have permission to create journal entries." };
  if (!input.description.trim() || input.lines.length < 2) return { ok: false, error: "A journal requires a description and at least two lines." };
  const totalDebit = input.lines.reduce((sum, line) => sum + line.debit, 0);
  const totalCredit = input.lines.reduce((sum, line) => sum + line.credit, 0);
  if (totalDebit <= 0 || Math.abs(totalDebit - totalCredit) > 0.01) return { ok: false, error: "Journal debits and credits must balance." };
  const supabase = await createClient() as any;
  const { data: entry, error } = await supabase.from("journal_entries").insert({
    org_id: context.orgId, entry_number: `JE-${Date.now()}`, entry_date: input.date, location_id: input.locationId,
    reference: input.reference.trim() || null, description: input.description.trim(), status: input.status,
    total_debit: totalDebit, total_credit: totalCredit, source_module: "manual", is_auto: false,
    created_by: context.userId, posted_by: input.status === "posted" ? context.userId : null,
    posted_at: input.status === "posted" ? new Date().toISOString() : null,
  }).select("id").single();
  if (error || !entry) return { ok: false, error: error?.message ?? "Could not create journal entry." };
  const { error: linesError } = await supabase.from("journal_entry_lines").insert(input.lines.map((line) => ({
    journal_id: entry.id, org_id: context.orgId, account_id: line.accountId, description: line.description || input.description,
    debit: line.debit, credit: line.credit, location_id: input.locationId,
  })));
  if (linesError) {
    await supabase.from("journal_entries").delete().eq("id", entry.id).eq("org_id", context.orgId);
    return { ok: false, error: linesError.message };
  }

  revalidatePath("/accounting");
  return { ok: true };
}

export async function updateJournalStatus(id: string, status: "posted" | "reversed", reason?: string): Promise<{ ok: boolean; error?: string }> {
  const context = await getCurrentOrgContext();
  if (!context || !(await canPermission("accounting", "edit"))) return { ok: false, error: "You do not have permission to update journal entries." };
  const supabase = await createClient() as any;
  const { data: journal, error: fetchError } = await supabase.from("journal_entries").select("id, status, description, posted_by, posted_at").eq("id", id).eq("org_id", context.orgId).single();
  if (fetchError || !journal) return { ok: false, error: "Journal entry not found." };
  if (status === "posted" && journal.status !== "draft") return { ok: false, error: "Only draft journals can be posted." };
  if (status === "reversed" && journal.status !== "posted") return { ok: false, error: "Only posted journals can be reversed." };
  const { error } = await supabase.from("journal_entries").update({
    status,
    posted_by: status === "posted" ? context.userId : journal.posted_by,
    posted_at: status === "posted" ? new Date().toISOString() : journal.posted_at,
    description: status === "reversed" && reason ? `${journal.description} — Reversed: ${reason}` : journal.description,
  }).eq("id", id).eq("org_id", context.orgId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/accounting");
  return { ok: true };
}

export async function saveAccountingSettings(input: {
  financialYearStart: string; financialYearEnd: string; periodLockDate: string | null; defaultCurrency: string;
  approvalThreshold: number; autoJournalRules: { sales: boolean; purchases: boolean; expenses: boolean; inventoryAdjustments: boolean };
  numberSequences: { journalPrefix: string; invoicePrefix: string; billPrefix: string };
}): Promise<{ ok: boolean; error?: string }> {
  const context = await getCurrentOrgContext();
  if (!context || !(await canPermission("accounting", "edit"))) return { ok: false, error: "You do not have permission to update accounting settings." };
  const supabase = await createClient() as any;
  const { error } = await supabase.from("accounting_settings").upsert({
    org_id: context.orgId, financial_year_start: input.financialYearStart, financial_year_end: input.financialYearEnd,
    period_lock_date: input.periodLockDate || null, default_currency: input.defaultCurrency, approval_threshold: input.approvalThreshold,
    auto_journal_sales: input.autoJournalRules.sales, auto_journal_purchases: input.autoJournalRules.purchases,
    auto_journal_expenses: input.autoJournalRules.expenses, auto_journal_inventory: input.autoJournalRules.inventoryAdjustments,
    sequence_prefix_journal: input.numberSequences.journalPrefix, sequence_prefix_invoice: input.numberSequences.invoicePrefix,
    sequence_prefix_bill: input.numberSequences.billPrefix, updated_at: new Date().toISOString(),
  }, { onConflict: "org_id" });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/accounting");
  return { ok: true };
}

export async function saveFixedAssetTreatment(input: {
  assetCode: string;
  assetName: string;
  category: string;
  purchaseDate: string;
  cost: number;
  depreciationMethod: "straight_line" | "reducing_balance" | "none";
  usefulLifeYears: number;
  salvageValue: number;
  currentValue: number;
  accumulatedDepreciation: number;
  locationId?: string | null;
  status: string;
  notes?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const context = await getCurrentOrgContext();
  if (!context || !(await canPermission("accounting", "edit"))) return { ok: false, error: "You do not have permission to manage fixed assets." };
  if (!input.assetCode.trim() || !input.assetName.trim() || input.cost < 0 || input.salvageValue < 0 || input.usefulLifeYears < 0) {
    return { ok: false, error: "Enter valid fixed asset details." };
  }
  if (input.locationId && context.isBranchScoped && !context.allowedLocationIds.includes(input.locationId)) return { ok: false, error: "You are not assigned to this branch." };
  const supabase = await createClient() as any;
  const { error } = await supabase.from("fixed_assets_register").upsert({
    org_id: context.orgId, asset_code: input.assetCode.trim(), asset_name: input.assetName.trim(), category: input.category.trim() || "Other",
    purchase_date: input.purchaseDate, cost: input.cost, depreciation_method: input.depreciationMethod,
    useful_life_years: input.usefulLifeYears, salvage_value: input.salvageValue,
    accumulated_depreciation: input.accumulatedDepreciation, current_value: input.currentValue,
    location_id: input.locationId || (context.isBranchScoped ? context.locationId : null), status: input.status,
    notes: input.notes?.trim() || null, updated_at: new Date().toISOString(),
  }, { onConflict: "org_id,asset_code" });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/accounting");
  return { ok: true };
}

export async function postFixedAssetDepreciation(months: number): Promise<{ ok: boolean; totalDepreciation?: number; entriesCreated?: number; error?: string }> {
  const context = await getCurrentOrgContext();
  if (!context || !(await canPermission("accounting", "create"))) return { ok: false, error: "You do not have permission to post depreciation." };
  if (!Number.isInteger(months) || months < 1 || months > 12) return { ok: false, error: "Depreciation period must be between 1 and 12 months." };
  const supabase = await createClient() as any;
  const [{ data: assets, error: assetError }, { data: expenseAccounts }, { data: accumulatedAccounts }] = await Promise.all([
    supabase.from("fixed_assets_register").select("*").eq("org_id", context.orgId).eq("status", "in_use"),
    supabase.from("accounting_accounts").select("id, code, name").eq("org_id", context.orgId).eq("type", "expense").eq("is_active", true),
    supabase.from("accounting_accounts").select("id, code, name").eq("org_id", context.orgId).eq("type", "asset").eq("is_active", true),
  ]);
  if (assetError) return { ok: false, error: assetError.message };
  const expenseAccount = (expenseAccounts ?? []).find((account: any) => /depreciation/i.test(`${account.name} ${account.code}`));
  const accumulatedAccount = (accumulatedAccounts ?? []).find((account: any) => /accumulated.*depreciation/i.test(`${account.name} ${account.code}`));
  if ((assets ?? []).some((asset: any) => asset.depreciation_method !== "none") && (!expenseAccount || !accumulatedAccount)) {
    return { ok: false, error: "Configure active depreciation expense and accumulated depreciation accounts before posting." };
  }

  let totalDepreciation = 0;
  let entriesCreated = 0;
  for (const asset of assets ?? []) {
    if (asset.depreciation_method === "none") continue;
    const monthly = asset.depreciation_method === "straight_line"
      ? Math.max(0, (Number(asset.cost) - Number(asset.salvage_value)) / (Number(asset.useful_life_years) * 12))
      : Math.max(0, (Number(asset.current_value) - Number(asset.salvage_value)) * 0.02);
    const amount = Math.min(monthly * months, Math.max(0, Number(asset.current_value) - Number(asset.salvage_value)));
    if (amount <= 0) continue;
    const entryDate = new Date().toISOString().slice(0, 10);
    const { data: entry, error: entryError } = await supabase.from("journal_entries").insert({
      org_id: context.orgId, entry_number: `DEP-${Date.now()}-${entriesCreated + 1}`, entry_date: entryDate,
      reference: asset.asset_code, description: `Depreciation - ${asset.asset_name}`, status: "posted",
      total_debit: amount, total_credit: amount, source_module: "fixed_assets", source_id: asset.id,
      is_auto: true, created_by: context.userId, posted_by: context.userId, posted_at: new Date().toISOString(),
      location_id: asset.location_id,
    }).select("id").single();
    if (entryError || !entry) return { ok: false, error: entryError?.message ?? "Could not create depreciation journal." };
    const { error: lineError } = await supabase.from("journal_entry_lines").insert([
      { journal_id: entry.id, org_id: context.orgId, account_id: expenseAccount.id, description: `Depreciation - ${asset.asset_name}`, debit: amount, credit: 0, location_id: asset.location_id },
      { journal_id: entry.id, org_id: context.orgId, account_id: accumulatedAccount.id, description: `Accumulated depreciation - ${asset.asset_name}`, debit: 0, credit: amount, location_id: asset.location_id },
    ]);
    if (lineError) return { ok: false, error: lineError.message };
    const { error: updateError } = await supabase.from("fixed_assets_register").update({
      accumulated_depreciation: Number(asset.accumulated_depreciation) + amount,
      current_value: Number(asset.current_value) - amount,
      last_depreciation_date: entryDate,
      updated_at: new Date().toISOString(),
    }).eq("id", asset.id).eq("org_id", context.orgId);
    if (updateError) return { ok: false, error: updateError.message };
    totalDepreciation += amount;
    entriesCreated += 1;
  }
  revalidatePath("/accounting");
  return { ok: true, totalDepreciation, entriesCreated };
}

export async function importBankStatement(input: {
  accountId: string;
  transactions: { date: string; reference: string; description: string; amount: number; type: "deposit" | "withdrawal" }[];
}): Promise<{ ok: boolean; imported?: number; error?: string }> {
  const context = await getCurrentOrgContext();
  if (!context || !(await canPermission("accounting", "edit"))) return { ok: false, error: "You do not have permission to import bank statements." };
  if (!input.accountId || !input.transactions.length || input.transactions.some((transaction) => !transaction.date || !Number.isFinite(transaction.amount) || transaction.amount <= 0)) return { ok: false, error: "The statement contains invalid transactions." };
  const supabase = await createClient() as any;
  const { data: account } = await supabase.from("bank_accounts").select("id").eq("id", input.accountId).eq("org_id", context.orgId).maybeSingle();
  if (!account) return { ok: false, error: "Bank account not found." };
  const { error } = await supabase.from("bank_statement_transactions").insert(input.transactions.map((transaction) => ({
    org_id: context.orgId, bank_account_id: input.accountId, transaction_date: transaction.date,
    reference: transaction.reference || null, description: transaction.description || null, amount: transaction.amount,
    type: transaction.type, imported_by: context.userId,
  })));
  if (error) return { ok: false, error: error.message };
  revalidatePath("/accounting");
  return { ok: true, imported: input.transactions.length };
}

export async function toggleBankStatementMatch(id: string, matched: boolean): Promise<{ ok: boolean; error?: string }> {
  const context = await getCurrentOrgContext();
  if (!context || !(await canPermission("accounting", "edit"))) return { ok: false, error: "You do not have permission to update reconciliation." };
  const supabase = await createClient() as any;
  const { error } = await supabase.from("bank_statement_transactions").update({ matched, matched_transaction_id: null }).eq("id", id).eq("org_id", context.orgId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/accounting");
  return { ok: true };
}

export async function autoMatchBankStatement(accountId: string): Promise<{ ok: boolean; matched?: number; error?: string }> {
  const context = await getCurrentOrgContext();
  if (!context || !(await canPermission("accounting", "edit"))) return { ok: false, error: "You do not have permission to reconcile bank statements." };
  const supabase = await createClient() as any;
  const [{ data: statements, error: statementError }, { data: bookTransactions, error: bookError }] = await Promise.all([
    supabase.from("bank_statement_transactions").select("id, transaction_date, amount, type").eq("org_id", context.orgId).eq("bank_account_id", accountId).eq("matched", false),
    supabase.from("bank_transactions").select("id, transaction_date, amount, type").eq("org_id", context.orgId).eq("account_id", accountId),
  ]);
  if (statementError || bookError) return { ok: false, error: statementError?.message ?? bookError?.message };
  const used = new Set<string>();
  let matched = 0;
  for (const statement of statements ?? []) {
    const candidate = (bookTransactions ?? []).find((transaction: any) => !used.has(transaction.id) && transaction.type === statement.type && Number(transaction.amount) === Number(statement.amount) && transaction.transaction_date === statement.transaction_date);
    if (!candidate) continue;
    const { error } = await supabase.from("bank_statement_transactions").update({ matched: true, matched_transaction_id: candidate.id }).eq("id", statement.id).eq("org_id", context.orgId);
    if (error) return { ok: false, error: error.message };
    used.add(candidate.id);
    matched += 1;
  }
  revalidatePath("/accounting");
  return { ok: true, matched };
}

export async function finalizeBankReconciliation(input: { accountId: string; statementBalance: number; statementDate?: string }): Promise<{ ok: boolean; error?: string }> {
  const context = await getCurrentOrgContext();
  if (!context || !(await canPermission("accounting", "edit"))) return { ok: false, error: "You do not have permission to finalize reconciliation." };
  if (!Number.isFinite(input.statementBalance)) return { ok: false, error: "Enter a valid statement balance." };
  const supabase = await createClient() as any;
  const [{ data: account }, { data: unmatched, error: unmatchedError }] = await Promise.all([
    supabase.from("bank_accounts").select("id, current_balance").eq("id", input.accountId).eq("org_id", context.orgId).maybeSingle(),
    supabase.from("bank_statement_transactions").select("id").eq("org_id", context.orgId).eq("bank_account_id", input.accountId).eq("matched", false),
  ]);
  if (!account) return { ok: false, error: "Bank account not found." };
  if (unmatchedError) return { ok: false, error: unmatchedError.message };
  if ((unmatched ?? []).length > 0) return { ok: false, error: "Match all imported statement transactions before finalizing." };
  const bookBalance = Number(account.current_balance ?? 0);
  const difference = Number((input.statementBalance - bookBalance).toFixed(2));
  if (Math.abs(difference) > 0.01) return { ok: false, error: "Statement and book balances must agree before finalizing." };
  const { error } = await supabase.from("bank_reconciliations").insert({
    org_id: context.orgId, bank_account_id: input.accountId, statement_date: input.statementDate || new Date().toISOString().slice(0, 10),
    statement_balance: input.statementBalance, book_balance: bookBalance, difference, status: "reconciled",
    reconciled_by: context.userId, reconciled_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/accounting");
  return { ok: true };
}

export async function saveTaxRate(input: {
  id?: string; name: string; code: string; rate: number; isCompound: boolean;
  appliesTo: "sales" | "purchases" | "both"; isActive: boolean; description: string;
}): Promise<{ ok: boolean; error?: string }> {
  const context = await getCurrentOrgContext();
  if (!context || !(await canPermission("accounting", input.id ? "edit" : "create"))) return { ok: false, error: "You do not have permission to manage tax rates." };
  if (!input.name.trim() || !input.code.trim() || !Number.isFinite(input.rate) || input.rate < 0) return { ok: false, error: "Enter valid tax rate details." };
  const db = await createClient() as any;
  const payload = { org_id: context.orgId, name: input.name.trim(), code: input.code.trim(), rate: input.rate, is_compound: input.isCompound, applies_to: input.appliesTo, is_active: input.isActive, description: input.description.trim() };
  const query = input.id ? db.from("accounting_tax_rates").update(payload).eq("id", input.id).eq("org_id", context.orgId) : db.from("accounting_tax_rates").insert(payload);
  const { error } = await query;
  if (error) return { ok: false, error: error.message };
  revalidatePath("/accounting");
  return { ok: true };
}

export async function fileAccountingTaxReturn(input: {
  period: string; grossSales: number; exemptSales: number; taxableSales: number; standardVAT: number;
  nhil: number; getFund: number; covidLevy: number; totalOutputTax: number; inputTaxDeductions: number;
  withholdingTaxCredited: number; netTaxPayable: number;
}): Promise<{ ok: boolean; error?: string }> {
  const context = await getCurrentOrgContext();
  if (!context || !(await canPermission("accounting", "create"))) return { ok: false, error: "You do not have permission to file tax returns." };
  const db = await createClient() as any;
  const { error } = await db.from("accounting_tax_filings").insert({
    org_id: context.orgId, period: input.period, gross_sales: input.grossSales, exempt_sales: input.exemptSales,
    taxable_sales: input.taxableSales, standard_vat: input.standardVAT, nhil: input.nhil, get_fund: input.getFund,
    covid_levy: input.covidLevy, total_output_tax: input.totalOutputTax, input_tax_deductions: input.inputTaxDeductions,
    withholding_tax_credited: input.withholdingTaxCredited, net_tax_payable: input.netTaxPayable, filed_by: context.userId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/accounting");
  return { ok: true };
}
