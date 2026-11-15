"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Papa from "papaparse";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";

const chartPath = "/accounting/chart-of-accounts";
const periodsPath = "/accounting/periods";
const journalsPath = "/accounting/journal-entries";
const ledgerPath = "/accounting/general-ledger";
const accountingSettingsPath = "/accounting/settings";
const bankReconciliationPath = "/accounting/bank-reconciliation";
const accountTypes = ["asset", "liability", "equity", "income", "expense"] as const;
const cashFlowActivities = ["operating", "investing", "financing"] as const;

type EducationJournalLineInput = {
  account_id: string;
  debit: string;
  credit: string;
  description: string;
};

function isAccountType(value: string): value is (typeof accountTypes)[number] {
  return accountTypes.some((type) => type === value);
}

function isCashFlowActivity(value: string): value is (typeof cashFlowActivities)[number] {
  return cashFlowActivities.some((activity) => activity === value);
}

function value(formData: FormData, key: string) {
  const field = formData.get(key);
  return typeof field === "string" ? field.trim() : "";
}

function accountError(): never {
  redirect(`${chartPath}?error=account-save`);
}

function validDate(value: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(parsed.valueOf())
    && parsed.toISOString().slice(0, 10) === value;
}

function parseJournalLines(raw: string): EducationJournalLineInput[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const lines: EducationJournalLineInput[] = [];
  for (const candidate of parsed) {
    if (!candidate || typeof candidate !== "object") return null;
    const row = candidate as Record<string, unknown>;
    const accountId = typeof row.account_id === "string" ? row.account_id.trim() : "";
    const debit = typeof row.debit === "string" ? row.debit.trim() : "";
    const credit = typeof row.credit === "string" ? row.credit.trim() : "";
    const description = typeof row.description === "string" ? row.description.trim() : "";
    if (!accountId && !debit && !credit && !description) continue;
    if (
      !accountId
      || (debit !== "" && !/^\d{1,12}(?:\.\d{1,2})?$/.test(debit))
      || (credit !== "" && !/^\d{1,12}(?:\.\d{1,2})?$/.test(credit))
      || description.length > 300
    ) return null;
    lines.push({
      account_id: accountId,
      debit: debit || "0",
      credit: credit || "0",
      description,
    });
  }
  return lines.length >= 2 && lines.length <= 200 ? lines : null;
}

function journalErrorKey(code: string | undefined) {
  if (code === "42501") return "permission";
  if (code === "22023" || code === "22003" || code === "22P02") return "validation";
  return "save";
}

export async function saveEducationAccountingJournal(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");

  const journalId = value(formData, "journalId") || null;
  const permissionAction = journalId ? "edit" : "create";
  if (!await canTabPermission("education_finance", "finance", "journal_entries", permissionAction)) {
    redirect("/dashboard?accessDenied=think-education.accounting");
  }

  const branchId = value(formData, "branchId") || null;
  const fiscalYearId = value(formData, "fiscalYearId");
  const periodId = value(formData, "periodId");
  const entryDate = value(formData, "entryDate");
  const reference = value(formData, "reference");
  const description = value(formData, "description");
  const lines = parseJournalLines(value(formData, "lines"));
  if (
    !fiscalYearId
    || !periodId
    || !validDate(entryDate)
    || description.length < 1
    || description.length > 300
    || reference.length > 120
    || !lines
  ) {
    redirect(`${journalsPath}?error=validation`);
  }

  const access = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (
    (branchId && !access.campuses.some((campus) => campus.id === branchId))
    || (!branchId && !access.hasOrganizationScope)
  ) {
    redirect(`${journalsPath}?error=permission`);
  }

  const supabase = await createClient();
  const { data: savedJournalId, error } = await supabase.rpc("education_save_accounting_journal", {
    p_org_id: context.orgId,
    p_journal_id: journalId,
    p_branch_id: branchId,
    p_fiscal_year_id: fiscalYearId,
    p_period_id: periodId,
    p_entry_date: entryDate,
    p_reference: reference || null,
    p_description: description,
    p_lines: lines,
  });
  if (error || !savedJournalId) {
    redirect(`${journalsPath}?error=${journalErrorKey(error?.code)}`);
  }

  revalidatePath(journalsPath);
  revalidatePath(ledgerPath);
  revalidatePath("/accounting");
  redirect(`${journalsPath}?saved=1`);
}

