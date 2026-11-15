import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Landmark } from "lucide-react";
import {
  importEducationAccountingBankStatement,
  matchEducationAccountingBankLine,
  reconcileEducationAccountingBankStatement,
} from "../actions";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";

type SearchParams = { error?: string; imported?: string; matched?: string; reconciled?: string };
const fieldClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";

function amount(value: number) {
  return `${value < 0 ? "−" : ""}${(Math.abs(value) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function EducationBankReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_finance", "finance", "bank_reconciliation", "view")) {
    redirect("/dashboard?accessDenied=think-education.accounting");
  }

  const [{ campuses }, params, supabase, canImport, canMatch, canReconcile] = await Promise.all([
    getAccessibleEducationCampuses(context.orgId, context.userId),
    searchParams,
    createClient(),
    canTabPermission("education_finance", "finance", "bank_reconciliation", "create"),
    canTabPermission("education_finance", "finance", "bank_reconciliation", "edit"),
    canTabPermission("education_finance", "finance", "bank_reconciliation", "approve"),
  ]);
  const [accountsResult, statementsResult] = await Promise.all([
    supabase.from("education_accounting_accounts")
      .select("id, branch_id, code, name, is_cash_account")
      .eq("org_id", context.orgId)
      .eq("is_cash_account", true)
      .eq("is_active", true)
      .order("code"),
    supabase.from("education_accounting_bank_statements")
      .select("id, branch_id, account_id, period_starts_on, period_ends_on, opening_balance, closing_balance, status, created_at")
      .eq("org_id", context.orgId)
      .order("period_ends_on", { ascending: false })
      .limit(50),
  ]);
  if (accountsResult.error) throw new Error(`Could not load cash accounts for bank reconciliation: ${accountsResult.error.message}`);
  if (statementsResult.error) throw new Error(`Could not load Education bank statements: ${statementsResult.error.message}`);
  const accounts = accountsResult.data ?? [];
  const statements = statementsResult.data ?? [];
  const statementIds = statements.map((statement) => statement.id);
  const statementLines: Array<{
    id: string;
    statement_id: string;
    transaction_date: string;
    reference: string | null;
    description: string;
    amount: number;
    matched_journal_line_id: string | null;
  }> = [];
  for (let offset = 0; offset < statementIds.length; offset += 100) {
    for (let pageOffset = 0; ; pageOffset += 1000) {
      const { data, error } = await supabase.from("education_accounting_bank_statement_lines")
        .select("id, statement_id, transaction_date, reference, description, amount, matched_journal_line_id")
        .eq("org_id", context.orgId)
        .in("statement_id", statementIds.slice(offset, offset + 100))
        .order("statement_id")
        .order("transaction_date")
        .order("id")
        .range(pageOffset, pageOffset + 999);
      if (error) throw new Error(`Could not load imported bank statement rows: ${error.message}`);
      statementLines.push(...(data ?? []));
      if ((data?.length ?? 0) < 1000) break;
    }
  }

  const statementById = new Map(statements.map((statement) => [statement.id, statement]));
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const campusById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const unmatched = statementLines.filter((line) => !line.matched_journal_line_id);
  const dateFrom = statements.length ? statements.reduce((min, row) => row.period_starts_on < min ? row.period_starts_on : min, statements[0].period_starts_on) : null;
  const dateTo = statements.length ? statements.reduce((max, row) => row.period_ends_on > max ? row.period_ends_on : max, statements[0].period_ends_on) : null;
  const journals: Array<{ id: string; branch_id: string | null; entry_date: string; journal_number: number; status: string }> = [];
  if (dateFrom && dateTo) {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from("education_accounting_journals")
        .select("id, branch_id, entry_date, journal_number, status")
        .eq("org_id", context.orgId)
        .eq("status", "posted")
        .gte("entry_date", dateFrom)
        .lte("entry_date", dateTo)
        .order("entry_date")
        .order("id")
        .range(offset, offset + 999);
      if (error) throw new Error(`Could not load posted journals for bank matching: ${error.message}`);
      journals.push(...(data ?? []));
      if ((data?.length ?? 0) < 1000) break;
    }
  }
  const journalById = new Map(journals.map((journal) => [journal.id, journal]));
  const usedJournalLineIds = new Set(statementLines.flatMap((line) => line.matched_journal_line_id ? [line.matched_journal_line_id] : []));
  const candidateLines: Array<{ id: string; journal_id: string; account_id: string; debit: number; credit: number; reference: string | null }> = [];
  const journalIds = journals.map((journal) => journal.id);
  for (let offset = 0; accounts.length > 0 && offset < journalIds.length; offset += 200) {
    const { data, error } = await supabase.from("education_accounting_journal_lines")
      .select("id, journal_id, account_id, debit, credit")
      .eq("org_id", context.orgId)
      .in("journal_id", journalIds.slice(offset, offset + 200))
      .in("account_id", accounts.map((account) => account.id))
      .order("journal_id")
      .order("line_number");
    if (error) throw new Error(`Could not load account activity for bank matching: ${error.message}`);
    for (const line of data ?? []) {
      const journal = journalById.get(line.journal_id);
      if (journal) candidateLines.push({ ...line, reference: null });
    }
  }

  const errorMessage = params.error === "permission"
    ? "You are not authorized for that bank reconciliation action."
    : params.error === "invalid"
      ? "Select an accessible campus and cash/bank account, valid dates and balances, and a CSV file no larger than 5 MB."
      : params.error === "csv"
        ? "CSV must have date, description, amount, and optional reference columns. Dates must be YYYY-MM-DD and amounts signed."
        : params.error === "import"
          ? "The statement could not be imported. Check for overlapping statements and verify opening plus transactions equals closing."
          : params.error === "match"
            ? "That bank row could not be matched to the selected posted journal line."
            : params.error === "reconcile"
              ? "Reconciliation failed. Match all statement rows and verify the adjusted bank balance equals the ledger balance."
              : null;

  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;
  return (
    <main className="mx-auto w-full max-w-[1400px] space-y-6 p-4 md:p-6">
      <header>
        <Link href={getProductAppPath("think-education", "/accounting")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
          <ArrowLeft className="h-4 w-4" /> Accounting
        </Link>
        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-blue-700">Think Education · Cash &amp; Banking</p>
        <h1 className="mt-1 flex items-center gap-2 text-3xl font-semibold tracking-tight text-slate-950">
          <Landmark className="h-7 w-7 text-blue-700" /> Bank Reconciliation
        </h1>
        <p className="mt-1 text-sm text-slate-600">Import a signed-amount CSV, match statement activity to posted cash-account lines, and reconcile the adjusted balance.</p>
      </header>

      {params.imported && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Bank statement imported. Unique matches were applied automatically where possible.</p>}
      {params.matched && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Statement row matched.</p>}
      {params.reconciled && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Bank statement reconciled and locked.</p>}
      {errorMessage && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{errorMessage}</p>}

      {canImport && (
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-950">Import statement CSV</h2>
          <p className="text-sm text-slate-600">Use columns <code>date,description,amount,reference</code>. Positive amounts are deposits/increases to the bank; negative amounts are withdrawals. The CSV must include the complete statement period.</p>
          {accounts.length === 0 && <p className="text-sm text-amber-800">Mark an active asset account as Cash/Bank in the Chart of Accounts before importing.</p>}
          {campuses.length === 0 && <p className="text-sm text-amber-800">Assign campus accounting access before importing statements.</p>}
          {accounts.length > 0 && campuses.length > 0 && (
            <form action={importEducationAccountingBankStatement} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-sm font-medium text-slate-700">Campus
                <select required name="branchId" defaultValue={campuses[0].id} className={fieldClass}>
                  {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">Cash/bank account
                <select required name="accountId" defaultValue="" className={fieldClass}>
                  <option value="">Select account</option>
                  {accounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">Period starts
                <input required name="startsOn" type="date" defaultValue={monthStart} className={fieldClass} />
              </label>
              <label className="text-sm font-medium text-slate-700">Period ends
                <input required name="endsOn" type="date" defaultValue={today} className={fieldClass} />
              </label>
              <label className="text-sm font-medium text-slate-700">Opening balance
                <input required name="openingBalance" type="number" step="0.01" inputMode="decimal" className={fieldClass} />
              </label>
              <label className="text-sm font-medium text-slate-700">Closing balance
                <input required name="closingBalance" type="number" step="0.01" inputMode="decimal" className={fieldClass} />
              </label>
              <label className="text-sm font-medium text-slate-700 sm:col-span-2">CSV file (max 5 MB)
                <input required name="file" type="file" accept=".csv,text/csv" className={`${fieldClass} file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-1 file:text-sm file:font-semibold file:text-blue-700`} />
              </label>
              <div className="sm:col-span-2 lg:col-span-4">
                <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Import and auto-match</button>
              </div>
            </form>
          )}
        </section>
      )}

      <section className="space-y-4">
        {statements.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">No bank statements have been imported.</div>
        ) : statements.map((statement) => {
          const account = accountById.get(statement.account_id);
          const lines = statementLines.filter((line) => line.statement_id === statement.id);
          const unmatchedLines = lines.filter((line) => !line.matched_journal_line_id);
          const campus = campusById.get(statement.branch_id) ?? "Assigned campus";
          return (
            <article key={statement.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-4">
                <div>
                  <h2 className="font-semibold text-slate-950">{account ? `${account.code} · ${account.name}` : "Cash account"}</h2>
                  <p className="mt-1 text-sm text-slate-500">{campus} · {statement.period_starts_on} — {statement.period_ends_on}</p>
                  <p className="mt-1 text-xs text-slate-500">Opening {Number(statement.opening_balance).toFixed(2)} · Closing {Number(statement.closing_balance).toFixed(2)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statement.status === "reconciled" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
                    {statement.status === "reconciled" ? "Reconciled" : `${lines.length - unmatchedLines.length}/${lines.length} matched`}
                  </span>
                  {statement.status === "open" && canReconcile && (
                    <form action={reconcileEducationAccountingBankStatement} className="flex items-end gap-2">
                      <input type="hidden" name="statementId" value={statement.id} />
                      <label className="text-xs font-medium text-slate-600">Reconciliation note
                        <input required name="reason" minLength={3} maxLength={500} className="mt-1 w-56 rounded border border-slate-300 px-2 py-1.5" />
                      </label>
                      <button type="submit" className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800">Reconcile</button>
                    </form>
                  )}
                </div>
              </header>
              {lines.length === 0 ? <p className="p-4 text-sm text-slate-500">This statement has no rows.</p> : (
                <div className="divide-y divide-slate-100">
                  {lines.map((line) => {
                    const statementRow = statementById.get(line.statement_id);
                    const candidates = candidateLines.filter((candidate) =>
                      candidate.account_id === statement.account_id
                      && !usedJournalLineIds.has(candidate.id)
                      && Number(candidate.debit) - Number(candidate.credit) === Number(line.amount)
                      && (journalById.get(candidate.journal_id)?.branch_id === null
                        || journalById.get(candidate.journal_id)?.branch_id === statement.branch_id)
                      && (journalById.get(candidate.journal_id)?.entry_date ?? "") >= (statementRow?.period_starts_on ?? "")
                      && (journalById.get(candidate.journal_id)?.entry_date ?? "") <= (statementRow?.period_ends_on ?? "")
                    );
                    return (
                      <div key={line.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{line.transaction_date} · {line.description}</p>
                          <p className="text-xs text-slate-500">{line.reference ? `Ref ${line.reference} · ` : ""}{amount(Math.round(Number(line.amount) * 100))}</p>
                        </div>
                        {line.matched_journal_line_id ? (
                          <span className="text-xs font-semibold text-emerald-700">Matched</span>
                        ) : canMatch ? (
                          <form action={matchEducationAccountingBankLine} className="flex flex-wrap items-end gap-2">
                            <input type="hidden" name="statementLineId" value={line.id} />
                            <label className="text-xs font-medium text-slate-600">Posted ledger line
                              <select required name="journalLineId" defaultValue="" className="mt-1 min-w-72 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900">
                                <option value="">Select matching entry</option>
                                {candidates.map((candidate) => {
                                  const journal = journalById.get(candidate.journal_id);
                                  return <option key={candidate.id} value={candidate.id}>{journal?.entry_date} · EDU-JE-{String(journal?.journal_number ?? 0).padStart(6, "0")} · {amount(Math.round((Number(candidate.debit) - Number(candidate.credit)) * 100))}</option>;
                                })}
                              </select>
                            </label>
                            <button type="submit" className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Match</button>
                          </form>
                        ) : <span className="text-xs text-amber-800">Unmatched</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </article>
          );
        })}
      </section>
    </main>
  );
}
