import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { EducationAccountingJournalForm } from "@/components/education/education-accounting-journal-form";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";

export default async function EditEducationJournalPage({
  params,
}: {
  params: Promise<{ journalId: string }>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_finance", "finance", "journal_entries", "edit")) {
    redirect("/dashboard?accessDenied=think-education.accounting");
  }

  const [{ journalId }, supabase, campusAccess] = await Promise.all([
    params,
    createClient(),
    getAccessibleEducationCampuses(context.orgId, context.userId),
  ]);
  const { data: journal, error: journalError } = await supabase.from("education_accounting_journals")
    .select("id, journal_number, branch_id, fiscal_year_id, period_id, entry_date, reference, description, status")
    .eq("org_id", context.orgId)
    .eq("id", journalId)
    .maybeSingle();
  if (journalError) throw new Error(`Could not load the journal draft: ${journalError.message}`);
  if (!journal || journal.status !== "draft") redirect("/accounting/journal-entries?error=not-found");

  const [linesResult, accountsResult, yearsResult, periodsResult] = await Promise.all([
    supabase.from("education_accounting_journal_lines")
      .select("id, line_number, account_id, description, debit, credit")
      .eq("org_id", context.orgId)
      .eq("journal_id", journal.id)
      .order("line_number"),
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
  ]);
  if (linesResult.error) throw new Error(`Could not load journal lines: ${linesResult.error.message}`);
  if (accountsResult.error) throw new Error(`Could not load journal accounts: ${accountsResult.error.message}`);
  if (yearsResult.error) throw new Error(`Could not load fiscal years: ${yearsResult.error.message}`);
  if (periodsResult.error) throw new Error(`Could not load accounting periods: ${periodsResult.error.message}`);

  const campusName = campusAccess.campuses.find((campus) => campus.id === journal.branch_id)?.name ?? "Assigned campus";
  return (
    <main className="mx-auto w-full max-w-[1300px] space-y-6 p-4 md:p-6">
      <header>
        <Link href={getProductAppPath("think-education", "/accounting/journal-entries")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
          <ArrowLeft className="h-4 w-4" /> Journal Entries
        </Link>
        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-blue-700">EDU-JE-{String(journal.journal_number).padStart(6, "0")}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Edit journal draft</h1>
        <p className="mt-1 text-sm text-slate-600">{campusName} · Drafts can be edited; posted journals cannot.</p>
      </header>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <EducationAccountingJournalForm
          accounts={accountsResult.data ?? []}
          campuses={campusAccess.campuses.map((campus) => ({ id: campus.id, name: campus.name }))}
          fiscalYears={yearsResult.data ?? []}
          periods={periodsResult.data ?? []}
          hasOrganizationScope={campusAccess.hasOrganizationScope}
          initialJournal={{
            ...journal,
            lines: (linesResult.data ?? []).map((line) => ({
              account_id: line.account_id,
              debit: String(line.debit),
              credit: String(line.credit),
              description: line.description ?? "",
            })),
          }}
        />
      </section>
    </main>
  );
}