export async function postEducationAccountingJournal(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_finance", "finance", "journal_entries", "approve")) {
    redirect("/dashboard?accessDenied=think-education.accounting");
  }

  const journalId = value(formData, "journalId");
  if (!journalId) redirect(`${journalsPath}?error=validation`);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("education_post_accounting_journal", {
    p_org_id: context.orgId,
    p_journal_id: journalId,
  });
  if (error || data !== true) {
    redirect(`${journalsPath}?error=${journalErrorKey(error?.code)}`);
  }

  revalidatePath(journalsPath);
  revalidatePath(ledgerPath);
  revalidatePath("/accounting");
  redirect(`${journalsPath}?posted=1`);
}

export async function saveEducationAccountingAccount(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");

  const accountId = value(formData, "accountId");
  const action = accountId ? "edit" : "create";
  if (!await canTabPermission("education_finance", "finance", "chart_of_accounts", action)) {
    redirect("/dashboard?accessDenied=think-education.accounting");
  }

  const code = value(formData, "code").toUpperCase();
  const name = value(formData, "name");
  const description = value(formData, "description");
  const parentAccountId = value(formData, "parentAccountId") || null;
  const isCashAccount = formData.get("isCashAccount") === "on";
  const cashFlowActivityValue = value(formData, "cashFlowActivity");
  if (cashFlowActivityValue && !isCashFlowActivity(cashFlowActivityValue)) accountError();
  if (isCashAccount && value(formData, "accountType") && value(formData, "accountType") !== "asset") accountError();
  const codePattern = /^[A-Z0-9][A-Z0-9._/-]{1,19}$/;
  if (!codePattern.test(code) || name.length < 1 || name.length > 120 || description.length > 500) {
    accountError();
  }

  const supabase = await createClient();
  if (accountId) {
    const { data, error } = await supabase
      .from("education_accounting_accounts")
      .update({
        code,
        name,
        description: description || null,
        parent_account_id: parentAccountId,
        is_cash_account: isCashAccount,
        cash_flow_activity: cashFlowActivityValue || null,
        updated_at: new Date().toISOString(),
      })
      .eq("org_id", context.orgId)
      .eq("id", accountId)
      .select("id")
      .maybeSingle();
    if (error || !data) accountError();
  } else {
    const accountType = value(formData, "accountType");
    const branchId = value(formData, "branchId") || null;
    if (!isAccountType(accountType)) accountError();

    const access = await getAccessibleEducationCampuses(context.orgId, context.userId);
    const hasBranchAccess = branchId && access.campuses.some((campus) => campus.id === branchId);
    if ((branchId && !hasBranchAccess) || (!branchId && !access.hasOrganizationScope)) {
      redirect("/dashboard?accessDenied=think-education.accounting");
    }

    const { error } = await supabase.from("education_accounting_accounts").insert({
      org_id: context.orgId,
      branch_id: branchId,
      code,
      name,
      account_type: accountType,
      normal_balance: accountType === "asset" || accountType === "expense" ? "debit" : "credit",
      parent_account_id: parentAccountId,
      description: description || null,
      is_cash_account: isCashAccount,
      cash_flow_activity: cashFlowActivityValue || null,
    });
    if (error) accountError();
  }

  revalidatePath(chartPath);
  revalidatePath("/accounting");
  redirect(chartPath);
}

export async function deactivateEducationAccountingAccount(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_finance", "finance", "chart_of_accounts", "edit")) {
    redirect("/dashboard?accessDenied=think-education.accounting");
  }

  const accountId = value(formData, "accountId");
  if (!accountId) accountError();

  const supabase = await createClient();
  const { error } = await supabase
    .from("education_accounting_accounts")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("org_id", context.orgId)
    .eq("id", accountId)
    .eq("is_active", true);
  if (error) accountError();

  revalidatePath(chartPath);
  redirect(chartPath);
}

