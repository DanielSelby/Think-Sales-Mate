import { Suspense } from "react";
import { AccountingDashboard } from "@/components/accounting/accounting-dashboard";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import type { AccountsPayableItem } from "@/types/accounting";
import type { AccountsReceivableItem } from "@/types/accounting";
import { getReportKpis, getBalanceSheet, getRevenueExpenseSeries, getExpensesByCategory } from "@/lib/reports/calculations";
import type { LiveFinancialSnapshot } from "@/components/accounting/financial-reports-tab";
import type { AccountingAccount, JournalEntry } from "@/types/accounting";
import { getOrganizationCurrencyConfig } from "@/lib/currency/settings";
import type { CurrencyConfig } from "@/lib/currency";

export const metadata = {
  title: "Accounting & Financial Management",
  description: "Enterprise double-entry accounting, General Ledger, Chart of Accounts, and Financial Reports.",
};

export default async function AccountingPage({ searchParams }: { searchParams?: Promise<{ from?: string; to?: string }> }) {
  const context = await getCurrentOrgContext();
  const requestedRange = searchParams ? await searchParams : {};
  const isoDate = /^\d{4}-\d{2}-\d{2}$/;
  const reportToday = new Date();
  const defaultFrom = new Date(reportToday.getFullYear(), reportToday.getMonth(), 1).toISOString().slice(0, 10);
  const defaultTo = reportToday.toISOString().slice(0, 10);
  const dateFrom = requestedRange.from && isoDate.test(requestedRange.from) ? requestedRange.from : defaultFrom;
  const dateTo = requestedRange.to && isoDate.test(requestedRange.to) && requestedRange.to >= dateFrom ? requestedRange.to : defaultTo;
  let initialPayables: AccountsPayableItem[] = [];
  let initialBranches: string[] = [];
  let initialBranchOptions: { id: string; name: string }[] = [];
  let initialReceivables: AccountsReceivableItem[] = [];
  let initialAuditLogs: { userName: string; action: string; module: string; createdAt: string; branchId?: string }[] = [];
  let initialPayments: { id: string; invoiceId: string; amount: number; paymentMethod: string; paymentDate: string; recordedBy: string }[] = [];
  let liveFinancialSnapshot: LiveFinancialSnapshot | undefined;
  let liveAccounts: AccountingAccount[] = [];
  let liveJournalEntries: JournalEntry[] = [];
  let liveTaxSummary: { periodLabel: string; grossSales: number; outputTax: number; inputTax: number } | undefined;
  let liveBankAccounts: import("@/types/accounting").BankAccountItem[] = [];
  let liveBankTransactions: Record<string, { id: string; date: string; reference: string; description: string; amount: number; type: "deposit" | "withdrawal"; matched: boolean }[]> = {};
  let liveFixedAssets: import("@/types/accounting").FixedAsset[] = [];
  let liveAccountingSettings: Parameters<typeof AccountingDashboard>[0]["liveAccountingSettings"];
  let liveTaxRates: import("@/types/accounting").TaxRateConfig[] = [];
  let liveTaxFilings: import("@/types/accounting").TaxFilingSummary[] = [];
  let liveCurrencyConfig: CurrencyConfig | undefined;
  if (context) {
    const db = await createClient();
    const accountingDb = db as any;
    const currencyConfig = await getOrganizationCurrencyConfig();
    liveCurrencyConfig = currencyConfig;
    const [{ data: accountRows, error: accountsError }, { data: journalRows, error: journalsError }] = await Promise.all([
      accountingDb.from("accounting_accounts").select("id, code, name, type, sub_type, parent_id, location_id, currency, current_balance, is_active, description").eq("org_id", context.orgId).order("code"),
      accountingDb.from("journal_entries").select("id, entry_number, entry_date, location_id, reference, description, status, total_debit, total_credit, source_module, source_id, is_auto, posted_by, posted_at, journal_entry_lines(id, account_id, description, debit, credit)").eq("org_id", context.orgId).order("entry_date", { ascending: false }).limit(500),
    ]);
    const [{ data: bankRows }, { data: transactionRows }] = await Promise.all([
      accountingDb.from("bank_accounts").select("id, name, account_type, opening_balance, current_balance").eq("org_id", context.orgId).order("name"),
      accountingDb.from("bank_statement_transactions").select("id, bank_account_id, transaction_date, reference, description, amount, type, matched").eq("org_id", context.orgId).order("transaction_date", { ascending: false }),
    ]);
    const [{ data: fixedAssetRows }, { data: settingsRow }, { data: taxRateRows }, { data: taxFilingRows }] = await Promise.all([
      accountingDb.from("fixed_assets_register").select("*").eq("org_id", context.orgId).order("asset_name"),
      accountingDb.from("accounting_settings").select("*").eq("org_id", context.orgId).maybeSingle(),
      accountingDb.from("accounting_tax_rates").select("*").eq("org_id", context.orgId).order("name"),
      accountingDb.from("accounting_tax_filings").select("*").eq("org_id", context.orgId).order("filed_at", { ascending: false }),
    ]);
    liveTaxRates = (taxRateRows ?? []).map((rate: any) => ({
      id: rate.id, name: rate.name, code: rate.code, rate: Number(rate.rate ?? 0), isCompound: Boolean(rate.is_compound),
      appliesTo: rate.applies_to, isActive: Boolean(rate.is_active), description: rate.description ?? "",
    }));
    liveTaxFilings = (taxFilingRows ?? []).map((filing: any) => ({
      id: filing.id,
      period: filing.period, grossSales: Number(filing.gross_sales ?? 0), exemptSales: Number(filing.exempt_sales ?? 0),
      taxableSales: Number(filing.taxable_sales ?? 0), standardVAT: Number(filing.standard_vat ?? 0),
      nhil: Number(filing.nhil ?? 0), getFund: Number(filing.get_fund ?? 0), covidLevy: Number(filing.covid_levy ?? 0),
      totalOutputTax: Number(filing.total_output_tax ?? 0), inputTaxDeductions: Number(filing.input_tax_deductions ?? 0),
      withholdingTaxCredited: Number(filing.withholding_tax_credited ?? 0), netTaxPayable: Number(filing.net_tax_payable ?? 0),
      filedAt: filing.filed_at, filedBy: filing.filed_by,
    }));
    liveFixedAssets = (fixedAssetRows ?? []).map((asset: any) => ({
      id: asset.id, assetCode: asset.asset_code, assetName: asset.asset_name, category: asset.category,
      purchaseDate: asset.purchase_date, cost: Number(asset.cost ?? 0), depreciationMethod: asset.depreciation_method,
      usefulLifeYears: Number(asset.useful_life_years ?? 0), salvageValue: Number(asset.salvage_value ?? 0),
      accumulatedDepreciation: Number(asset.accumulated_depreciation ?? 0), currentValue: Number(asset.current_value ?? 0),
      branch: "All Locations", status: asset.status, notes: asset.notes ?? undefined,
    }));
    if (settingsRow) {
      liveAccountingSettings = {
        financialYearStart: settingsRow.financial_year_start,
        financialYearEnd: settingsRow.financial_year_end,
        periodLockDate: settingsRow.period_lock_date ?? "",
        defaultCurrency: settingsRow.default_currency,
        approvalThreshold: Number(settingsRow.approval_threshold ?? 0),
        autoJournalRules: {
          sales: settingsRow.auto_journal_sales, purchases: settingsRow.auto_journal_purchases,
          expenses: settingsRow.auto_journal_expenses, inventoryAdjustments: settingsRow.auto_journal_inventory, payroll: settingsRow.auto_journal_payroll,
        },
        numberSequences: {
          journalPrefix: settingsRow.sequence_prefix_journal, nextJournalNumber: 1,
          invoicePrefix: settingsRow.sequence_prefix_invoice, nextInvoiceNumber: 1,
          billPrefix: settingsRow.sequence_prefix_bill, nextBillNumber: 1, assetPrefix: "AST-", nextAssetNumber: 1,
        },
        exchangeRates: {}, taxRegistrationNumber: "",
      };
    }
    liveBankAccounts = (bankRows ?? []).map((bank: any) => ({
      id: bank.id, name: bank.name, bankName: bank.name, type: bank.account_type,
      bookBalance: Number(bank.current_balance ?? 0), statementBalance: Number(bank.current_balance ?? 0),
      difference: 0, status: "unreconciled",
    }));
    for (const transaction of transactionRows ?? []) {
      const list = liveBankTransactions[transaction.bank_account_id] ?? [];
      list.push({ id: transaction.id, date: transaction.transaction_date, reference: transaction.reference ?? "", description: transaction.description ?? "", amount: Number(transaction.amount ?? 0), type: transaction.type, matched: Boolean(transaction.matched) });
      liveBankTransactions[transaction.bank_account_id] = list;
    }
    if (accountsError) console.error("Failed to load accounting accounts:", accountsError);
    if (journalsError) console.error("Failed to load accounting journal entries:", journalsError);
    const allowedAccountingLocations = context.isBranchScoped ? new Set(context.allowedLocationIds) : null;
    const scopedAccountRows = (accountRows ?? []).filter((account: any) => !allowedAccountingLocations || !account.location_id || allowedAccountingLocations.has(account.location_id));
    const scopedJournalRows = (journalRows ?? []).filter((journal: any) => !allowedAccountingLocations || !journal.location_id || allowedAccountingLocations.has(journal.location_id));
    const accountNames = new Map(scopedAccountRows.map((account: any) => [account.id, account.name]));
    const locationRowsForAccounting = await accountingDb.from("business_locations").select("id, name").eq("org_id", context.orgId).eq("is_active", true);
    const locationNamesForAccounting = new Map((locationRowsForAccounting.data ?? []).map((location: any) => [location.id, location.name]));
    initialBranchOptions = (locationRowsForAccounting.data ?? [])
      .filter((location: any) => !context.isBranchScoped || context.allowedLocationIds.includes(location.id))
      .map((location: any) => ({ id: location.id, name: location.name }));
    liveAccounts = scopedAccountRows.map((account: any) => ({
      id: account.id,
      code: account.code,
      name: account.name,
      type: account.type,
      subType: account.sub_type ?? undefined,
      parentId: account.parent_id,
      branch: locationNamesForAccounting.get(account.location_id) ?? "All Locations",
      currency: account.currency ?? context.currency,
      balance: Number(account.current_balance ?? 0),
      status: account.is_active ? "active" : "inactive",
      description: account.description ?? undefined,
    }));
    liveJournalEntries = scopedJournalRows.map((journal: any) => ({
      id: journal.id,
      entryNumber: journal.entry_number,
      date: journal.entry_date,
      branch: locationNamesForAccounting.get(journal.location_id) ?? "All Locations",
      reference: journal.reference ?? "",
      description: journal.description,
      status: journal.status,
      totalDebit: Number(journal.total_debit ?? 0),
      totalCredit: Number(journal.total_credit ?? 0),
      sourceModule: journal.source_module ?? undefined,
      sourceId: journal.source_id ?? undefined,
      isAuto: journal.is_auto,
      postedBy: journal.posted_by ?? undefined,
      postedAt: journal.posted_at ?? undefined,
      lines: (journal.journal_entry_lines ?? []).map((line: any) => ({
        id: line.id,
        accountId: line.account_id,
        accountCode: scopedAccountRows.find((account: any) => account.id === line.account_id)?.code ?? "",
        accountName: accountNames.get(line.account_id) ?? "Unknown account",
        debit: Number(line.debit ?? 0),
        credit: Number(line.credit ?? 0),
        description: line.description ?? undefined,
      })),
    }));
    const reportFilters = { orgId: context.orgId, dateFrom, dateTo, locationId: context.masterLocationId, allowedLocationIds: context.isBranchScoped ? context.allowedLocationIds : undefined };
    const [reportKpis, balanceSheet, revenueExpenseSeries, expensesByCategory] = await Promise.all([
      getReportKpis(reportFilters),
      getBalanceSheet(reportFilters),
      getRevenueExpenseSeries(reportFilters, "monthly"),
      getExpensesByCategory(reportFilters),
    ]);
    liveFinancialSnapshot = {
      kpis: reportKpis,
      balanceSheet,
      periodLabel: `${dateFrom} to ${dateTo}`,
      revenueExpenseSeries,
      expensesByCategory,
    };
    const taxLocationFilter = context.isBranchScoped ? context.allowedLocationIds : null;
    const exclusiveDateTo = new Date(`${dateTo}T00:00:00.000Z`);
    exclusiveDateTo.setUTCDate(exclusiveDateTo.getUTCDate() + 1);
    const exclusiveDateToIso = exclusiveDateTo.toISOString();
    let salesTaxQuery = db.from("sales").select("total, tax_amount").eq("org_id", context.orgId).in("status", ["completed", "returned"]).gte("sale_date", dateFrom).lt("sale_date", exclusiveDateToIso);
    let purchasesTaxQuery = db.from("purchases").select("tax_amount").eq("org_id", context.orgId).neq("status", "cancelled").gte("purchase_date", dateFrom).lt("purchase_date", exclusiveDateToIso);
    if (taxLocationFilter) {
      salesTaxQuery = salesTaxQuery.in("location_id", taxLocationFilter);
      purchasesTaxQuery = purchasesTaxQuery.in("location_id", taxLocationFilter);
    }
    const [{ data: taxSales }, { data: taxPurchases }] = await Promise.all([salesTaxQuery, purchasesTaxQuery]);
    liveTaxSummary = {
      periodLabel: `${dateFrom} to ${dateTo}`,
      grossSales: (taxSales ?? []).reduce((sum, sale) => sum + Number(sale.total ?? 0), 0),
      outputTax: (taxSales ?? []).reduce((sum, sale) => sum + Number(sale.tax_amount ?? 0), 0),
      inputTax: (taxPurchases ?? []).reduce((sum, purchase) => sum + Number(purchase.tax_amount ?? 0), 0),
    };
    let locationsQuery = db.from("business_locations").select("id, name").eq("org_id", context.orgId).eq("is_active", true).order("name");
    if (context.isBranchScoped) locationsQuery = locationsQuery.in("id", context.allowedLocationIds);
    const { data: locations } = await locationsQuery;
    initialBranches = (locations ?? []).map((location) => location.name);
    const auditQuery = db.from("audit_logs").select("actor_id, action, entity_type, created_at, metadata").eq("org_id", context.orgId).order("created_at", { ascending: false }).limit(100);
    const paymentsQuery = db.from("customer_credit_payments").select("id, invoice_id, amount, payment_method, payment_date, recorded_by, location_id").eq("org_id", context.orgId).order("payment_date", { ascending: false });
    const salesQuery = db
      .from("sales")
      .select("id, sale_number, customer_id, customer_name, sale_date, total, amount_paid, location_id, location:business_locations(name)")
      .eq("org_id", context.orgId)
      .in("status", ["completed", "returned"])
      .order("sale_date", { ascending: false });
    const purchasesQuery = accountingDb
      .from("purchases")
      .select("id, purchase_number, purchase_date, invoice_number, total, paid_amount, expected_delivery_date, payment_method, location_id, scheduled_payment_date, scheduled_payment_method, supplier:suppliers(name), location:business_locations(name)")
      .eq("org_id", context.orgId)
      .neq("status", "cancelled")
      .order("purchase_date", { ascending: false });
    if (context.isBranchScoped) {
      paymentsQuery.in("location_id", context.allowedLocationIds);
      salesQuery.in("location_id", context.allowedLocationIds);
      purchasesQuery.in("location_id", context.allowedLocationIds);
    }
    const [{ data: auditLogs }, { data: payments }, { data: sales }, { data: purchases }] = await Promise.all([
      auditQuery,
      paymentsQuery,
      salesQuery,
      purchasesQuery,
    ]);
    initialAuditLogs = (auditLogs ?? [])
      .filter((log: any) => !context.isBranchScoped || context.allowedLocationIds.includes(log.metadata?.branch_id))
      .map((log: any) => ({
        userName: log.actor_id ?? "—",
        action: log.action,
        module: log.entity_type,
        createdAt: log.created_at,
        branchId: log.metadata?.branch_id,
      }));
    const recorderIds = [...new Set((payments ?? []).map((payment) => payment.recorded_by).filter(Boolean))];
    const { data: recorderProfiles } = recorderIds.length
      ? await db.from("profiles").select("id, full_name").in("id", recorderIds)
      : { data: [] };
    const recorderNames = new Map((recorderProfiles ?? []).map((profile) => [profile.id, profile.full_name]));
    initialPayments = (payments ?? []).map((payment) => ({
      id: payment.id,
      invoiceId: payment.invoice_id,
      amount: Number(payment.amount),
      paymentMethod: payment.payment_method,
      paymentDate: payment.payment_date,
      recordedBy: recorderNames.get(payment.recorded_by) ?? payment.recorded_by ?? "—",
    }));
    const payableToday = new Date();
    const paymentsByInvoice = new Map<string, number>();
    for (const payment of payments ?? []) {
      paymentsByInvoice.set(payment.invoice_id, (paymentsByInvoice.get(payment.invoice_id) ?? 0) + Number(payment.amount ?? 0));
    }
    initialReceivables = (sales ?? []).map((sale) => {
      const issueDate = sale.sale_date;
      const dueDate = issueDate;
      const totalAmount = Number(sale.total ?? 0);
      const invoiceNumber = `SALE-${sale.sale_number}`;
      const paidAmount = Math.min(totalAmount, (sale.amount_paid == null ? 0 : Number(sale.amount_paid)) + (paymentsByInvoice.get(invoiceNumber) ?? 0));
      const outstandingAmount = Math.max(0, totalAmount - paidAmount);
      const daysOutstanding = Math.max(0, Math.floor((payableToday.getTime() - new Date(dueDate).getTime()) / 86400000));
      const status: AccountsReceivableItem["status"] = outstandingAmount === 0
        ? "paid"
        : daysOutstanding > 120 ? "120+"
          : daysOutstanding > 90 ? "61-90"
            : daysOutstanding > 60 ? "61-90"
              : daysOutstanding > 30 ? "31-60"
                : daysOutstanding > 0 ? "1-30" : "current";
      const location = Array.isArray(sale.location) ? sale.location[0] : sale.location;
      return {
        id: sale.id,
        customerId: sale.customer_id ?? undefined,
        customerName: sale.customer_name ?? "Walk-in Customer",
        invoiceNumber,
        issueDate,
        dueDate,
        totalAmount,
        paidAmount,
        outstandingAmount,
        daysOutstanding,
        status,
        branch: location?.name ?? "Unassigned",
      };
    });
    const today = new Date();
    initialPayables = (purchases ?? []).map((purchase: any) => {
      const dueDate = purchase.expected_delivery_date ?? purchase.purchase_date;
      const outstandingAmount = Math.max(0, Number(purchase.total ?? 0) - Number(purchase.paid_amount ?? 0));
      const daysOutstanding = Math.max(0, Math.floor((today.getTime() - new Date(dueDate).getTime()) / 86400000));
      const status: AccountsPayableItem["status"] = outstandingAmount === 0
        ? "paid"
        : daysOutstanding > 60
          ? "over-60"
          : daysOutstanding > 30
            ? "31-60"
            : daysOutstanding > 0
              ? "1-30"
              : "current";
      const supplier = Array.isArray(purchase.supplier) ? purchase.supplier[0] : purchase.supplier;
      const location = Array.isArray(purchase.location) ? purchase.location[0] : purchase.location;
      return {
        id: purchase.id,
        supplierName: supplier?.name ?? "Unknown supplier",
        billNumber: purchase.invoice_number ?? `PUR-${purchase.purchase_number}`,
        billDate: purchase.purchase_date,
        dueDate,
        totalAmount: Number(purchase.total ?? 0),
        paidAmount: Number(purchase.paid_amount ?? 0),
        outstandingAmount,
        daysOutstanding,
        status,
        branch: location?.name ?? "Unassigned",
        paymentMethod: purchase.payment_method ?? undefined,
        scheduledDate: purchase.scheduled_payment_date ?? undefined,
      };
    });
  }
  return (
    <Suspense
      fallback={
        <div className="flex h-96 items-center justify-center">
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            <span>Loading ThinkSales Pro Accounting System...</span>
          </div>
        </div>
      }
    >
      <AccountingDashboard orgName={context?.orgName ?? "Organization"} initialPayables={initialPayables} initialBranches={initialBranches} initialBranchOptions={initialBranchOptions} initialReceivables={initialReceivables} initialAuditLogs={initialAuditLogs} initialPayments={initialPayments} liveFinancialSnapshot={liveFinancialSnapshot} liveAccounts={liveAccounts} liveJournalEntries={liveJournalEntries} liveTaxSummary={liveTaxSummary} liveTaxRates={liveTaxRates} liveTaxFilings={liveTaxFilings} liveBankAccounts={liveBankAccounts} liveBankTransactions={liveBankTransactions} liveFixedAssets={liveFixedAssets} liveAccountingSettings={liveAccountingSettings} initialDateFrom={dateFrom} initialDateTo={dateTo} liveCurrencyConfig={liveCurrencyConfig} />
    </Suspense>
  );
}