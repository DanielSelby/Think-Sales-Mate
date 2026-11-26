import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, FileText, Trophy } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import { ResultScoreEditor } from "./result-score-editor";
import { AssessmentComponentsManager } from "./assessment-components-manager";
import { AssessmentResultEntryForm } from "./assessment-result-entry-form";
import {
  updateEducationExaminationStatus,
  updateEducationResultStatus,
} from "../actions";

const PAGE_SIZE = 50;
const EXAMINATION_PAGE_SIZE = 50;

type EducationResultRow = {
  id: string;
  student_id: string;
  subject_id: string | null;
  subject_name: string;
  score: number;
  maximum_score: number;
  grade: string | null;
  grade_override: string | null;
  status: string;
  student_number: string | null;
  first_name: string | null;
  last_name: string | null;
  total_count: number;
  draft_count: number;
  submitted_count: number;
  approved_count: number;
  published_count: number;
  locked_subject_ids: string[];
};
type EducationAssessmentComponentRow = {
  id: string;
  subject_id: string;
  name: string;
  weight_percentage: number;
  maximum_score: number;
};
type EducationResultComponentScoreRow = {
  result_id: string;
  component_id: string;
  score: number;
};

export default async function EducationResultsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_results", "results", "gradebook", "view")) {
    redirect("/dashboard?accessDenied=think-education.results");
  }

  const params = await searchParams;
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const branchIds = campuses.map((campus) => campus.id);
  const requestedSearch = typeof params.search === "string" ? params.search.trim().slice(0, 80) : "";
  const requestedStatus = typeof params.status === "string" ? params.status : "";
  const validStatus = ["draft", "submitted", "approved", "published"].includes(requestedStatus) ? requestedStatus : "";
  const requestedExamSearch = typeof params.exam_search === "string" ? params.exam_search.trim().slice(0, 80) : "";
  const examSearch = requestedExamSearch.replace(/[^A-Za-z0-9\s_-]/g, "");
  const requestedExamPage = Number.parseInt(typeof params.exam_page === "string" ? params.exam_page : "1", 10);
  const examPage = Number.isFinite(requestedExamPage) ? Math.min(1_000_000, Math.max(1, requestedExamPage)) : 1;
  const requestedPage = Number.parseInt(typeof params.page === "string" ? params.page : "1", 10);
  const currentPage = Number.isFinite(requestedPage) ? Math.min(1_000_000, Math.max(1, requestedPage)) : 1;
  const requestedExam = typeof params.examination === "string" ? params.examination : "";
  const [canCreate, canEdit, canApprove, canPublish, canExport] = await Promise.all([
    canTabPermission("education_results", "results", "gradebook", "create"),
    canTabPermission("education_results", "results", "gradebook", "edit"),
    canTabPermission("education_results", "results", "gradebook", "approve"),
    canTabPermission("education_results", "results", "gradebook", "publish"),
    canTabPermission("education_results", "results", "gradebook", "export"),
  ]);
  const canViewSubjectCatalog = await canTabPermission("education_academics", "academics", "calendar", "view");
  const supabase = await createClient();
  let activeSubjects: Array<{ id: string; name: string }> = [];
  if (canViewSubjectCatalog) {
    const { data, error } = await supabase.from("education_subjects")
      .select("id, name")
      .eq("org_id", context.orgId).eq("status", "active")
      .order("name");
    if (error) throw new Error(`Could not load active Think Education subjects: ${error.message}`);
    activeSubjects = data ?? [];
  }
  let exams: Array<{ id: string; branch_id: string; name: string; status: string }> = [];
  let examCount = 0;
  let selectedExam: (typeof exams)[number] | null = null;
  if (branchIds.length) {
    let examQuery = supabase.from("education_examinations")
      .select("id, branch_id, name, status", { count: "exact" })
      .eq("org_id", context.orgId).in("branch_id", branchIds)
      .order("starts_at", { ascending: false }).order("id")
      .range((examPage - 1) * EXAMINATION_PAGE_SIZE, examPage * EXAMINATION_PAGE_SIZE - 1);
    if (examSearch) examQuery = examQuery.ilike("name", `%${examSearch}%`);
    const { data, count, error } = await examQuery;
    if (error) throw new Error(`Could not load examinations for results: ${error.message}`);
    exams = data ?? [];
    examCount = count ?? 0;

    selectedExam = exams.find((exam) => exam.id === requestedExam) ?? null;
    if (!selectedExam && requestedExam) {
      const { data: requested, error: requestedError } = await supabase.from("education_examinations")
        .select("id, branch_id, name, status")
        .eq("org_id", context.orgId).in("branch_id", branchIds).eq("id", requestedExam)
        .maybeSingle();
      if (requestedError) throw new Error(`Could not verify the selected examination: ${requestedError.message}`);
      selectedExam = requested ?? null;
    }
    if (!selectedExam) {
      const { data: defaultExams, error: defaultError } = await supabase.from("education_examinations")
        .select("id, branch_id, name, status")
        .eq("org_id", context.orgId).in("branch_id", branchIds)
        .in("status", ["completed", "results_pending"])
        .order("starts_at", { ascending: false }).order("id")
        .limit(1);
      if (defaultError) throw new Error(`Could not select the current results examination: ${defaultError.message}`);
      selectedExam = defaultExams?.[0] ?? exams[0] ?? null;
    }
    if (selectedExam && !exams.some((exam) => exam.id === selectedExam?.id)) {
      exams = [selectedExam, ...exams];
    }
  }
  const examPages = Math.max(1, Math.ceil(examCount / EXAMINATION_PAGE_SIZE));
  const examPageHref = (page: number) => {
    const next = new URLSearchParams();
    if (selectedExam) next.set("examination", selectedExam.id);
    if (requestedExamSearch) next.set("exam_search", requestedExamSearch);
    if (page > 1) next.set("exam_page", String(page));
    if (requestedSearch) next.set("search", requestedSearch);
    if (validStatus) next.set("status", validStatus);
    if (currentPage > 1) next.set("page", String(currentPage));
    return `${getProductAppPath("think-education", "/results")}?${next.toString()}`;
  };
  if (examPage > examPages) redirect(examPageHref(examPages));
  let results: EducationResultRow[] = [];
  let assessmentComponents: EducationAssessmentComponentRow[] = [];
  if (selectedExam) {
    const [
      { data: resultData, error: resultError },
      { data: componentData, error: componentError },
    ] = await Promise.all([
      supabase.rpc("education_get_examination_results_page", {
        p_org_id: context.orgId,
        p_examination_id: selectedExam.id,
        p_branch_ids: branchIds,
        p_status: validStatus || null,
        p_search: requestedSearch,
        p_limit: PAGE_SIZE,
        p_offset: (currentPage - 1) * PAGE_SIZE,
      }),
      supabase.from("education_assessment_components")
        .select("id, subject_id, name, weight_percentage, maximum_score")
        .eq("org_id", context.orgId)
        .eq("branch_id", selectedExam.branch_id)
        .eq("examination_id", selectedExam.id)
        .order("created_at"),
    ]);
    if (resultError) throw new Error(`Could not load Think Education results: ${resultError.message}`);
    if (componentError) throw new Error(`Could not load Think Education assessment components: ${componentError.message}`);
    results = resultData ?? [];
    assessmentComponents = componentData ?? [];
  }
  if (selectedExam && currentPage > 1 && results.length === 0) {
    const firstPage = new URLSearchParams({ examination: selectedExam.id });
    if (requestedSearch) firstPage.set("search", requestedSearch);
    if (validStatus) firstPage.set("status", validStatus);
    redirect(`${getProductAppPath("think-education", "/results")}?${firstPage.toString()}`);
  }
  let metadataRow = results[0];
  let lockedSubjectIds = metadataRow?.locked_subject_ids ?? [];
  if (selectedExam && lockedSubjectIds.length === 0 && currentPage === 1) {
    const { data, error } = await supabase.rpc("education_get_examination_results_page", {
      p_org_id: context.orgId,
      p_examination_id: selectedExam.id,
      p_branch_ids: branchIds,
      p_status: null,
      p_search: "",
      p_limit: 1,
      p_offset: 0,
    });
    if (error) throw new Error(`Could not load locked Think Education result subjects: ${error.message}`);
    metadataRow = data?.[0] ?? metadataRow;
    lockedSubjectIds = metadataRow?.locked_subject_ids ?? [];
  }
  const resultIds = results.map((result) => result.id);
  let componentScoreRows: EducationResultComponentScoreRow[] = [];
  if (resultIds.length) {
    const { data, error } = await supabase.from("education_result_component_scores")
      .select("result_id, component_id, score")
      .eq("org_id", context.orgId)
      .in("result_id", resultIds);
    if (error) throw new Error(`Could not load component scores for Think Education results: ${error.message}`);
    componentScoreRows = data ?? [];
  }
  const componentsBySubject = new Map<string, EducationAssessmentComponentRow[]>();
  for (const component of assessmentComponents) {
    const subjectComponents = componentsBySubject.get(component.subject_id) ?? [];
    subjectComponents.push(component);
    componentsBySubject.set(component.subject_id, subjectComponents);
  }
  const componentById = new Map(assessmentComponents.map((component) => [component.id, component]));
  const componentScoresByResult = new Map<string, Array<{
    componentId: string;
    score: number;
    name: string;
    weightPercentage: number;
    maximumScore: number;
  }>>();
  for (const score of componentScoreRows) {
    const component = componentById.get(score.component_id);
    if (!component) continue;
    const resultScores = componentScoresByResult.get(score.result_id) ?? [];
    resultScores.push({
      componentId: component.id,
      score: Number(score.score),
      name: component.name,
      weightPercentage: Number(component.weight_percentage),
      maximumScore: Number(component.maximum_score),
    });
    componentScoresByResult.set(score.result_id, resultScores);
  }
  const filteredResults = results;
  const filteredResultCount = results[0]?.total_count ?? 0;
  const statusCounts = {
    draft: metadataRow?.draft_count ?? 0,
    submitted: metadataRow?.submitted_count ?? 0,
    approved: metadataRow?.approved_count ?? 0,
    published: metadataRow?.published_count ?? 0,
  };
  const workflowStatusEntries = [
    ["Draft", "draft"],
    ["Submitted", "submitted"],
    ["Approved", "approved"],
    ["Published", "published"],
  ] as const;
  const exportParams = new URLSearchParams();
  if (selectedExam) exportParams.set("examination", selectedExam.id);
  if (requestedSearch) exportParams.set("search", requestedSearch);
  if (validStatus) exportParams.set("status", validStatus);
  const csvHref = `${getProductAppPath("think-education", "/results/export")}?${exportParams.toString()}`;
  const totalPages = Math.max(1, Math.ceil(filteredResultCount / PAGE_SIZE));
  const resultPageHref = (page: number) => {
    const next = new URLSearchParams();
    if (selectedExam) next.set("examination", selectedExam.id);
    if (requestedExamSearch) next.set("exam_search", requestedExamSearch);
    if (examPage > 1) next.set("exam_page", String(examPage));
    if (requestedSearch) next.set("search", requestedSearch);
    if (validStatus) next.set("status", validStatus);
    next.set("page", String(page));
    return `${getProductAppPath("think-education", "/results")}?${next.toString()}`;
  };
  const canEnterResults = Boolean(selectedExam && ["completed", "results_pending"].includes(selectedExam.status) && canCreate);
  const errorMessage = params.error === "duplicate"
    ? "A result for that student and subject already exists for this examination."
    : params.error === "student"
      ? "No student with that number was found in the examination campus."
      : params.error === "invalid"
        ? "Check the examination, student number, subject, score, and maximum score."
        : params.error === "subject"
          ? "Select an active subject from your organization’s catalog. The selected subject may have been deactivated."
            : params.error === "components"
              ? "Check that component weights total 100% and every component has a valid name, weight, and maximum score."
        : params.error === "save" ? "The result could not be saved. Please try again." : null;

  return <main className="mx-auto max-w-[1500px] space-y-6 p-4 md:p-6">
    <header>
      <Link href={getProductAppPath("think-education", "/dashboard")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">Results &amp; Report Cards</h1>
      <p className="mt-1 text-sm text-slate-600">Enter scores, submit grades for approval, and publish finalized results.</p>
      <Link href={getProductAppPath("think-education", "/subjects")} className="mt-2 inline-flex text-sm font-semibold text-blue-700 hover:text-blue-900">Manage subject catalog</Link>
      <Link href={getProductAppPath("think-education", "/grade-bands")} className="ml-4 mt-2 inline-flex text-sm font-semibold text-blue-700 hover:text-blue-900">Manage organization grade bands</Link>
      <Link href={getProductAppPath("think-education", "/results/report-cards")} className="ml-4 mt-2 inline-flex text-sm font-semibold text-blue-700 hover:text-blue-900">Generate term report cards</Link>
    </header>

    {params.created === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Result added.</p>}
    {params.components === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Assessment components saved.</p>}
    {params.updated === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Result status updated.</p>}
    {errorMessage && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{errorMessage}</p>}

    <section data-education-metrics className="grid gap-3 sm:grid-cols-3">
      {[
        { label: "Results in selected exam", value: statusCounts.draft + statusCounts.submitted + statusCounts.approved + statusCounts.published, icon: FileText },
        { label: "Awaiting approval", value: statusCounts.submitted, icon: Trophy },
        { label: "Published", value: statusCounts.published, icon: Trophy },
      ].map(({ label, value, icon: Icon }) => <article key={label} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-950">{value.toLocaleString()}</p></div>
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><Icon className="h-5 w-5" /></span>
      </article>)}
    </section>

    <section aria-label="Results workflow" className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
      <h2 className="text-sm font-semibold text-slate-900">Gradebook workflow</h2>
      <p className="mt-1 text-sm text-slate-600">Enter scores after an examination is completed, submit grades for approval, and publish approved results.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {workflowStatusEntries.map(([label, status]) => <span key={status} className="inline-flex items-center gap-2 rounded-full border border-white bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-700">
          {label}<span className="font-bold tabular-nums text-blue-800">{statusCounts[status].toLocaleString()}</span>
        </span>)}
      </div>
    </section>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <form method="get" action={getProductAppPath("think-education", "/results")} className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-[minmax(200px,1fr)_minmax(200px,1fr)_220px_220px_auto]">
        <label className="text-sm font-medium text-slate-700">Find examination
          <input name="exam_search" defaultValue={requestedExamSearch} maxLength={80} placeholder="Search examination names" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Examination
          <select name="examination" defaultValue={selectedExam?.id ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            {exams.length === 0 && <option value="">No examinations available</option>}
            {exams.map((exam) => <option key={exam.id} value={exam.id}>{exam.name} · {exam.status.replace("_", " ")}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Search
          <input name="search" defaultValue={requestedSearch} placeholder="Student, subject, or grade" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Status
          <select name="status" defaultValue={validStatus} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">All statuses</option>
            {['draft', 'submitted', 'approved', 'published'].map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100">Apply filters</button>
          {canExport && filteredResultCount > 0 && <a href={csvHref} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Export CSV</a>}
          <Link href={getProductAppPath("think-education", "/results")} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Reset</Link>
        </div>
      </form>
      {examCount > EXAMINATION_PAGE_SIZE && <nav aria-label="Examination selector pages" className="flex items-center justify-between border-b border-slate-100 px-4 py-3 text-sm">
        <span className="text-slate-500">
          Showing {((examPage - 1) * EXAMINATION_PAGE_SIZE) + 1}–{Math.min(examPage * EXAMINATION_PAGE_SIZE, examCount)} of {examCount.toLocaleString()} examinations
        </span>
        <div className="flex items-center gap-2">
          {examPage > 1 && <Link href={examPageHref(examPage - 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">Previous exams</Link>}
          {examPage < examPages && <Link href={examPageHref(examPage + 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">More exams</Link>}
        </div>
      </nav>}

      {!selectedExam ? <div className="p-8 text-center">
        <FileText className="mx-auto h-10 w-10 text-slate-300" />
        <h2 className="mt-3 font-semibold text-slate-900">No examinations available</h2>
        <p className="mt-1 text-sm text-slate-500">Create and complete an examination before entering results.</p>
      </div> : filteredResults.length === 0 ? <div className="p-8 text-center">
        <FileText className="mx-auto h-10 w-10 text-slate-300" />
        <h2 className="mt-3 font-semibold text-slate-900">No results match these filters</h2>
        <p className="mt-1 text-sm text-slate-500">Try another search string or reset the filters.</p>
      </div> : <div className="overflow-x-auto">
        <table className="w-full min-w-[850px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Student number</th><th className="px-4 py-3">Student</th><th className="px-4 py-3">Subject</th><th className="px-4 py-3">Score</th><th className="px-4 py-3">Grade</th><th className="px-4 py-3">Status / actions</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{filteredResults.map((result) => {
            const studentNumber = result.student_number ?? "—";
            const studentName = [result.first_name, result.last_name].filter(Boolean).join(" ") || "Student";
            const resultComponents = result.subject_id ? componentsBySubject.get(result.subject_id) ?? [] : [];
            const resultComponentScores = componentScoresByResult.get(result.id) ?? [];
            const editorComponents = resultComponents.map((component) => ({
              id: component.id,
              name: component.name,
              weightPercentage: Number(component.weight_percentage),
              maximumScore: Number(component.maximum_score),
            }));
            const nextStatus = result.status === "draft" ? "submitted"
              : result.status === "submitted" ? "approved"
                : result.status === "approved" ? "published" : null;
            const canUpdate = result.status === "draft" ? canEdit
              : result.status === "submitted" ? canEdit && canApprove
                : result.status === "approved" ? canEdit && canPublish : false;
            return <tr key={result.id} className="transition-colors hover:bg-slate-50/70">
              <td className="whitespace-nowrap px-4 py-3 font-semibold text-blue-800">{studentNumber}</td>
              <td className="px-4 py-3 font-medium text-slate-900">{studentName}</td>
              <td className="px-4 py-3 text-slate-700">{result.subject_name}</td>
              <td className="px-4 py-3 text-slate-700">
                {resultComponents.length
                  ? <div>
                    <span className="font-semibold">{Number(result.score).toFixed(2)}%</span>
                    {resultComponentScores.length > 0 && <details className="mt-1 text-xs text-slate-500">
                      <summary className="cursor-pointer">Component breakdown</summary>
                      <ul className="mt-1 space-y-1">
                        {resultComponentScores.map((component) => <li key={component.componentId}>
                          {component.name}: {component.score} / {component.maximumScore} ({component.weightPercentage}%)
                        </li>)}
                      </ul>
                    </details>}
                  </div>
                  : `${result.score} / ${result.maximum_score}`}
              </td>
              <td className="px-4 py-3 text-slate-700">{result.grade ?? "—"}</td>
              <td className="px-4 py-3">
                <span className="inline-block rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">{result.status}</span>
                {result.status === "draft" && canEdit && <ResultScoreEditor
                  resultId={result.id}
                  score={result.score}
                  maximumScore={result.maximum_score}
                  gradeOverride={result.grade_override}
                  components={editorComponents}
                  componentScores={resultComponentScores.map(({ componentId, score }) => ({ componentId, score }))}
                />}
                {nextStatus && canUpdate && <form action={updateEducationResultStatus} className="mt-2">
                  <input type="hidden" name="result_id" value={result.id} /><input type="hidden" name="status" value={nextStatus} />
                  <button className="rounded-md bg-blue-700 px-2.5 py-1 text-xs font-semibold capitalize text-white hover:bg-blue-800">{nextStatus === "submitted" ? "Submit" : nextStatus}</button>
                </form>}
              </td>
            </tr>;
          })}</tbody>
        </table>
      </div>}
      {filteredResultCount > 0 && <footer className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
        <span className="text-slate-500">Showing {((currentPage - 1) * PAGE_SIZE) + 1}–{Math.min(currentPage * PAGE_SIZE, filteredResultCount)} of {filteredResultCount.toLocaleString()}</span>
        <div className="flex items-center gap-2">
          {currentPage > 1 && <Link href={resultPageHref(currentPage - 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">Previous</Link>}
          <span className="text-slate-600">{currentPage} / {totalPages}</span>
          {currentPage < totalPages && <Link href={resultPageHref(currentPage + 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">Next</Link>}
        </div>
      </footer>}
    </section>

    {canEnterResults && activeSubjects.length === 0 && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      No active subjects are available to enter results. Add or reactivate subjects in the <Link className="font-semibold underline" href={getProductAppPath("think-education", "/subjects")}>organization subject catalog</Link>.
    </p>}

    {selectedExam && canEdit && activeSubjects.length > 0 && !["published", "cancelled"].includes(selectedExam.status) && <AssessmentComponentsManager
      examinationId={selectedExam.id}
      subjects={activeSubjects}
      components={assessmentComponents}
      lockedSubjectIds={lockedSubjectIds}
    />}

    {canEnterResults && selectedExam && activeSubjects.length > 0 && <AssessmentResultEntryForm
      examinationId={selectedExam.id}
      examinationName={selectedExam.name}
      subjects={activeSubjects}
      components={assessmentComponents}
    />}

    {selectedExam?.status === "results_pending" && canEdit && canPublish && <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
      <h2 className="font-semibold text-blue-950">Publish examination</h2>
      <p className="mt-1 text-sm text-blue-900">The database will allow publication only after at least one result exists and every result is published.</p>
      <form action={updateEducationExaminationStatus} className="mt-3">
        <input type="hidden" name="examination_id" value={selectedExam.id} /><input type="hidden" name="status" value="published" />
        <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Publish examination results</button>
      </form>
    </section>}
  </main>;
}
