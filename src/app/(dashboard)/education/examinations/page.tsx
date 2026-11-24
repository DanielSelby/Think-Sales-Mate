import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, ClipboardCheck, Plus } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import { createEducationExamination, updateEducationExaminationStatus } from "../actions";

type ExaminationRow = {
  id: string;
  branch_id: string;
  academic_year_id: string;
  term_id: string | null;
  name: string;
  examination_type: string;
  starts_at: string | null;
  ends_at: string | null;
  status: string;
  academic_year_name: string | null;
  term_name: string | null;
  campus_name: string | null;
  total_count: number;
  scheduled_count: number;
  in_progress_count: number;
  results_pending_count: number;
};

const PAGE_SIZE = 50;

const NEXT_STATUS: Record<string, Array<{ status: string; label: string }>> = {
  draft: [{ status: "scheduled", label: "Schedule" }, { status: "cancelled", label: "Cancel" }],
  scheduled: [{ status: "in_progress", label: "Start" }, { status: "cancelled", label: "Cancel" }],
  in_progress: [{ status: "completed", label: "Complete" }, { status: "cancelled", label: "Cancel" }],
  completed: [{ status: "results_pending", label: "Send to results" }],
};

export default async function EducationExaminationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_examinations", "examinations", "schedule", "view")) {
    redirect("/dashboard?accessDenied=think-education.examinations");
  }

  const params = await searchParams;
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const branchIds = campuses.map((campus) => campus.id);
  const requestedBranch = typeof params.branch === "string" ? params.branch : "";
  const requestedYear = typeof params.year === "string" ? params.year : "";
  const requestedStatus = typeof params.status === "string" ? params.status : "";
  const requestedSearch = typeof params.search === "string" ? params.search.trim().slice(0, 80) : "";
  const requestedPage = Number.parseInt(typeof params.page === "string" ? params.page : "1", 10);
  const currentPage = Number.isFinite(requestedPage) ? Math.min(1_000_000, Math.max(1, requestedPage)) : 1;
  const [canCreate, canEdit, canPublish, canExport] = await Promise.all([
    canTabPermission("education_examinations", "examinations", "schedule", "create"),
    canTabPermission("education_examinations", "examinations", "schedule", "edit"),
    canTabPermission("education_examinations", "examinations", "schedule", "publish"),
    canTabPermission("education_examinations", "examinations", "schedule", "export"),
  ]);
  const supabase = await createClient();
  const [{ data: years, error: yearsError }, { data: terms, error: termsError }] = await Promise.all([
    supabase.from("education_academic_years")
      .select("id, name")
      .eq("org_id", context.orgId).order("starts_on", { ascending: false }),
    supabase.from("education_academic_terms")
      .select("id, academic_year_id, name")
      .eq("org_id", context.orgId).order("sequence_number"),
  ]);
  if (yearsError) throw new Error(`Could not load academic years for examinations: ${yearsError.message}`);
  if (termsError) throw new Error(`Could not load academic terms for examinations: ${termsError.message}`);
  const academicYears = years ?? [];
  const academicTerms = terms ?? [];
  const selectedBranch = branchIds.includes(requestedBranch) ? requestedBranch : "";
  const selectedYear = academicYears.some((year) => year.id === requestedYear) ? requestedYear : "";
  const selectedStatus = ["draft", "scheduled", "in_progress", "completed", "results_pending", "published", "cancelled"].includes(requestedStatus)
    ? requestedStatus
    : "";
  const examinationsResult = branchIds.length
    ? await supabase.rpc("education_get_examinations_page", {
      p_org_id: context.orgId,
      p_branch_ids: branchIds,
      p_branch_id: selectedBranch || null,
      p_academic_year_id: selectedYear || null,
      p_status: selectedStatus || null,
      p_search: requestedSearch,
      p_limit: PAGE_SIZE,
      p_offset: (currentPage - 1) * PAGE_SIZE,
    })
    : { data: [], error: null };
  if (examinationsResult.error) throw new Error(`Could not load Think Education examinations: ${examinationsResult.error.message}`);
  const examinations: ExaminationRow[] = examinationsResult.data ?? [];
  const totalCount = examinations[0]?.total_count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  if (currentPage > 1 && examinations.length === 0) {
    const firstPage = new URLSearchParams();
    if (requestedSearch) firstPage.set("search", requestedSearch);
    if (selectedBranch) firstPage.set("branch", selectedBranch);
    if (selectedYear) firstPage.set("year", selectedYear);
    if (selectedStatus) firstPage.set("status", selectedStatus);
    redirect(`${getProductAppPath("think-education", "/examinations")}?${firstPage.toString()}`);
  }
  const filteredExaminations = examinations;
  const scheduledCount = examinations[0]?.scheduled_count ?? 0;
  const inProgressCount = examinations[0]?.in_progress_count ?? 0;
  const resultsPendingCount = examinations[0]?.results_pending_count ?? 0;
  const exportParams = new URLSearchParams();
  if (requestedSearch) exportParams.set("search", requestedSearch);
  if (selectedBranch) exportParams.set("branch", selectedBranch);
  if (selectedYear) exportParams.set("year", selectedYear);
  if (selectedStatus) exportParams.set("status", selectedStatus);
  const csvHref = `${getProductAppPath("think-education", "/examinations/export")}?${exportParams.toString()}`;
  const queryForPage = (page: number) => {
    const next = new URLSearchParams();
    if (requestedSearch) next.set("search", requestedSearch);
    if (selectedBranch) next.set("branch", selectedBranch);
    if (selectedYear) next.set("year", selectedYear);
    if (selectedStatus) next.set("status", selectedStatus);
    next.set("page", String(page));
    return `${getProductAppPath("think-education", "/examinations")}?${next.toString()}`;
  };
  const errorMessage = params.error === "duplicate"
    ? "That examination already exists."
    : params.error === "invalid"
      ? "Check the examination name, dates, campus, and academic year."
      : params.error === "save" ? "The examination could not be saved. Please try again." : null;

  return <main className="mx-auto max-w-[1500px] space-y-6 p-4 md:p-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <Link href={getProductAppPath("think-education", "/dashboard")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">Examinations</h1>
        <p className="mt-1 text-sm text-slate-600">Schedule and track examinations across your authorized campuses.</p>
      </div>
      {canCreate && academicYears.length > 0 && campuses.length > 0 && <a href="#schedule-exam" className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">
        <Plus className="h-4 w-4" /> Schedule examination
      </a>}
    </header>

    {params.created === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Examination created as a draft.</p>}
    {params.updated === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Examination status updated.</p>}
    {errorMessage && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{errorMessage}</p>}

    <section data-education-metrics className="grid gap-3 sm:grid-cols-3">
      {[
        { label: "Examinations", value: totalCount, icon: ClipboardCheck },
        { label: "Upcoming / scheduled", value: scheduledCount, icon: CalendarDays },
        { label: "In progress", value: inProgressCount, icon: ClipboardCheck },
      ].map(({ label, value, icon: Icon }) => <article key={label} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-950">{value.toLocaleString()}</p></div>
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><Icon className="h-5 w-5" /></span>
      </article>)}
    </section>

    <section aria-label="Examination workflow" className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 md:flex md:items-center md:justify-between md:gap-6">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Examination workflow</h2>
        <p className="mt-1 text-sm text-slate-600">Create a draft, schedule the sitting, then send completed examinations to results for review and publication.</p>
      </div>
      <p className="mt-3 shrink-0 text-sm font-medium text-blue-900 md:mt-0">
          {resultsPendingCount.toLocaleString()} awaiting results
      </p>
    </section>

    <form method="get" className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-5">
      <label className="text-sm font-medium text-slate-700">Search
        <input name="search" defaultValue={requestedSearch} placeholder="Name, type or term" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
      </label>
      <label className="text-sm font-medium text-slate-700">Campus
        <select name="branch" defaultValue={selectedBranch} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
          <option value="">All campuses</option>
          {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium text-slate-700">Academic year
        <select name="year" defaultValue={selectedYear} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
          <option value="">All years</option>
          {academicYears.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium text-slate-700">Status
        <select name="status" defaultValue={selectedStatus} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
          <option value="">All statuses</option>
          {['draft', 'scheduled', 'in_progress', 'completed', 'results_pending', 'published', 'cancelled'].map((status) => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}
        </select>
      </label>
      <div className="flex items-end gap-2">
        <button type="submit" className="w-full rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Apply filters</button>
        {canExport && totalCount > 0 && <a href={csvHref} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Export CSV</a>}
        <Link href={getProductAppPath("think-education", "/examinations")} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Reset</Link>
      </div>
    </form>

    <section aria-label="Examination records" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {campuses.length === 0 ? <div className="p-8 text-center">
        <ClipboardCheck className="mx-auto h-10 w-10 text-slate-300" />
        <h2 className="mt-3 font-semibold text-slate-900">No campus access assigned</h2>
        <p className="mt-1 text-sm text-slate-500">Ask an authorized Think Education administrator to assign your campus scope.</p>
      </div> : filteredExaminations.length === 0 ? <div className="p-8 text-center">
        <ClipboardCheck className="mx-auto h-10 w-10 text-slate-300" />
        <h2 className="mt-3 font-semibold text-slate-900">No examinations match these filters</h2>
        <p className="mt-1 text-sm text-slate-500">Try another search string or reset the filters.</p>
      </div> : <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Examination</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Academic period</th><th className="px-4 py-3">Campus</th><th className="px-4 py-3">Schedule</th><th className="px-4 py-3">Status / actions</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{filteredExaminations.map((exam) => <tr key={exam.id} className="align-top transition-colors hover:bg-slate-50/70">
            <td className="px-4 py-3 font-semibold text-slate-900">{exam.name}</td>
            <td className="px-4 py-3 capitalize text-slate-600">{exam.examination_type.replace("_", " ")}</td>
            <td className="px-4 py-3 text-slate-600">{exam.academic_year_name ?? "Academic year"}{exam.term_name ? ` · ${exam.term_name}` : ""}</td>
            <td className="px-4 py-3 text-slate-600">{exam.campus_name ?? "Campus"}</td>
            <td className="px-4 py-3 text-slate-600">{exam.starts_at ? new Date(exam.starts_at).toLocaleString() : "Not set"}{exam.ends_at ? ` – ${new Date(exam.ends_at).toLocaleString()}` : ""}</td>
            <td className="px-4 py-3">
              <span className="inline-block rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">{exam.status.replace("_", " ")}</span>
              {canEdit && NEXT_STATUS[exam.status]?.length > 0 && <div className="mt-2 flex flex-wrap gap-2">
                {NEXT_STATUS[exam.status].map(({ status, label }) => <form key={status} action={updateEducationExaminationStatus}>
                  <input type="hidden" name="examination_id" value={exam.id} /><input type="hidden" name="status" value={status} />
                  <button className={`rounded-md px-2 py-1 text-xs font-semibold ${status === "cancelled" ? "border border-rose-300 text-rose-700 hover:bg-rose-50" : "bg-blue-700 text-white hover:bg-blue-800"}`}>{label}</button>
                </form>)}
              </div>}
              {canEdit && canPublish && exam.status === "results_pending" && <form action={updateEducationExaminationStatus} className="mt-2">
                <input type="hidden" name="examination_id" value={exam.id} /><input type="hidden" name="status" value="published" />
                <button className="rounded-md bg-emerald-700 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-800">Publish results</button>
              </form>}
            </td>
          </tr>)}</tbody>
        </table>
      </div>}
      {totalCount > 0 && <footer className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
        <span className="text-slate-500">Showing {((currentPage - 1) * PAGE_SIZE) + 1}–{Math.min(currentPage * PAGE_SIZE, totalCount)} of {totalCount.toLocaleString()}</span>
        <div className="flex items-center gap-2">
          {currentPage > 1 && <Link href={queryForPage(currentPage - 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">Previous</Link>}
          <span className="text-slate-600">{currentPage} / {totalPages}</span>
          {currentPage < totalPages && <Link href={queryForPage(currentPage + 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">Next</Link>}
        </div>
      </footer>}
    </section>

    {canCreate && academicYears.length > 0 && campuses.length > 0 && <section id="schedule-exam" className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-slate-950">Create examination</h2>
      <p className="mt-1 text-sm text-slate-500">New examinations start in draft. Scheduling and later status changes require the appropriate permission.</p>
      <form action={createEducationExamination} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm font-medium text-slate-700">Campus
          <select required name="branch_id" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">{campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}</select>
        </label>
        <label className="text-sm font-medium text-slate-700">Academic year
          <select required name="academic_year_id" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">{academicYears.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select>
        </label>
        <label className="text-sm font-medium text-slate-700">Term
          <select name="term_id" defaultValue="" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">No term selected</option>
            {academicYears.map((year) => {
              const yearTerms = academicTerms.filter((term) => term.academic_year_id === year.id);
              return yearTerms.length > 0 && <optgroup key={year.id} label={year.name}>
                {yearTerms.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}
              </optgroup>;
            })}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Examination type
          <select name="examination_type" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="examination">Examination</option><option value="class_test">Class test</option><option value="midterm">Midterm</option><option value="final">Final</option>
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700 sm:col-span-2">Name
          <input required name="name" maxLength={120} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Starts at
          <input type="datetime-local" name="starts_at" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Ends at
          <input type="datetime-local" name="ends_at" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <div className="sm:col-span-2 lg:col-span-4"><button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Save examination</button></div>
      </form>
    </section>}
  </main>;
}
