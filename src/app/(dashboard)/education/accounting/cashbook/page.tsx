import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BookOpen } from "lucide-react";
import { calculateEducationLedger } from "@/lib/education/accounting-ledger";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";

type SearchParams = { account?: string; from?: string; to?: string };

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

function balance(cents: number) {
  return `${cents < 0 ? "Cr" : "Dr"} ${amount(cents)}`;
}

export default async function EducationCashbookPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_finance", "finance", "general_ledger", "view")) {
    redirect("/dashboard?accessDenied=think-education.accounting");
  }

  const [params, supabase, { campuses }, canExport] = await Promise.all([
    searchParams,
    createClient(),
    getAccessibleEducationCampuses(context.orgId, context.userId),
    canTabPermission("education_finance", "finance", "general_ledger", "export"),
  ]);
  const { data: accounts, error: accountsError } = await supabase.from("education_accounting_accounts")
    .select("id, branch_id, code, name, normal_balance, is_active")
    .eq("org_id", context.orgId)
    .eq("is_cash_account", true)
    .order("code");
  if (accountsError) throw new Error(`Could not load cash accounts for the Education Cashbook: ${accountsError.message}`);

  const availableAccounts = accounts ?? [];
  const requestedAccount = typeof params.account === "string" ? params.account : "";
  const selectedAccount = requestedAccount
    ? availableAccounts.find((account) => account.id === requestedAccount)
    : availableAccounts.find((account) => account.is_active) ?? availableAccounts[0];
  const today = new Date().toISOString().slice(0, 10);
  const defaultFrom = `${today.slice(0, 4)}-01-01`;
  const fromDate = isDate(params.from) ? params.from : defaultFrom;
  const toDate = isDate(params.to) && params.to >= fromDate ? params.to : today;
  const campusNames = new Map(campuses.map((campus) => [campus.id, campus.name]));
  let visibleEntries: Array<{
    id: string;
    entryDate: string;
    journalNumber: number;
    lineNumber: number;
    description: string;
    debitCents: number;
    creditCents: number;
    runningBalanceCents: number;
    branchName: string;
  }> = [];
  let openingBalance = 0;
  let closingBalance = 0;

  if (selectedAccount) {
    const rawLines: Array<{
      id: string;
      journal_id: string;
      line_number: number;
      description: string | null;
      debit: number;
      credit: number;
    }> = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from("education_accounting_journal_lines")
        .select("id, journal_id, line_number, description, debit, credit")
        .eq("org_id", context.orgId)
        .eq("account_id", selectedAccount.id)
        .order("journal_id")
        .order("line_number")
        .range(offset, offset + 999);
      if (error) throw new Error(`Could not load Education Cashbook lines: ${error.message}`);
      rawLines.push(...(data ?? []));
      if ((data?.length ?? 0) < 1000) break;
    }

    const journalIds = Array.from(new Set(rawLines.map((line) => line.journal_id)));
    const journals: Array<{
      id: string;
      journal_number: number;
      branch_id: string | null;
      entry_date: string;
      description: string;
      status: string;
    }> = [];
    for (let offset = 0; offset < journalIds.length; offset += 200) {
      const { data, error } = await supabase.from("education_accounting_journals")
        .select("id, journal_number, branch_id, entry_date, description, status")
        .eq("org_id", context.orgId)
        .eq("status", "posted")
        .lte("entry_date", toDate)
        .in("id", journalIds.slice(offset, offset + 200));
      if (error) throw new Error(`Could not load posted journals for the Education Cashbook: ${error.message}`);
      journals.push(...(data ?? []));
    }

    const journalById = new Map(journals.map((journal) => [journal.id, journal]));
    const journalIdByLineId = new Map(rawLines.map((line) => [line.id, line.journal_id]));
    const ledger = calculateEducationLedger(rawLines.flatMap((line) => {
      const journal = journalById.get(line.journal_id);
      if (!journal) return [];
      return [{
        id: line.id,
        entryDate: journal.entry_date,
        journalNumber: journal.journal_number,
        lineNumber: line.line_number,
        debit: line.debit,
        credit: line.credit,
        description: line.description || journal.description,
      }];
    }), selectedAccount.normal_balance);
    openingBalance = ledger.filter((entry) => entry.entryDate < fromDate).at(-1)?.runningBalanceCents ?? 0;
    closingBalance = ledger.filter((entry) => entry.entryDate <= toDate).at(-1)?.runningBalanceCents ?? 0;
    visibleEntries = ledger.flatMap((entry) => {
      const journal = journalById.get(journalIdByLineId.get(entry.id) ?? "");
      if (!journal || entry.entryDate < fromDate || entry.entryDate > toDate) return [];
      return [{
        ...entry,
        branchName: journal.branch_id ? campusNames.get(journal.branch_id) ?? "Assigned campus" : "All campuses",
      }];
    });
  }

  const periodDebits = visibleEntries.reduce((sum, entry) => sum + entry.debitCents, 0);
  const periodCredits = visibleEntries.reduce((sum, entry) => sum + entry.creditCents, 0);
  const csvRows = [
    ["Date", "Campus", "Journal", "Description", "Money in", "Money out", "Running balance"],
    ...visibleEntries.map((entry) => [
      entry.entryDate,
      entry.branchName,
      `EDU-JE-${String(entry.journalNumber).padStart(6, "0")}`,
      entry.description,
      entry.debitCents ? (entry.debitCents / 100).toFixed(2) : "",
      entry.creditCents ? (entry.creditCents / 100).toFixed(2) : "",
      (entry.runningBalanceCents / 100).toFixed(2),
    ]),
  ];
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(csvRows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n"))}`;

  return (
    <main className="mx-auto w-full max-w-[1450px] space-y-6 p-4 md:p-6">
      <header>
        <Link href={getProductAppPath("think-education", "/accounting")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
          <ArrowLeft className="h-4 w-4" /> Accounting
        </Link>
        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-blue-700">Think Education · Cash &amp; Banking</p>
        <h1 className="mt-1 flex items-center gap-2 text-3xl font-semibold tracking-tight text-slate-950">
          <BookOpen className="h-7 w-7 text-blue-700" /> Cashbook
        </h1>
        <p className="mt-1 text-sm text-slate-600">Review posted cash and bank ledger activity, with running balances and exportable period totals.</p>
      </header>

      <form method="get" className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm font-medium text-slate-700">Cash/bank account
          <select required name="account" defaultValue={selectedAccount?.id ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900">
            <option value="">Select account</option>
            {availableAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}{account.is_active ? "" : " (inactive)"}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">From
          <input type="date" name="from" defaultValue={fromDate} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
        </label>
        <label className="text-sm font-medium text-slate-700">To
          <input type="date" name="to" defaultValue={toDate} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
        </label>
        <div className="flex items-end">
          <button type="submit" className="w-full rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">View Cashbook</button>
        </div>
      </form>

      {requestedAccount && !selectedAccount && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">That cash or bank account is not available in your campus scope.</p>}
      {!availableAccounts.length && <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">Create an asset account and mark it Cash/Bank in the Chart of Accounts to use the Cashbook.</p>}

      {selectedAccount && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Account", value: `${selectedAccount.code} · ${selectedAccount.name}` },
              { label: "Opening balance", value: balance(openingBalance) },
              { label: "Money in", value: amount(periodDebits) },
              { label: "Money out", value: amount(periodCredits) },
            ].map((metric) => (
              <article key={metric.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-sm text-slate-500">{metric.label}</p>
                <p className="mt-1 font-semibold text-slate-950">{metric.value}</p>
              </article>
            ))}
          </section>
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="font-semibold text-slate-950">Posted transactions</h2>
                <p className="text-sm text-slate-500">{fromDate} — {toDate}</p>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-sm font-medium text-slate-700">Closing balance: {balance(closingBalance)}</p>
                {canExport && visibleEntries.length > 0 && <a href={csvHref} download={`education-cashbook-${new Date().toISOString().slice(0, 10)}.csv`} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Export CSV</a>}
              </div>
            </div>
            {visibleEntries.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-slate-600">No posted transactions for this account and date range.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[950px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Date / campus</th>
                      <th className="px-4 py-3">Journal</th>
                      <th className="px-4 py-3">Description</th>
                      <th className="px-4 py-3 text-right">Money in</th>
                      <th className="px-4 py-3 text-right">Money out</th>
                      <th className="px-4 py-3 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {visibleEntries.map((entry) => (
                      <tr key={entry.id}>
                        <td className="px-4 py-3">{entry.entryDate}<p className="text-xs text-slate-500">{entry.branchName}</p></td>
                        <td className="px-4 py-3 font-mono text-xs text-blue-700">EDU-JE-{String(entry.journalNumber).padStart(6, "0")}</td>
                        <td className="px-4 py-3">{entry.description}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{entry.debitCents ? amount(entry.debitCents) : "—"}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{entry.creditCents ? amount(entry.creditCents) : "—"}</td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">{balance(entry.runningBalanceCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 font-semibold text-slate-800">
                    <tr>
                      <td colSpan={3} className="px-4 py-3">Period totals</td>
                      <td className="px-4 py-3 text-right tabular-nums">{amount(periodDebits)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{amount(periodCredits)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{balance(closingBalance)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>
        </>
      )}
      <p className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-950">
        The Cashbook is a ledger report: it includes posted activity only. Record receipts and payments through their source workflows or journal entries; draft journals are not included.
      </p>
    </main>
  );
}
