import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BookOpen } from "lucide-react";
import { calculateEducationLedger } from "@/lib/education/accounting-ledger";
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

function balance(cents: number, normalBalance: "debit" | "credit") {
  const isNormal = cents >= 0;
  const side = isNormal ? normalBalance : normalBalance === "debit" ? "credit" : "debit";
  return `${side === "debit" ? "Dr" : "Cr"} ${amount(cents)}`;
}

export default async function EducationGeneralLedgerPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_finance", "finance", "general_ledger", "view")) {
    redirect("/dashboard?accessDenied=think-education.accounting");
  }

  const [params, supabase] = await Promise.all([
    searchParams,
    createClient(),
  ]);
  const [accountsResult, yearsResult] = await Promise.all([
    supabase.from("education_accounting_accounts")
      .select("id, branch_id, code, name, account_type, normal_balance, is_active")
      .eq("org_id", context.orgId)
      .order("code"),
    supabase.from("education_accounting_fiscal_years")
      .select("id, name, starts_on, ends_on")
      .eq("org_id", context.orgId)
      .order("starts_on", { ascending: false }),
  ]);
  if (accountsResult.error) throw new Error(`Could not load accounts for the Education General Ledger: ${accountsResult.error.message}`);
  if (yearsResult.error) throw new Error(`Could not load fiscal years for the Education General Ledger: ${yearsResult.error.message}`);

  const accounts = accountsResult.data ?? [];
  const selectedAccount = accounts.find((account) => account.id === params.account);
  const today = new Date().toISOString().slice(0, 10);
  const years = yearsResult.data ?? [];
  const defaultYearStart = years.find((year) => year.starts_on <= today && year.ends_on >= today)?.starts_on
    ?? years.find((year) => year.starts_on <= today)?.starts_on
    ?? years[0]?.starts_on
    ?? `${today.slice(0, 4)}-01-01`;
  const defaultFrom = defaultYearStart > today ? today : defaultYearStart;
  const requestedFrom = isDate(params.from) ? params.from : defaultFrom;
  const fromDate = requestedFrom > today ? today : requestedFrom;
  const toDate = isDate(params.to) && params.to >= fromDate ? params.to : today;
  let ledgerEntries: ReturnType<typeof calculateEducationLedger> = [];

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
      if (error) throw new Error(`Could not load General Ledger lines: ${error.message}`);
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
      const idChunk = journalIds.slice(offset, offset + 200);
      const { data, error } = await supabase.from("education_accounting_journals")
        .select("id, journal_number, branch_id, entry_date, description, status")
        .eq("org_id", context.orgId)
        .eq("status", "posted")
        .lte("entry_date", toDate)
        .in("id", idChunk);
      if (error) throw new Error(`Could not load posted Education journals: ${error.message}`);
      journals.push(...(data ?? []));
    }

    const journalsById = new Map(journals.map((journal) => [journal.id, journal]));
    ledgerEntries = calculateEducationLedger(rawLines.flatMap((line) => {
      const journal = journalsById.get(line.journal_id);
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
  }

  const visibleEntries = ledgerEntries.filter((entry) => entry.entryDate >= fromDate && entry.entryDate <= toDate);
  const openingEntry = ledgerEntries.filter((entry) => entry.entryDate < fromDate).at(-1);
  const openingBalance = openingEntry?.runningBalanceCents ?? 0;
  const closingBalance = ledgerEntries.filter((entry) => entry.entryDate <= toDate).at(-1)?.runningBalanceCents ?? 0;
  const periodDebits = visibleEntries.reduce((sum, entry) => sum + entry.debitCents, 0);
  const periodCredits = visibleEntries.reduce((sum, entry) => sum + entry.creditCents, 0);

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-6 p-4 md:p-6">
      <header>
        <Link href={getProductAppPath("think-education", "/accounting")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
          <ArrowLeft className="h-4 w-4" /> Accounting
        </Link>
        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-blue-700">Think Education · General accounting</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">General Ledger</h1>
        <p className="mt-1 text-sm text-slate-600">Account activity and balances from posted manual journals within your campus scope.</p>
      </header>

      <form method="get" className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm font-medium text-slate-700">
          Account
          <select required name="account" defaultValue={selectedAccount?.id ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900">
            <option value="">Select account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.code} · {account.name}{account.is_active ? "" : " (inactive)"}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          From
          <input type="date" name="from" defaultValue={fromDate} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
        </label>
        <label className="text-sm font-medium text-slate-700">
          To
          <input type="date" name="to" defaultValue={toDate} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
        </label>
        <div className="flex items-end">
          <button type="submit" className="w-full rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">View ledger</button>
        </div>
      </form>

      {params.account && !selectedAccount && (
        <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          That account is not available in your campus scope.
        </p>
      )}

      {selectedAccount ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Account", value: `${selectedAccount.code} · ${selectedAccount.name}` },
              { label: "Opening balance", value: balance(openingBalance, selectedAccount.normal_balance) },
              { label: "Period debits", value: amount(periodDebits) },
              { label: "Period credits", value: amount(periodCredits) },
            ].map((metric) => (
              <article key={metric.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-sm text-slate-500">{metric.label}</p>
                <p className="mt-1 font-semibold text-slate-950">{metric.value}</p>
              </article>
            ))}
          </section>
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4">
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-blue-700" />
                <h2 className="font-semibold text-slate-950">Ledger activity</h2>
              </div>
              <p className="text-sm font-medium text-slate-700">Closing balance: {balance(closingBalance, selectedAccount.normal_balance)}</p>
            </div>
            {visibleEntries.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-slate-600">No posted journal activity for this account and date range.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[850px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Date / journal</th>
                      <th className="px-4 py-3">Description</th>
                      <th className="px-4 py-3 text-right">Debit</th>
                      <th className="px-4 py-3 text-right">Credit</th>
                      <th className="px-4 py-3 text-right">Running balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {visibleEntries.map((entry) => (
                      <tr key={entry.id}>
                        <td className="px-4 py-3">
                          <p>{entry.entryDate}</p>
                          <p className="font-mono text-xs text-blue-700">EDU-JE-{String(entry.journalNumber).padStart(6, "0")}</p>
                        </td>
                        <td className="px-4 py-3">{entry.description}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{entry.debitCents ? amount(entry.debitCents) : "—"}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{entry.creditCents ? amount(entry.creditCents) : "—"}</td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">{balance(entry.runningBalanceCents, selectedAccount.normal_balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 font-semibold text-slate-800">
                    <tr>
                      <td colSpan={2} className="px-4 py-3">Period totals</td>
                      <td className="px-4 py-3 text-right tabular-nums">{amount(periodDebits)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{amount(periodCredits)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{balance(closingBalance, selectedAccount.normal_balance)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>
        </>
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
          Select an account and date range to view posted ledger activity.
        </section>
      )}

      <p className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        Balances are calculated from posted manual journals only; operational fee, receipt, and expense records are not automatically included.
      </p>
    </main>
  );
}
