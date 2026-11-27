import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import { ReportCardsPrintButton } from "./print-button";
import {
  publishEducationReportCard,
  publishEducationReportCardsBulk,
  saveEducationReportCard,
} from "../../actions";
import {
  getEducationInstitutionDisplayName,
  getEducationInstitutionLogoUrl,
} from "@/lib/education/institution-branding";

const MAX_REPORT_RESULTS = 5000;
const MAX_REPORT_ATTENDANCE = 50000;

type PublishedResult = {
  student_id: string;
  examination_id: string;
  subject_name: string;
  score: number;
  maximum_score: number;
  grade: string | null;
};

type ReportStudent = {
  id: string;
  branch_id: string;
  student_number: string;
  first_name: string;
  last_name: string;
  other_names: string | null;
};

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  return typeof params[key] === "string" ? params[key] as string : "";
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString();
}

export default async function EducationReportCardsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");

  const [canViewResults, canExportResults, canEditResults, canApproveResults, canPublishResults, canViewAttendance, canExportAttendance, canViewGuardians, canExportGuardians] = await Promise.all([
    canTabPermission("education_results", "results", "gradebook", "view"),
    canTabPermission("education_results", "results", "gradebook", "export"),
    canTabPermission("education_results", "results", "gradebook", "edit"),
    canTabPermission("education_results", "results", "gradebook", "approve"),
    canTabPermission("education_results", "results", "gradebook", "publish"),
    canTabPermission("education_attendance", "attendance", "register", "view"),
    canTabPermission("education_attendance", "attendance", "register", "export"),
    canTabPermission("education_guardians", "guardians", "directory", "view"),
    canTabPermission("education_guardians", "guardians", "directory", "export"),
  ]);
  if (!canViewResults) redirect("/dashboard?accessDenied=think-education.results");

  const params = await searchParams;
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const accessibleBranchIds = campuses.map((campus) => campus.id);
  const requestedBranch = getParam(params, "branch");
  if (requestedBranch && !accessibleBranchIds.includes(requestedBranch)) {
    redirect(getProductAppPath("think-education", "/results/report-cards"));
  }
  const branchIds = requestedBranch ? [requestedBranch] : accessibleBranchIds;
  const requestedTerm = getParam(params, "term");
  const search = getParam(params, "search").trim().slice(0, 80).toLocaleLowerCase();
  const supabase = await createClient();

  const [{ data: terms, error: termsError }, { data: academicYears, error: yearsError }] = await Promise.all([
    supabase.from("education_academic_terms")
      .select("id, academic_year_id, name, starts_on, ends_on")
      .eq("org_id", context.orgId)
      .order("starts_on", { ascending: false })
      .order("id"),
    supabase.from("education_academic_years")
      .select("id, name")
      .eq("org_id", context.orgId),
  ]);
  if (termsError) throw new Error(`Could not load academic terms for report cards: ${termsError.message}`);
  if (yearsError) throw new Error(`Could not load academic years for report cards: ${yearsError.message}`);

  const availableTerms = terms ?? [];
  const selectedTerm = availableTerms.find((term) => term.id === requestedTerm) ?? availableTerms[0] ?? null;
  const academicYearName = new Map((academicYears ?? []).map((year) => [year.id, year.name]));
  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const [{ data: institution }, { data: companyProfile }] = await Promise.all([
    supabase.from("education_institution_settings")
      .select("institution_name, institution_code, institution_logo_url")
      .eq("org_id", context.orgId)
      .maybeSingle(),
    supabase.from("company_profile")
      .select("logo_url")
      .eq("org_id", context.orgId)
      .maybeSingle(),
  ]);
  const institutionName = getEducationInstitutionDisplayName(institution?.institution_name, context.orgName);
  const institutionLogoUrl = getEducationInstitutionLogoUrl(
    institution?.institution_logo_url,
    companyProfile?.logo_url,
  );

  let publishedExams: Array<{ id: string; branch_id: string; name: string }> = [];
  let publishedResults: PublishedResult[] = [];
  let reportTooLarge = false;
  if (selectedTerm && branchIds.length) {
    const { data, error } = await supabase.from("education_examinations")
      .select("id, branch_id, name")
      .eq("org_id", context.orgId)
      .eq("academic_year_id", selectedTerm.academic_year_id)
      .eq("term_id", selectedTerm.id)
      .eq("status", "published")
      .in("branch_id", branchIds)
      .order("name")
      .order("id");
    if (error) throw new Error(`Could not load published examinations for report cards: ${error.message}`);
    publishedExams = data ?? [];

    const examIds = publishedExams.map((exam) => exam.id);
    if (examIds.length) {
      const { data: resultData, count, error: resultsError } = await supabase.from("education_results")
        .select("student_id, examination_id, subject_name, score, maximum_score, grade", { count: "exact" })
        .eq("org_id", context.orgId)
        .eq("status", "published")
        .in("branch_id", branchIds)
        .in("examination_id", examIds)
        .order("student_id")
        .order("examination_id")
        .order("subject_name")
        .order("id")
        .range(0, MAX_REPORT_RESULTS - 1);
      if (resultsError) throw new Error(`Could not load published results for report cards: ${resultsError.message}`);
      reportTooLarge = (count ?? 0) > MAX_REPORT_RESULTS;
      if (!reportTooLarge) publishedResults = (resultData ?? []) as PublishedResult[];
    }
  }

  const studentIds = Array.from(new Set(publishedResults.map((result) => result.student_id)));
  let students: ReportStudent[] = [];
  if (studentIds.length) {
    const { data, error } = await supabase.from("education_students")
      .select("id, branch_id, student_number, first_name, last_name, other_names")
      .eq("org_id", context.orgId)
      .in("branch_id", branchIds)
      .in("id", studentIds)
      .order("last_name")
      .order("first_name")
      .order("id");
    if (error) throw new Error(`Could not load students for report cards: ${error.message}`);
    students = (data ?? []) as ReportStudent[];
  }

  const studentIdsInReport = new Set(students.map((student) => student.id));
  const resultsByStudent = new Map<string, PublishedResult[]>();
  for (const result of publishedResults) {
    if (!studentIdsInReport.has(result.student_id)) continue;
    const current = resultsByStudent.get(result.student_id) ?? [];
    current.push(result);
    resultsByStudent.set(result.student_id, current);
  }

  const attendanceByStudent = new Map<string, Map<string, number>>();
  let attendanceTooLarge = false;
  if (canViewAttendance && selectedTerm && branchIds.length && studentIdsInReport.size) {
    const { data, count, error } = await supabase.from("education_attendance")
      .select("student_id, status", { count: "exact" })
      .eq("org_id", context.orgId)
      .in("branch_id", branchIds)
      .gte("attendance_date", selectedTerm.starts_on)
      .lte("attendance_date", selectedTerm.ends_on)
      .not("student_id", "is", null)
      .order("student_id")
      .order("id")
      .range(0, MAX_REPORT_ATTENDANCE - 1);
    if (error) throw new Error(`Could not load term attendance for report cards: ${error.message}`);
    attendanceTooLarge = (count ?? 0) > MAX_REPORT_ATTENDANCE;
    if (!attendanceTooLarge) {
      for (const row of data ?? []) {
        if (!row.student_id || !studentIdsInReport.has(row.student_id)) continue;
        const counts = attendanceByStudent.get(row.student_id) ?? new Map<string, number>();
        counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
        attendanceByStudent.set(row.student_id, counts);
      }
    }
  }

  const examNameById = new Map(publishedExams.map((exam) => [exam.id, exam.name]));
  const canPrintReports = canExportResults;
  let reportCards: Array<{
    report_card_id: string;
    student_id: string;
    branch_id: string;
    status: "draft" | "published";
    teacher_comment: string | null;
    principal_comment: string | null;
    published_at: string | null;
  }> = [];
  if (selectedTerm && branchIds.length) {
    const { data, error } = await supabase.rpc("education_get_report_cards", {
      p_org_id: context.orgId,
      p_branch_ids: branchIds,
      p_term_id: selectedTerm.id,
    });
    if (error) throw new Error(`Could not load report-card reviews: ${error.message}`);
    reportCards = data ?? [];
  }
  const reportCardByStudent = new Map(reportCards.map((report) => [report.student_id, report]));
  let acknowledgements: Array<{
    report_card_id: string;
    student_id: string;
    guardian_id: string;
    guardian_name: string;
    comment: string | null;
    acknowledged_at: string;
  }> = [];
  if (selectedTerm && branchIds.length && canViewGuardians) {
    const { data, error } = await supabase.rpc("education_get_report_card_acknowledgements", {
      p_org_id: context.orgId,
      p_branch_ids: branchIds,
      p_term_id: selectedTerm.id,
    });
    if (error) throw new Error(`Could not load report-card acknowledgements: ${error.message}`);
    acknowledgements = data ?? [];
  }
  const visibleStudents = students.filter((student) => {
    if (!search) return true;
    return [
      student.student_number,
      student.first_name,
      student.last_name,
      student.other_names ?? "",
    ].join(" ").toLocaleLowerCase().includes(search);
  });

  return <main className={`education-report-cards mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 ${canPrintReports ? "print-authorized" : ""}`}>
    <style>{`
      @media print {
        @page { margin: 12mm; }
        body { background: white !important; }
        body * { visibility: hidden !important; }
        .education-report-cards.print-authorized, .education-report-cards.print-authorized * { visibility: visible !important; }
        .education-report-cards.print-authorized { position: absolute; inset: 0; width: 100%; max-width: none; padding: 0; }
        .report-controls, .no-print { display: none !important; }
        .report-card { break-after: page; page-break-after: always; box-shadow: none !important; }
        .report-card:last-child { break-after: auto; page-break-after: auto; }
      }
    `}</style>
    <header className="report-controls flex flex-wrap items-end justify-between gap-4">
      <div>
        <Link href={getProductAppPath("think-education", "/results")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
          <ArrowLeft className="h-4 w-4" /> Results
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">Term report cards</h1>
        <p className="mt-1 text-sm text-slate-600">Printable summaries of published term results and attendance when permitted. Each exam is listed separately; no cross-exam average is inferred.</p>
      </div>
      {canPrintReports && visibleStudents.length > 0 && !reportTooLarge && !attendanceTooLarge && <ReportCardsPrintButton />}
    </header>

    <form method="get" className="report-controls grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_1fr_1fr_auto]">
      <label className="text-sm font-medium text-slate-700">Academic term
        <select name="term" defaultValue={selectedTerm?.id ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
          {availableTerms.map((term) => (
            <option key={term.id} value={term.id}>
              {academicYearName.get(term.academic_year_id) ?? "Academic year"} · {term.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium text-slate-700">Campus
        <select name="branch" defaultValue={requestedBranch} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
          <option value="">All accessible campuses</option>
          {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium text-slate-700">Find student
        <input name="search" defaultValue={getParam(params, "search")} maxLength={80} placeholder="Name or student number" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
      </label>
      <div className="flex items-end gap-2">
        <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Apply filters</button>
        <Link href={getProductAppPath("think-education", "/results/report-cards")} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Reset</Link>
      </div>
    </form>

    {params.saved === "1" && <p role="status" className="report-controls rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">Report-card comments saved.</p>}
    {params.published === "1" && <p role="status" className="report-controls rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">Report card published.</p>}
    {params.bulkPublished !== undefined && <p role="status" className="report-controls rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
      {params.bulkPublished} saved report card{params.bulkPublished === "1" ? "" : "s"} published
      {params.bulkSkipped !== undefined && Number(params.bulkSkipped) > 0 ? ` · ${params.bulkSkipped} unsaved report card${params.bulkSkipped === "1" ? "" : "s"} skipped` : ""}.
    </p>}
    {params.error && <p role="alert" className="report-controls rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
      {params.error === "no-published-results"
        ? "Published examination results are required before this report card can be saved."
        : params.error === "not-saved"
          ? "Save the report card before publishing it."
          : "The report-card action could not be completed."}
    </p>}

    {!canPrintReports && visibleStudents.length > 0 && <p className="report-controls rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      You can view these report cards, but export permission is required to print or save them.
    </p>}

    {!selectedTerm ? <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
      <FileText className="mx-auto h-10 w-10 text-slate-300" />
      <h2 className="mt-3 font-semibold text-slate-900">No academic terms available</h2>
      <p className="mt-1 text-sm text-slate-500">Create an academic term before generating report cards.</p>
    </section> : reportTooLarge || attendanceTooLarge ? <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      This term contains more records than the safe print limit. Filter to one campus and try again.
    </p> : visibleStudents.length === 0 ? <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
      <FileText className="mx-auto h-10 w-10 text-slate-300" />
      <h2 className="mt-3 font-semibold text-slate-900">{search ? "No students match this search" : "No published results for this term"}</h2>
      <p className="mt-1 text-sm text-slate-500">{search ? "Try a different name or student number." : "Only results from published examinations are included in report cards."}</p>
    </section> : <div className="space-y-5">
      <div className="report-controls flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          {visibleStudents.length.toLocaleString()} student report card{visibleStudents.length === 1 ? "" : "s"} · Published exams only
        </p>
        {requestedBranch && canApproveResults && canPublishResults && (() => {
          const bulkEligibleIds = visibleStudents
            .filter((student) => reportCardByStudent.get(student.id)?.status === "draft")
            .map((student) => student.id);
          return bulkEligibleIds.length > 0
            ? <form action={publishEducationReportCardsBulk}>
              <input type="hidden" name="branch_id" value={requestedBranch} />
              <input type="hidden" name="term_id" value={selectedTerm.id} />
              {bulkEligibleIds.map((studentId) => <input key={studentId} type="hidden" name="student_ids" value={studentId} />)}
              <button
                type="submit"
                className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
              >
                Publish {bulkEligibleIds.length} saved card{bulkEligibleIds.length === 1 ? "" : "s"}
              </button>
            </form>
            : null;
        })()}
      </div>
      {visibleStudents.map((student) => {
        const studentResults = resultsByStudent.get(student.id) ?? [];
        const groupedByExam = new Map<string, PublishedResult[]>();
        for (const result of studentResults) {
          const current = groupedByExam.get(result.examination_id) ?? [];
          current.push(result);
          groupedByExam.set(result.examination_id, current);
        }
        const attendanceCounts = attendanceByStudent.get(student.id) ?? new Map<string, number>();
        const reportCard = reportCardByStudent.get(student.id);
        const fullName = [student.first_name, student.other_names, student.last_name].filter(Boolean).join(" ");

        return <article key={student.id} className="report-card rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <header className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div className="flex items-center gap-3">
              {institutionLogoUrl
                ? <img src={institutionLogoUrl} alt="" className="h-14 w-14 rounded-lg border border-slate-200 object-contain p-1" />
                : null}
              <div>
                <p className="text-lg font-bold text-slate-950">{institutionName}</p>
                {institution?.institution_code && <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{institution.institution_code}</p>}
              </div>
            </div>
            <p className="text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Official report card</p>
          </header>
          <div className="border-b border-slate-200 pb-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Student report card</p>
            <h2 className="mt-1 text-xl font-bold text-slate-950">{fullName}</h2>
            <div className="mt-2 grid gap-1 text-sm text-slate-600 sm:grid-cols-3">
              <p>Student number: <strong className="text-slate-900">{student.student_number}</strong></p>
              <p>Campus: <strong className="text-slate-900">{campusNameById.get(student.branch_id) ?? "Campus"}</strong></p>
              <p>Academic period: <strong className="text-slate-900">{academicYearName.get(selectedTerm.academic_year_id) ?? "Academic year"} · {selectedTerm.name}</strong></p>
            </div>
            <p className="mt-1 text-xs text-slate-500">{formatDate(selectedTerm.starts_on)} – {formatDate(selectedTerm.ends_on)}</p>
          </div>

          <section className="mt-5">
            <h3 className="font-semibold text-slate-900">Published academic results</h3>
            {[...groupedByExam.entries()].map(([examId, examResults]) => (
              <div key={examId} className="mt-3">
                <h4 className="text-sm font-semibold text-slate-700">{examNameById.get(examId) ?? "Examination"}</h4>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[500px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr><th className="px-3 py-2">Subject</th><th className="px-3 py-2">Score</th><th className="px-3 py-2">Percent</th><th className="px-3 py-2">Grade</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {examResults.map((result, index) => {
                        const score = Number(result.score);
                        const maximum = Number(result.maximum_score);
                        return <tr key={`${result.subject_name}-${index}`}>
                          <td className="px-3 py-2 font-medium text-slate-800">{result.subject_name}</td>
                          <td className="px-3 py-2">{score} / {maximum}</td>
                          <td className="px-3 py-2">{maximum > 0 ? `${((score / maximum) * 100).toFixed(1)}%` : "—"}</td>
                          <td className="px-3 py-2 font-semibold">{result.grade ?? "—"}</td>
                        </tr>;
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </section>

          {canViewAttendance && <section className={`mt-5 border-t border-slate-200 pt-4 ${canExportAttendance ? "" : "no-print"}`}>
            <h3 className="font-semibold text-slate-900">Term attendance</h3>
            <p className="mt-1 text-xs text-slate-500">Recorded attendance from {formatDate(selectedTerm.starts_on)} to {formatDate(selectedTerm.ends_on)}.</p>
            {attendanceCounts.size ? <div className="mt-3 flex flex-wrap gap-2">
              {[...attendanceCounts.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([status, count]) => (
                <span key={status} className="rounded-lg bg-slate-100 px-3 py-2 text-sm capitalize text-slate-700">
                  {status.replaceAll("_", " ")}: <strong>{count}</strong>
                </span>
              ))}
            </div> : <p className="mt-2 text-sm text-slate-500">No attendance records were found for this term.</p>}
          </section>}

          {(reportCard?.teacher_comment || reportCard?.principal_comment) && <section className="mt-5 border-t border-slate-200 pt-4">
            <h3 className="font-semibold text-slate-900">Comments</h3>
            {reportCard?.teacher_comment && <p className="mt-2 text-sm"><strong>Class teacher:</strong> {reportCard.teacher_comment}</p>}
            {reportCard?.principal_comment && <p className="mt-2 text-sm"><strong>Principal / head teacher:</strong> {reportCard.principal_comment}</p>}
            {reportCard?.status === "published" && <p className="mt-2 text-xs font-semibold text-emerald-700">Published{reportCard.published_at ? ` ${new Date(reportCard.published_at).toLocaleDateString()}` : ""}</p>}
            {reportCard?.status === "draft" && <p className="mt-2 text-xs font-semibold text-amber-700">Draft — not published</p>}
          </section>}

          {canViewGuardians && reportCard?.status === "published" && <section className={`mt-5 border-t border-slate-200 pt-4 ${canExportGuardians ? "" : "no-print"}`}>
            <h3 className="font-semibold text-slate-900">Guardian acknowledgements</h3>
            {acknowledgements.filter((ack) => ack.report_card_id === reportCard.report_card_id).length > 0
              ? <ul className="mt-3 space-y-2">
                {acknowledgements.filter((ack) => ack.report_card_id === reportCard.report_card_id).map((ack) => <li key={ack.guardian_id} className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
                  <p className="font-semibold text-emerald-900">{ack.guardian_name}</p>
                  <p className="mt-1 text-xs text-emerald-800">Acknowledged {new Date(ack.acknowledged_at).toLocaleString()}</p>
                  {ack.comment && <p className="mt-2 text-slate-700">{ack.comment}</p>}
                </li>)}
              </ul>
              : <p className="mt-2 text-sm text-slate-500">No guardian acknowledgement has been recorded.</p>}
          </section>}

          {canEditResults && reportCard?.status !== "published" && <section className="report-controls mt-5 border-t border-slate-200 pt-4">
            <h3 className="font-semibold text-slate-900">Review comments</h3>
            <form action={saveEducationReportCard} className="mt-3 grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="branch_id" value={student.branch_id} />
              <input type="hidden" name="term_id" value={selectedTerm.id} />
              <input type="hidden" name="student_id" value={student.id} />
              <label className="text-sm font-medium text-slate-700">Class teacher comment
                <textarea name="teacher_comment" maxLength={2000} rows={3} defaultValue={reportCard?.teacher_comment ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
              </label>
              <label className="text-sm font-medium text-slate-700">Principal / head teacher comment
                <textarea name="principal_comment" maxLength={2000} rows={3} defaultValue={reportCard?.principal_comment ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
              </label>
              <div className="sm:col-span-2 flex flex-wrap gap-2">
                <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">Save review</button>
                {canApproveResults && canPublishResults && <button
                  formAction={publishEducationReportCard}
                  type="submit"
                  className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
                >Publish report card</button>}
              </div>
            </form>
          </section>}

          {canApproveResults && canPublishResults && reportCard?.status === "draft" && <form action={publishEducationReportCard} className="report-controls mt-4">
            <input type="hidden" name="branch_id" value={student.branch_id} />
            <input type="hidden" name="term_id" value={selectedTerm.id} />
            <input type="hidden" name="student_id" value={student.id} />
            <button type="submit" className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100">Publish report card</button>
          </form>}
        </article>;
      })}
    </div>}
  </main>;
}