export async function createEducationFiscalYear(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_finance", "finance", "fiscal_periods", "create")) {
    redirect("/dashboard?accessDenied=think-education.accounting");
  }
  const access = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!access.hasOrganizationScope) {
    redirect("/accounting/periods?error=organization-scope");
  }

  const name = value(formData, "name");
  const startsOn = value(formData, "startsOn");
  const endsOn = value(formData, "endsOn");
  const isValidDate = (date: string) => {
    const parsed = new Date(`${date}T00:00:00.000Z`);
    return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(parsed.valueOf())
      && parsed.toISOString().slice(0, 10) === date;
  };
  if (
    name.length < 1
    || name.length > 80
    || !isValidDate(startsOn)
    || !isValidDate(endsOn)
    || startsOn > endsOn
  ) {
    redirect(`${periodsPath}?error=fiscal-year-details`);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("education_create_accounting_fiscal_year", {
    p_org_id: context.orgId,
    p_name: name,
    p_starts_on: startsOn,
    p_ends_on: endsOn,
  });
  if (error) redirect(`${periodsPath}?error=fiscal-year-create`);

  revalidatePath(periodsPath);
  revalidatePath("/accounting");
  redirect(periodsPath);
}

export async function saveEducationAccountingSourceMapping(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_finance", "finance", "accounting_settings", "edit")) {
    redirect("/dashboard?accessDenied=think-education.accounting");
  }

  const branchId = value(formData, "branchId");
  const sourceType = value(formData, "sourceType");
  const sourceKey = value(formData, "sourceKey");
  const accountId = value(formData, "accountId") || null;
  const access = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!branchId || !access.campuses.some((campus) => campus.id === branchId)) {
    redirect(`${accountingSettingsPath}?error=permission`);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("education_save_accounting_source_mapping", {
    p_org_id: context.orgId,
    p_branch_id: branchId,
    p_source_type: sourceType,
    p_source_key: sourceType === "expense_category" ? sourceKey.toLowerCase() : sourceKey,
    p_account_id: accountId,
  });
  if (error) {
    redirect(`${accountingSettingsPath}?error=${error.code === "42501" ? "permission" : "mapping"}`);
  }

  revalidatePath(accountingSettingsPath);
  revalidatePath(journalsPath);
  redirect(`${accountingSettingsPath}?saved=1`);
}

export async function backfillEducationAccountingJournals(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_finance", "finance", "accounting_settings", "approve")) {
    redirect("/dashboard?accessDenied=think-education.accounting");
  }
  const branchId = value(formData, "branchId");
  const startsOn = value(formData, "startsOn");
  const endsOn = value(formData, "endsOn");
  const access = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!branchId || !access.campuses.some((campus) => campus.id === branchId)
    || !validDate(startsOn) || !validDate(endsOn) || startsOn > endsOn
    || endsOn > new Date().toISOString().slice(0, 10)) {
    redirect(`${accountingSettingsPath}?error=backfill`);
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("education_backfill_accounting_source_journals", {
    p_org_id: context.orgId,
    p_branch_id: branchId,
    p_starts_on: startsOn,
    p_ends_on: endsOn,
  });
  if (error) redirect(`${accountingSettingsPath}?error=${error.code === "42501" ? "permission" : "backfill"}`);
  revalidatePath(journalsPath);
  revalidatePath(ledgerPath);
  revalidatePath("/accounting/reports");
  redirect(`${accountingSettingsPath}?backfilled=${data ?? 0}`);
}

export async function setEducationAccountingPeriodStatus(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_finance", "finance", "fiscal_periods", "approve")) {
    redirect("/dashboard?accessDenied=think-education.accounting");
  }
  const periodId = value(formData, "periodId");
  const status = value(formData, "status");
  const reason = value(formData, "reason");
  if (!periodId || !["open", "closed"].includes(status) || reason.length < 3 || reason.length > 500) {
    redirect(`${periodsPath}?error=period-status`);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("education_set_accounting_period_status", {
    p_org_id: context.orgId,
    p_period_id: periodId,
    p_status: status,
    p_reason: reason,
  });
  if (error) redirect(`${periodsPath}?error=${error.code === "42501" ? "permission" : "period-status"}`);
  revalidatePath(periodsPath);
  revalidatePath(journalsPath);
  revalidatePath("/accounting/reports");
  redirect(`${periodsPath}?updated=${status}`);
}

