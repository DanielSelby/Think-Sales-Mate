import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { EducationAccountingJournalForm } from "@/components/education/education-accounting-journal-form";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import { postEducationAccountingJournal } from "../actions";

type SearchParams = { error?: string; saved?: string; posted?: string };

export default async function EducationJournalEntriesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_finance", "finance", "journal_entries", "view")) {
    redirect("/dashboard?accessDenied=think-education.accounting");
  }

  const [{ campuses, hasOrganizationScope }, params, supabase] = await Promise.all([
    getAccessibleEducationCampuses(context.orgId, context.userId),
    searchParams,
    createClient(),
  ]);
  const [accountsResult, yearsResult, periodsResult, journalsResult, canCreate, canEdit, canPost] = await Promise.all([
    supabase.from("education_accounting_accounts")
      .select("id, branch_id, code, name, account_type, normal_balance, is_active")
      .eq("org_id", context.orgId)
      .order("code"),
    supabase.from("education_accounting_fiscal_years")
      .select("id, name, starts_on, ends_on")
      .eq("org_id", context.orgId)
      .order("starts_on", { ascending: false }),
    supabase.from("education_accounting_periods")
      .select("id, fiscal_year_id, name, starts_on, ends_on, status")
      .eq("org_id", context.orgId)
      .order("starts_on"),
    supabase.from("education_accounting_journals")
      .select("id, journal_number, branch_id, fiscal_year_id, period_id, entry_date, reference, description, status, total_debit, total_credit, posted_at")
      .eq("org_id", context.orgId)
      .order("journal_number", { ascending: false })
      .limit(100),
    canTabPermission("education_finance", "finance", "journal_entries", "create"),
    canTabPermission("education_finance", "finance", "journal_entries", "edit"),
    canTabPermission("education_finance", "finance", "journal_entries", "approve"),
  ]);
  if (accountsResult.error) throw new Error(`Could not load journal accounts: ${accountsResult.error.message}`);
  if (yearsResult.error) throw new Error(`Could not load fiscal years for journals: ${yearsResult.error.message}`);
  if (periodsResult.error) throw new Error(`Could not load accounting periods for journals: ${periodsResult.error.message}`);
  if (journalsResult.error) throw new Error(`Could not load Education journals: ${journalsResult.error.message}`);

  const journals = journalsResult.data ?? [];
  const journalIds = journals.map((journal) => journal.id);
  const journalLines: Array<{
    id: string;
    journal_id: string;
    line_number: number;
    account_id: string;
    description: string | null;
    debit: number;
    credit: number;
  }> = [];
  for (let offset = 0; journalIds.length > 0; offset += 1000) {
    const { data, error } = await supabase.from("education_accounting_journal_lines")
      .select("id, journal_id, line_number, account_id, description, debit, credit")
      .eq("org_id", context.orgId)
      .in("journal_id", journalIds)
      .order("journal_id")
      .order("line_number")
      .range(offset, offset + 999);
    if (error) throw new Error(`Could not load Education journal lines: ${error.message}`);
    journalLines.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) break;
  }

  const accounts = accountsResult.data ?? [];
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const campusesById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const linesByJournalId = new Map<string, typeof journalLines>();
  for (const line of journalLines) {
    const current = linesByJournalId.get(line.journal_id) ?? [];
    current.push(line);
    linesByJournalId.set(line.journal_id, current);
  }
  const errorMessage = params.error === "permission"
    ? "You are not authorized for that campus or journal action."
    : params.error === "not-found"
      ? "That journal is no longer an editable draft."
    : params.error === "validation"
      ? "The journal details are invalid. Verify the dates, active accounts, line amounts, and accounting period."
      : params.error === "save"
        ? "The journal could not be saved. Please try again."
        : null;

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-6 p-4 md:p-6">
      <header>
        <Link href={getProductAppPath("think-education", "/accounting")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
          <ArrowLeft className="h-4 w-4" /> Accounting
        </Link>
        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-blue-700">Think Education · General accounting</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Journal Entries</h1>
        <p className="mt-1 text-sm text-slate-600">Create balanced, campus-scoped entries and post them into the Education General Ledger.</p>
      </header>

      {params.saved === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Journal draft saved.</p>}
      {params.posted === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Journal posted to the General Ledger.</p>}
      {errorMessage && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{errorMessage}</p>}

      {canCreate && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Create a journal draft</h2>
          {accounts.filter((account) => account.is_active).length < 2
            || (yearsResult.data ?? []).length === 0
            || !(periodsResult.data ?? []).some((period) => period.status === "open") ? (
            <p className="mt-2 text-sm text-amber-800">
              Configure at least two active accounts available to your campus and an open accounting period before creating a journal.
              {" "}
              <Link href={getProductAppPath("think-education", "/accounting/chart-of-accounts")} className="font-semibold underline">Chart of Accounts</Link>
              {" · "}
              <Link href={getProductAppPath("think-education", "/accounting/periods")} className="font-semibold underline">Fiscal Years &amp; Periods</Link>
            </p>
          ) : (
            <div className="mt-4">
              <EducationAccountingJournalForm
                accounts={accounts}
                campuses={campuses.map((campus) => ({ id: campus.id, name: campus.name }))}
                fiscalYears={yearsResult.data ?? []}
                periods={periodsResult.data ?? []}
                hasOrganizationScope={hasOrganizationScope}
              />
            </div>
          )}
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4">
          <FileText className="h-5 w-5 text-blue-700" />
          <div>
            <h2 className="font-semibold text-slate-950">Recent journal entries</h2>
            <p className="text-sm text-slate-500">Showing the latest {journals.length} entries visible to your campus scope.</p>
          </div>
        </div>
        {journals.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-600">No journal entries have been created yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {journals.map((journal) => {
              const lines = linesByJournalId.get(journal.id) ?? [];
              return (
                <article key={journal.id} className="space-y-3 p-4 md:p-5">
                  <header className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-sm font-semibold text-blue-800">EDU-JE-{String(journal.journal_number).padStart(6, "0")}</p>
                      <h3 className="mt-1 font-semibold text-slate-950">{journal.description}</h3>
                      <p className="mt-1 text-xs text-slate-500">
                        {journal.entry_date}
                        {journal.reference ? ` · Ref ${journal.reference}` : ""}
                        {` · ${journal.branch_id ? campusesById.get(journal.branch_id) ?? "Assigned campus" : "All campuses"}`}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${journal.status === "posted" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
                        {journal.status === "posted" ? "Posted" : "Draft"}
                      </span>
                      {journal.status === "draft" && canEdit && (
                        <Link href={getProductAppPath("think-education", `/accounting/journal-entries/${journal.id}`)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                          Edit draft
                        </Link>
                      )}
                      {journal.status === "draft" && canPost && (
                        <form action={postEducationAccountingJournal}>
                          <input type="hidden" name="journalId" value={journal.id} />
                          <button type="submit" className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800">Post journal</button>
                        </form>
                      )}
                    </div>
                  </header>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="py-2 pr-3">Account</th>
                          <th className="py-2 pr-3">Description</th>
                          <th className="py-2 pr-3 text-right">Debit</th>
                          <th className="py-2 text-right">Credit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {lines.map((line) => {
                          const account = accountById.get(line.account_id);
                          return (
                            <tr key={line.id}>
                              <td className="py-2 pr-3">{account ? `${account.code} · ${account.name}` : "Account"}</td>
                              <td className="py-2 pr-3">{line.description || "—"}</td>
                              <td className="py-2 pr-3 text-right tabular-nums">{Number(line.debit).toFixed(2)}</td>
                              <td className="py-2 text-right tabular-nums">{Number(line.credit).toFixed(2)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-right text-xs font-semibold text-slate-700">
                    Totals: {Number(journal.total_debit).toFixed(2)} debit · {Number(journal.total_credit).toFixed(2)} credit
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <p className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        Posted journals are immutable and included in the General Ledger. Fees, receipts, and expenses are still operational records and are not automatically journalized.
      </p>
    </main>
  );
}
