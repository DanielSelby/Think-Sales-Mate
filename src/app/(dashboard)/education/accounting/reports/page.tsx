import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, FileBarChart } from "lucide-react";
import {
  buildEducationBalanceSheet,
  buildEducationCashFlow,
  buildEducationIncomeStatement,
  buildEducationTrialBalance,
  type EducationAccountBalance,
  type EducationReportAccount,
  type EducationReportLine,
} from "@/lib/education/accounting-reports";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";

type ReportType = "trial-balance" | "income-statement" | "balance-sheet" | "cash-flow";
type SearchParams = { type?: string; from?: string; to?: string };

const reportOptions: Array<{ value: ReportType; label: string }> = [
  { value: "trial-balance", label: "Trial Balance" },
  { value: "income-statement", label: "Income Statement" },
  { value: "balance-sheet", label: "Balance Sheet" },
  { value: "cash-flow", label: "Cash Flow Summary" },
];

function isDate(value: string | undefined): value is string {
  if (!value) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(parsed.valueOf())
    && parsed.toISOString().slice(0, 10) === value;
}

function amount(cents: number) {
  return (Math.abs(cents) / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function signedAmount(cents: number) {
  return `${cents < 0 ? "−" : ""}${amount(cents)}`;
}

function balanceColumns(row: EducationAccountBalance) {
  return {
    debit: row.debitCents ? amount(row.debitCents) : "—",
    credit: row.creditCents ? amount(row.creditCents) : "—",
  };
}

function AccountRows({ rows }: { rows: EducationAccountBalance[] }) {
  return rows.length === 0 ? (
    <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">No balances in this date range.</td></tr>
  ) : rows.map((row) => {
    const columns = balanceColumns(row);
    return (
      <tr key={row.account.id}>
        <td className="px-4 py-3 font-mono text-xs">{row.account.code}</td>
        <td className="px-4 py-3">{row.account.name}</td>
        <td className="px-4 py-3 text-right tabular-nums">{columns.debit}</td>
        <td className="px-4 py-3 text-right tabular-nums">{columns.credit}</td>
      </tr>
    );
  });
}

export default async function EducationAccountingReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_finance", "finance", "financial_reports", "view")) {
    redirect("/dashboard?accessDenied=think-education.accounting");
  }

  const [params, supabase] = await Promise.all([searchParams, createClient()]);
  const reportType = reportOptions.find((report) => report.value === params.type)?.value ?? "trial-balance";
  const [accountsResult, yearsResult] = await Promise.all([
    supabase.from("education_accounting_accounts")
      .select("id, code, name, account_type, normal_balance, is_cash_account, cash_flow_activity")
      .eq("org_id", context.orgId)
      .order("code"),
    supabase.from("education_accounting_fiscal_years")
      .select("starts_on, ends_on")
      .eq("org_id", context.orgId)
      .order("starts_on", { ascending: false }),
  ]);
  if (accountsResult.error) throw new Error(`Could not load accounts for financial reports: ${accountsResult.error.message}`);
  if (yearsResult.error) throw new Error(`Could not load fiscal years for financial reports: ${yearsResult.error.message}`);

  const today = new Date().toISOString().slice(0, 10);
  const fiscalStart = (yearsResult.data ?? []).find((year) => year.starts_on <= today && year.ends_on >= today)?.starts_on
    ?? (yearsResult.data ?? []).find((year) => year.starts_on <= today)?.starts_on
    ?? yearsResult.data?.[0]?.starts_on
    ?? `${today.slice(0, 4)}-01-01`;
  const fromDate = isDate(params.from) ? params.from : fiscalStart;
  const toDate = isDate(params.to) && params.to >= fromDate ? params.to : today;
  const accounts = (accountsResult.data ?? []) as EducationReportAccount[];

  const journalHeaders: Array<{ id: string; entry_date: string }> = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from("education_accounting_journals")
      .select("id, entry_date")
      .eq("org_id", context.orgId)
      .eq("status", "posted")
      .lte("entry_date", toDate)
      .order("entry_date")
      .order("id")
      .range(offset, offset + 999);
    if (error) throw new Error(`Could not load posted journals for financial reports: ${error.message}`);
    journalHeaders.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) break;
  }

  const entryDateByJournal = new Map(journalHeaders.map((journal) => [journal.id, journal.entry_date]));
  const lines: EducationReportLine[] = [];
  const journalIds = journalHeaders.map((journal) => journal.id);
  for (let offset = 0; offset < journalIds.length; offset += 200) {
    const { data, error } = await supabase.from("education_accounting_journal_lines")
      .select("id, journal_id, account_id, debit, credit")
      .eq("org_id", context.orgId)
      .in("journal_id", journalIds.slice(offset, offset + 200))
      .order("journal_id")
      .order("line_number");
    if (error) throw new Error(`Could not load journal lines for financial reports: ${error.message}`);
    for (const line of data ?? []) {
      const entryDate = entryDateByJournal.get(line.journal_id);
      if (entryDate) lines.push({ ...line, entry_date: entryDate });
    }
  }

  const allToDate = lines.filter((line) => line.entry_date <= toDate);
  const inRange = lines.filter((line) => line.entry_date >= fromDate && line.entry_date <= toDate);
  const earningsFrom = (yearsResult.data ?? []).find((year) => year.starts_on <= toDate && year.ends_on >= toDate)?.starts_on ?? fromDate;
  const earningsLines = lines.filter((line) => line.entry_date >= earningsFrom && line.entry_date <= toDate);
  const trialBalance = buildEducationTrialBalance(accounts, allToDate);
  const trialDebits = trialBalance.reduce((sum, row) => sum + row.debitCents, 0);
  const trialCredits = trialBalance.reduce((sum, row) => sum + row.creditCents, 0);
  const incomeStatement = buildEducationIncomeStatement(accounts, inRange);
  const balanceSheet = buildEducationBalanceSheet(accounts, allToDate, earningsLines);
  const cashFlow = buildEducationCashFlow(accounts, inRange);
  const activeReport = reportOptions.find((report) => report.value === reportType)?.label ?? "Trial Balance";

  return (
    <main className="mx-auto w-full max-w-[1300px] space-y-6 p-4 md:p-6">
      <header>
        <Link href={getProductAppPath("think-education", "/accounting")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
          <ArrowLeft className="h-4 w-4" /> Accounting
        </Link>
        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-blue-700">Think Education · Financial reporting</p>
        <h1 className="mt-1 flex items-center gap-2 text-3xl font-semibold tracking-tight text-slate-950">
          <FileBarChart className="h-7 w-7 text-blue-700" /> {activeReport}
        </h1>
      </header>

      <form method="get" className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm font-medium text-slate-700">Report
          <select name="type" defaultValue={reportType} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900">
            {reportOptions.map((report) => <option key={report.value} value={report.value}>{report.label}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">From
          <input type="date" name="from" defaultValue={fromDate} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
        </label>
        <label className="text-sm font-medium text-slate-700">Through
          <input type="date" name="to" defaultValue={toDate} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
        </label>
        <div className="flex items-end">
          <button type="submit" className="w-full rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Run report</button>
        </div>
      </form>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold text-slate-950">{activeReport}</h2>
          <p className="text-sm text-slate-500">
            {reportType === "trial-balance" || reportType === "balance-sheet" ? `As of ${toDate}` : `${fromDate} through ${toDate}`}
            {" · values use your campus access scope"}
          </p>
        </div>

        {reportType === "trial-balance" && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Code</th><th className="px-4 py-3">Account</th><th className="px-4 py-3 text-right">Debit</th><th className="px-4 py-3 text-right">Credit</th></tr></thead>
                <tbody className="divide-y divide-slate-100 text-slate-700"><AccountRows rows={trialBalance} /></tbody>
                <tfoot className="bg-slate-50 font-semibold text-slate-900"><tr><td colSpan={2} className="px-4 py-3">Totals</td><td className="px-4 py-3 text-right tabular-nums">{amount(trialDebits)}</td><td className="px-4 py-3 text-right tabular-nums">{amount(trialCredits)}</td></tr></tfoot>
              </table>
            </div>
            {trialDebits !== trialCredits && <p role="alert" className="border-t border-rose-200 bg-rose-50 px-5 py-3 text-sm text-rose-900">Debits and credits do not balance in the visible posting scope. Review opening balances and journal access.</p>}
          </>
        )}

        {reportType === "income-statement" && (
          <div className="space-y-5 p-4">
            <ReportSection title="Income" rows={incomeStatement.income} total={incomeStatement.incomeCents} normal="credit" />
            <ReportSection title="Expenses" rows={incomeStatement.expenses} total={incomeStatement.expensesCents} normal="debit" />
            <div className="flex justify-between rounded-lg bg-slate-50 px-4 py-3 font-semibold text-slate-900">
              <span>Net income</span><span>{signedAmount(incomeStatement.netIncomeCents)}</span>
            </div>
          </div>
        )}

        {reportType === "balance-sheet" && (
          <div className="space-y-5 p-4">
            <ReportSection title="Assets" rows={balanceSheet.assets} total={balanceSheet.assetsCents} normal="debit" />
            <ReportSection title="Liabilities" rows={balanceSheet.liabilities} total={balanceSheet.liabilitiesCents} normal="credit" />
            <ReportSection title="Equity" rows={balanceSheet.equity} total={balanceSheet.equityCents} normal="credit" />
            <div className="flex justify-between rounded-lg bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
              <span>Current fiscal-year earnings</span><span>{signedAmount(balanceSheet.currentEarningsCents)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 px-4 pt-4 font-bold text-slate-950">
              <span>Liabilities and equity</span><span>{signedAmount(balanceSheet.liabilitiesCents + balanceSheet.equityCents)}</span>
            </div>
            {balanceSheet.assetsCents !== balanceSheet.liabilitiesCents + balanceSheet.equityCents && (
              <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                Assets do not equal liabilities and equity in this visible posting scope. Review opening balances and account classifications.
              </p>
            )}
          </div>
        )}

        {reportType === "cash-flow" && (
          <dl className="grid gap-3 p-4 sm:grid-cols-2">
            {[
              ["Operating", cashFlow.operatingCents],
              ["Investing", cashFlow.investingCents],
              ["Financing", cashFlow.financingCents],
              ["Unclassified", cashFlow.unclassifiedCents],
            ].map(([label, total]) => (
              <div key={label} className="rounded-xl border border-slate-200 p-4">
                <dt className="text-sm text-slate-500">{label} cash movement</dt>
                <dd className="mt-1 text-xl font-semibold tabular-nums text-slate-950">{signedAmount(Number(total))}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <p className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-950">
        Reports are calculated from posted journals visible to your campus scope. Existing fees and expenses appear only after mappings are configured and the records are backfilled. Cash flow categories depend on account classifications; unclassified activity is shown separately.
      </p>
    </main>
  );
}

function ReportSection({
  title,
  rows,
  total,
  normal,
}: {
  title: string;
  rows: EducationAccountBalance[];
  total: number;
  normal: "debit" | "credit";
}) {
  return (
    <section>
      <h3 className="mb-2 font-semibold text-slate-900">{title}</h3>
      <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {rows.length === 0 ? <p className="px-3 py-4 text-sm text-slate-500">No accounts in this range.</p> : rows.map((row) => (
          <div key={row.account.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
            <span><span className="mr-2 font-mono text-xs text-slate-500">{row.account.code}</span>{row.account.name}</span>
            <span className="tabular-nums">{signedAmount(normal === "debit" ? row.debitCents - row.creditCents : row.creditCents - row.debitCents)}</span>
          </div>
        ))}
        <div className="flex justify-between bg-slate-50 px-3 py-2.5 text-sm font-semibold">
          <span>Total {title.toLowerCase()}</span><span>{signedAmount(total)}</span>
        </div>
      </div>
    </section>
  );
}