export async function importEducationAccountingBankStatement(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_finance", "finance", "bank_reconciliation", "create")) {
    redirect("/dashboard?accessDenied=think-education.accounting");
  }
  const branchId = value(formData, "branchId");
  const accountId = value(formData, "accountId");
  const startsOn = value(formData, "startsOn");
  const endsOn = value(formData, "endsOn");
  const openingText = value(formData, "openingBalance");
  const closingText = value(formData, "closingBalance");
  const file = formData.get("file");
  const access = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!branchId || !access.campuses.some((campus) => campus.id === branchId)
    || !accountId || !validDate(startsOn) || !validDate(endsOn) || startsOn > endsOn
    || !/^-?\d{1,12}(?:\.\d{1,2})?$/.test(openingText)
    || !/^-?\d{1,12}(?:\.\d{1,2})?$/.test(closingText)
    || !(file instanceof File) || file.size === 0 || file.size > 5_000_000) {
    redirect(`${bankReconciliationPath}?error=invalid`);
  }

  const parsed = Papa.parse<Record<string, string>>(await file.text(), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim().toLowerCase(),
  });
  if (parsed.errors.length > 0 || parsed.data.length < 1 || parsed.data.length > 10_000) {
    redirect(`${bankReconciliationPath}?error=csv`);
  }
  const lines: Array<{ transaction_date: string; reference: string | null; description: string; amount: number }> = [];
  for (const row of parsed.data) {
    const transactionDate = (row.date ?? row.transaction_date ?? "").trim();
    const reference = (row.reference ?? "").trim();
    const description = (row.description ?? "").trim();
    const amountText = (row.amount ?? "").trim();
    if (!validDate(transactionDate) || transactionDate < startsOn || transactionDate > endsOn
      || !/^-?\d{1,12}(?:\.\d{1,2})?$/.test(amountText) || Number(amountText) === 0
      || !description || description.length > 300 || reference.length > 120) {
      redirect(`${bankReconciliationPath}?error=csv`);
    }
    lines.push({ transaction_date: transactionDate, reference: reference || null, description, amount: Number(amountText) });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("education_create_accounting_bank_statement", {
    p_org_id: context.orgId,
    p_branch_id: branchId,
    p_account_id: accountId,
    p_period_starts_on: startsOn,
    p_period_ends_on: endsOn,
    p_opening_balance: Number(openingText),
    p_closing_balance: Number(closingText),
    p_lines: lines,
  });
  if (error || !data) {
    redirect(`${bankReconciliationPath}?error=${error?.code === "42501" ? "permission" : "import"}`);
  }
  revalidatePath(bankReconciliationPath);
  redirect(`${bankReconciliationPath}?imported=1`);
}

export async function matchEducationAccountingBankLine(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_finance", "finance", "bank_reconciliation", "edit")) {
    redirect("/dashboard?accessDenied=think-education.accounting");
  }
  const statementLineId = value(formData, "statementLineId");
  const journalLineId = value(formData, "journalLineId");
  if (!statementLineId || !journalLineId) redirect(`${bankReconciliationPath}?error=match`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("education_match_accounting_bank_line", {
    p_org_id: context.orgId,
    p_statement_line_id: statementLineId,
    p_journal_line_id: journalLineId,
  });
  if (error) redirect(`${bankReconciliationPath}?error=${error.code === "42501" ? "permission" : "match"}`);
  revalidatePath(bankReconciliationPath);
  redirect(`${bankReconciliationPath}?matched=1`);
}

export async function reconcileEducationAccountingBankStatement(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_finance", "finance", "bank_reconciliation", "approve")) {
    redirect("/dashboard?accessDenied=think-education.accounting");
  }
  const statementId = value(formData, "statementId");
  const reason = value(formData, "reason");
  if (!statementId || reason.length < 3 || reason.length > 500) {
    redirect(`${bankReconciliationPath}?error=reconcile`);
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("education_reconcile_accounting_bank_statement", {
    p_org_id: context.orgId,
    p_statement_id: statementId,
    p_reason: reason,
  });
  if (error) redirect(`${bankReconciliationPath}?error=${error.code === "42501" ? "permission" : "reconcile"}`);
  revalidatePath(bankReconciliationPath);
  redirect(`${bankReconciliationPath}?reconciled=1`);
}
