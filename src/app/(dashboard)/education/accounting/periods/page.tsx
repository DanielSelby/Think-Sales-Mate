import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, LockKeyhole } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import { createEducationFiscalYear, setEducationAccountingPeriodStatus } from "../actions";

const fieldClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";

export default async function EducationAccountingPeriodsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; updated?: string }>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_finance", "finance", "fiscal_periods", "view")) {
    redirect("/dashboard?accessDenied=think-education.accounting");
  }

  const [{ hasOrganizationScope }, params, supabase] = await Promise.all([
    getAccessibleEducationCampuses(context.orgId, context.userId),
    searchParams,
    createClient(),
  ]);
  const [yearsResult, periodsResult, createAllowed, canManagePeriods] = await Promise.all([
    supabase.from("education_accounting_fiscal_years")
      .select("id, name, starts_on, ends_on, status, created_at")
      .eq("org_id", context.orgId)
      .order("starts_on", { ascending: false }),
    supabase.from("education_accounting_periods")
      .select("id, fiscal_year_id, name, sequence_number, starts_on, ends_on, status")
      .eq("org_id", context.orgId)
      .order("starts_on"),
    hasOrganizationScope && canTabPermission("education_finance", "finance", "fiscal_periods", "create"),
    hasOrganizationScope && canTabPermission("education_finance", "finance", "fiscal_periods", "approve"),
  ]);
  if (yearsResult.error) {
    throw new Error(`Could not load Education fiscal years: ${yearsResult.error.message}`);
  }
  if (periodsResult.error) {
    throw new Error(`Could not load Education accounting periods: ${periodsResult.error.message}`);
  }

  const years = yearsResult.data ?? [];
  const periods = periodsResult.data ?? [];
  const errorMessage = params.error === "organization-scope"
    ? "Organization-wide scope is required to create fiscal periods."
    : params.error === "fiscal-year-details"
      ? "Enter a valid fiscal year name and date range."
      : params.error === "fiscal-year-create"
        ? "The fiscal year could not be created. Check that its name is unique and its dates do not overlap another fiscal year."
        : params.error === "period-status"
          ? "The period could not be closed or reopened. Resolve draft journals or backfill transactions, then retry."
          : params.error === "permission"
            ? "You are not authorized to close or reopen this period."
        : null;

  return (
    <main className="mx-auto w-full max-w-[1300px] space-y-6 p-4 md:p-6">
      <header>
        <Link href={getProductAppPath("think-education", "/accounting")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
          <ArrowLeft className="h-4 w-4" /> Accounting
        </Link>
        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-blue-700">Think Education · Accounting setup</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Fiscal Years &amp; Periods</h1>
        <p className="mt-1 text-sm text-slate-600">Set institution-wide accounting dates independently from academic years.</p>
      </header>

      {errorMessage && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{errorMessage}</p>}
      {params.updated && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Accounting period {params.updated}.</p>}

      {!hasOrganizationScope && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Fiscal years are managed with organization-wide access. Your campus scope allows you to view the periods used for campus journals.
        </p>
      )}

      {createAllowed && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
            <CalendarDays className="h-5 w-5 text-blue-700" /> Create fiscal year
          </h2>
          <p className="mt-1 text-sm text-slate-600">Monthly accounting periods will be generated from the dates you set.</p>
          <form action={createEducationFiscalYear} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm font-medium text-slate-700">
              Fiscal year name
              <input required name="name" maxLength={80} placeholder="e.g. FY 2026/2027" className={fieldClass} />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Starts on
              <input required name="startsOn" type="date" className={fieldClass} />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Ends on
              <input required name="endsOn" type="date" className={fieldClass} />
            </label>
            <div className="flex items-end">
              <button type="submit" className="w-full rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">
                Create fiscal year
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="space-y-4">
        {years.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center text-sm text-slate-600">
            No fiscal years have been configured yet.
          </div>
        ) : years.map((year) => {
          const yearPeriods = periods.filter((period) => period.fiscal_year_id === year.id);
          return (
            <article key={year.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">{year.name}</h2>
                  <p className="text-sm text-slate-600">{year.starts_on} — {year.ends_on}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${year.status === "open" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                  {year.status === "open" ? "Open" : "Closed"}
                </span>
              </header>
              <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                {yearPeriods.map((period) => (
                  <div key={period.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-medium text-slate-900">{period.sequence_number}. {period.name}</h3>
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600">
                        {period.status === "closed" && <LockKeyhole className="h-3.5 w-3.5" />}
                        {period.status === "open" ? "Open" : "Closed"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">{period.starts_on} — {period.ends_on}</p>
                    {canManagePeriods && (
                      <form action={setEducationAccountingPeriodStatus} className="mt-3 space-y-2 border-t border-slate-200 pt-3">
                        <input type="hidden" name="periodId" value={period.id} />
                        <input type="hidden" name="status" value={period.status === "open" ? "closed" : "open"} />
                        <label className="block text-xs font-medium text-slate-600">
                          Reason
                          <input required name="reason" minLength={3} maxLength={500} className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm" />
                        </label>
                        <button type="submit" className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${period.status === "open" ? "bg-rose-700 text-white hover:bg-rose-800" : "border border-slate-300 text-slate-700 hover:bg-white"}`}>
                          {period.status === "open" ? "Close period" : "Reopen period"}
                        </button>
                      </form>
                    )}
                  </div>
                ))}
                {yearPeriods.length === 0 && <p className="text-sm text-slate-600">No accounting periods are associated with this fiscal year.</p>}
              </div>
            </article>
          );
        })}
      </section>

      <p className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        Closing a period blocks new journals in its date range. Close is blocked while drafts or finalized source transactions remain unposted; reopening requires a reason and is audited.
      </p>
    </main>
  );
}
