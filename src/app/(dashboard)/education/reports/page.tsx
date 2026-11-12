import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowDownToLine, ArrowLeft, BarChart3, CalendarCheck, Users } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import { summarizeEducationOutcomes } from "@/lib/education/outcomes";
import { summarizeEducationEnrollments, type EducationEnrollmentStatus } from "@/lib/education/enrollment-report";

const REPORT_LIMIT = 5000;
const STAFF_STATUSES = ["active", "on_leave", "inactive", "suspended", "archived"] as const;
const STAFF_CATEGORIES = ["teaching", "non_teaching"] as const;
const ATTENDANCE_STATUSES = ["present", "absent", "late", "excused"] as const;
const ENROLLMENT_STATUSES = ["active", "completed", "withdrawn", "transferred"] as const;
type StaffStatus = typeof STAFF_STATUSES[number];
type StaffCategory = typeof STAFF_CATEGORIES[number];
type AttendanceStatus = typeof ATTENDANCE_STATUSES[number];
type SearchParams = Record<string, string | string[] | undefined>;

function getParam(params: SearchParams, key: string) {
  return typeof params[key] === "string" ? params[key] as string : "";
}

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export default async function EducationReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  const [
    canViewStaff,
    canExportStaff,
    canViewAttendanceReport,
    canExportAttendanceReport,
    canViewAttendanceRecords,
    canExportAttendanceRecords,
    canViewOutcomesReport,
    canExportOutcomesReport,
    canViewResults,
    canExportResults,
    canViewExaminations,
    canViewEnrollmentReport,
    canExportEnrollmentReport,
    canViewStudents,
    canExportStudents,
  ] = await Promise.all([
    canTabPermission("education_reports", "reports", "staff", "view"),
    canTabPermission("education_reports", "reports", "staff", "export"),
    canTabPermission("education_reports", "reports", "attendance", "view"),
    canTabPermission("education_reports", "reports", "attendance", "export"),
    canTabPermission("education_attendance", "attendance", "register", "view"),
    canTabPermission("education_attendance", "attendance", "register", "export"),
    canTabPermission("education_reports", "reports", "outcomes", "view"),
    canTabPermission("education_reports", "reports", "outcomes", "export"),
    canTabPermission("education_results", "results", "gradebook", "view"),
    canTabPermission("education_results", "results", "gradebook", "export"),
    canTabPermission("education_examinations", "examinations", "schedule", "view"),
    canTabPermission("education_reports", "reports", "enrollment", "view"),
    canTabPermission("education_reports", "reports", "enrollment", "export"),
    canTabPermission("education_students", "students", "list", "view"),
    canTabPermission("education_students", "students", "list", "export"),
  ]);
  const canViewAttendance = canViewAttendanceReport && canViewAttendanceRecords;
  const canExportAttendance = canViewAttendance && canExportAttendanceReport && canExportAttendanceRecords;
  const canViewOutcomes = canViewOutcomesReport && canViewResults && canViewExaminations;
  const canExportOutcomes = canViewOutcomes && canExportOutcomesReport && canExportResults;
  const canViewEnrollment = canViewEnrollmentReport && canViewStudents;
  const canExportEnrollment = canViewEnrollment && canExportEnrollmentReport && canExportStudents;
  if (!canViewStaff && !canViewAttendance && !canViewOutcomes && !canViewEnrollment) {
    redirect("/dashboard?accessDenied=think-education.reports");
  }

  const params = await searchParams;
  const campusAccess = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const campuses = campusAccess.campuses;
  const campusIds = campuses.map((campus) => campus.id);
  const requestedBranch = getParam(params, "branch");
  const branchId = campusIds.includes(requestedBranch) ? requestedBranch : "";
  const requestedCategory = getParam(params, "category");
  const category = STAFF_CATEGORIES.includes(requestedCategory as StaffCategory)
    ? requestedCategory as StaffCategory
    : "";
  const requestedStatus = getParam(params, "status");
  const status = STAFF_STATUSES.includes(requestedStatus as StaffStatus)
    ? requestedStatus as StaffStatus
    : "";
  const branchIds = branchId ? [branchId] : campusIds;
  const attendanceToday = new Date().toISOString().slice(0, 10);
  const attendanceDefaultFrom = new Date(`${attendanceToday}T00:00:00.000Z`);
  attendanceDefaultFrom.setUTCDate(attendanceDefaultFrom.getUTCDate() - 29);
  const attendanceDefaultFromText = attendanceDefaultFrom.toISOString().slice(0, 10);
  const requestedAttendanceFrom = getParam(params, "attendance_from");
  const requestedAttendanceTo = getParam(params, "attendance_to");
  const parsedAttendanceFrom = isValidDate(requestedAttendanceFrom) ? requestedAttendanceFrom : attendanceDefaultFromText;
  const parsedAttendanceTo = isValidDate(requestedAttendanceTo) ? requestedAttendanceTo : attendanceToday;
  const validAttendanceRange = parsedAttendanceFrom <= parsedAttendanceTo;
  const attendanceFrom = validAttendanceRange ? parsedAttendanceFrom : attendanceDefaultFromText;
  const attendanceTo = validAttendanceRange ? parsedAttendanceTo : attendanceToday;
  const attendanceStatusParam = getParam(params, "attendance_status");
  const attendanceStatus = ATTENDANCE_STATUSES.includes(attendanceStatusParam as AttendanceStatus)
    ? attendanceStatusParam as AttendanceStatus
    : "";
  const requestedAttendanceBranch = getParam(params, "attendance_branch");
  const attendanceBranchId = campusIds.includes(requestedAttendanceBranch) ? requestedAttendanceBranch : "";
  const attendanceBranchIds = attendanceBranchId ? [attendanceBranchId] : campusIds;
  const requestedOutcomesBranch = getParam(params, "outcomes_branch");
  const outcomesBranchId = campusIds.includes(requestedOutcomesBranch) ? requestedOutcomesBranch : "";
  const outcomesBranchIds = outcomesBranchId ? [outcomesBranchId] : campusIds;
  const requestedEnrollmentBranch = getParam(params, "enrollment_branch");
  const enrollmentBranchId = campusIds.includes(requestedEnrollmentBranch) ? requestedEnrollmentBranch : "";
  const enrollmentBranchIds = enrollmentBranchId ? [enrollmentBranchId] : campusIds;
  const requestedEnrollmentStatus = getParam(params, "enrollment_status");
  const enrollmentStatus = ENROLLMENT_STATUSES.includes(requestedEnrollmentStatus as EducationEnrollmentStatus)
    ? requestedEnrollmentStatus as EducationEnrollmentStatus
    : "";
  const supabase = await createClient();
  let publishedExams: Array<{ id: string; branch_id: string; name: string; starts_at: string | null }> = [];
  if (canViewOutcomes && outcomesBranchIds.length) {
    const { data, error } = await supabase.from("education_examinations")
      .select("id, branch_id, name, starts_at")
      .eq("org_id", context.orgId).in("branch_id", outcomesBranchIds).eq("status", "published")
      .order("starts_at", { ascending: false });
    if (error) throw new Error(`Could not load published examinations for the academic outcomes report: ${error.message}`);
    publishedExams = data ?? [];
  }
  const requestedExamId = getParam(params, "outcomes_exam");
  const selectedExam = publishedExams.find((exam) => exam.id === requestedExamId) ?? publishedExams[0] ?? null;
  let academicYears: Array<{ id: string; name: string }> = [];
  if (canViewEnrollment && enrollmentBranchIds.length) {
    const { data, error } = await supabase.from("education_academic_years")
      .select("id, name")
      .eq("org_id", context.orgId).order("starts_on", { ascending: false });
    if (error) throw new Error(`Could not load academic years for the enrollment report: ${error.message}`);
    academicYears = data ?? [];
  }
  const requestedEnrollmentYear = getParam(params, "enrollment_year");
  const enrollmentYearId = academicYears.some((year) => year.id === requestedEnrollmentYear)
    ? requestedEnrollmentYear
    : "";
  let enrollmentRecords: Array<{
    branch_id: string;
    academic_year_id: string;
    class_id: string;
    status: EducationEnrollmentStatus;
  }> = [];
  let enrollmentCount = 0;
  if (canViewEnrollment && enrollmentBranchIds.length) {
    let query = supabase.from("education_student_enrollments")
      .select("branch_id, academic_year_id, class_id, status", { count: "exact" })
      .eq("org_id", context.orgId).in("branch_id", enrollmentBranchIds)
      .order("branch_id").order("academic_year_id").order("class_id").order("id")
      .range(0, REPORT_LIMIT - 1);
    if (enrollmentYearId) query = query.eq("academic_year_id", enrollmentYearId);
    if (enrollmentStatus) query = query.eq("status", enrollmentStatus);
    const { data, count, error } = await query;
    if (error) throw new Error(`Could not load Think Education enrollment report: ${error.message}`);
    enrollmentRecords = (data ?? []) as typeof enrollmentRecords;
    enrollmentCount = count ?? 0;
  }
  const enrollmentSummaries = summarizeEducationEnrollments(enrollmentRecords);
  const classIds = Array.from(new Set(enrollmentSummaries.map((summary) => summary.class_id)));
  let reportClasses: Array<{ id: string; name: string }> = [];
  if (classIds.length && enrollmentBranchIds.length) {
    const { data, error } = await supabase.from("education_classes")
      .select("id, name")
      .eq("org_id", context.orgId).in("branch_id", enrollmentBranchIds).in("id", classIds);
    if (error) throw new Error(`Could not load classes for the enrollment report: ${error.message}`);
    reportClasses = data ?? [];
  }
  const classNameById = new Map(reportClasses.map((classRecord) => [classRecord.id, classRecord.name]));
  const academicYearNameById = new Map(academicYears.map((year) => [year.id, year.name]));
  const enrollmentRows = enrollmentSummaries.map((summary) => ({
    ...summary,
    campus: campuses.find((campus) => campus.id === summary.branch_id)?.name ?? "Campus",
    academic_year: academicYearNameById.get(summary.academic_year_id) ?? "Academic year",
    class_name: classNameById.get(summary.class_id) ?? "Class",
  }));

  let staff: Array<{
    branch_id: string;
    staff_category: StaffCategory;
    status: StaffStatus;
  }> = [];
  let totalCount = 0;
  if (canViewStaff && branchIds.length) {
    let query = supabase.from("education_staff")
      .select("branch_id, staff_category, status", { count: "exact" })
      .eq("org_id", context.orgId).in("branch_id", branchIds)
      .order("branch_id").order("staff_category").order("status").order("id")
      .range(0, REPORT_LIMIT - 1);
    if (category) query = query.eq("staff_category", category);
    if (status) query = query.eq("status", status);
    const { data, count, error } = await query;
    if (error) throw new Error(`Could not load Think Education staff report: ${error.message}`);
    staff = data ?? [];
    totalCount = count ?? 0;
  }

  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const groupedCounts = new Map<string, number>();
  for (const member of staff) {
    const key = `${member.branch_id}:${member.staff_category}:${member.status}`;
    groupedCounts.set(key, (groupedCounts.get(key) ?? 0) + 1);
  }
  const rows = Array.from(groupedCounts, ([key, count]) => {
    const [branch, staffCategory, staffStatus] = key.split(":");
    return {
      branchId: branch,
      campus: campusNameById.get(branch) ?? "Campus",
      category: staffCategory as StaffCategory,
      status: staffStatus as StaffStatus,
      count,
    };
  }).sort((left, right) => left.campus.localeCompare(right.campus)
    || left.category.localeCompare(right.category)
    || left.status.localeCompare(right.status));
  let attendance: Array<{
    branch_id: string;
    attendance_date: string;
    status: AttendanceStatus;
  }> = [];
  let attendanceCount = 0;
  if (canViewAttendance && attendanceBranchIds.length && attendanceFrom <= attendanceTo) {
    let query = supabase.from("education_attendance")
      .select("branch_id, attendance_date, status", { count: "exact" })
      .eq("org_id", context.orgId).in("branch_id", attendanceBranchIds)
      .not("student_id", "is", null)
      .gte("attendance_date", attendanceFrom).lte("attendance_date", attendanceTo)
      .order("attendance_date").order("branch_id").order("id")
      .range(0, REPORT_LIMIT - 1);
    if (attendanceStatus) query = query.eq("status", attendanceStatus);
    const { data, count, error } = await query;
    if (error) throw new Error(`Could not load Think Education student attendance report: ${error.message}`);
    attendance = (data ?? []) as typeof attendance;
    attendanceCount = count ?? 0;
  }
  const attendanceGroupedCounts = new Map<string, number>();
  for (const record of attendance) {
    const key = `${record.branch_id}:${record.status}`;
    attendanceGroupedCounts.set(key, (attendanceGroupedCounts.get(key) ?? 0) + 1);
  }
  const attendanceRows = Array.from(attendanceGroupedCounts, ([key, count]) => {
    const [branch, status] = key.split(":");
    return {
      branchId: branch,
      campus: campusNameById.get(branch) ?? "Campus",
      status: status as AttendanceStatus,
      count,
    };
  }).sort((left, right) => left.campus.localeCompare(right.campus) || left.status.localeCompare(right.status));
  let outcomeRows: ReturnType<typeof summarizeEducationOutcomes> = [];
  let outcomeCount = 0;
  if (canViewOutcomes && selectedExam) {
    const { data, count, error } = await supabase.from("education_results")
      .select("branch_id, subject_name, score, maximum_score, grade", { count: "exact" })
      .eq("org_id", context.orgId).eq("examination_id", selectedExam.id).eq("status", "published")
      .order("branch_id").order("subject_name").order("id").range(0, REPORT_LIMIT - 1);
    if (error) throw new Error(`Could not load published Think Education results: ${error.message}`);
    outcomeRows = summarizeEducationOutcomes((data ?? []).map((result) => ({
      ...result,
      score: Number(result.score),
      maximum_score: Number(result.maximum_score),
    })));
    outcomeCount = count ?? 0;
  }
  const queryString = new URLSearchParams();
  if (branchId) queryString.set("branch", branchId);
  if (category) queryString.set("category", category);
  if (status) queryString.set("status", status);
  const filterSuffix = queryString.toString();
  const exportHref = `/api/education/reports/staff${filterSuffix ? `?${filterSuffix}` : ""}`;
  const attendanceExportParams = new URLSearchParams({ from: attendanceFrom, to: attendanceTo });
  if (attendanceBranchId) attendanceExportParams.set("branch", attendanceBranchId);
  if (attendanceStatus) attendanceExportParams.set("status", attendanceStatus);
  const attendanceExportHref = `/api/education/reports/attendance?${attendanceExportParams.toString()}`;
  const outcomeExportParams = selectedExam ? new URLSearchParams({ examination: selectedExam.id }) : null;
  if (outcomeExportParams && outcomesBranchId) outcomeExportParams.set("branch", outcomesBranchId);
  const outcomeExportHref = `/api/education/reports/outcomes${outcomeExportParams ? `?${outcomeExportParams.toString()}` : ""}`;
  const enrollmentExportParams = new URLSearchParams();
  if (enrollmentBranchId) enrollmentExportParams.set("branch", enrollmentBranchId);
  if (enrollmentYearId) enrollmentExportParams.set("year", enrollmentYearId);
  if (enrollmentStatus) enrollmentExportParams.set("status", enrollmentStatus);
  const enrollmentExportQuery = enrollmentExportParams.toString();
  const enrollmentExportHref = `/api/education/reports/enrollment${enrollmentExportQuery ? `?${enrollmentExportQuery}` : ""}`;

  return <main className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
    <header>
      <Link href={getProductAppPath("think-education", "/dashboard")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Education Reports</h1>
          <p className="mt-1 text-sm text-slate-600">Campus-scoped staff, attendance, academic outcomes, and enrollment summaries.</p>
        </div>
        {canExportStaff && canViewStaff && <a href={exportHref} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
          <ArrowDownToLine className="h-4 w-4" /> Download CSV
        </a>}
      </div>
    </header>

    {canViewStaff && <>
    <form method="get" className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-4">
      <label className="text-sm font-medium text-slate-700">Campus
        <select name="branch" defaultValue={branchId} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
          <option value="">All assigned campuses</option>
          {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium text-slate-700">Staff category
        <select name="category" defaultValue={category} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
          <option value="">All categories</option><option value="teaching">Teaching</option><option value="non_teaching">Non-teaching</option>
        </select>
      </label>
      <label className="text-sm font-medium text-slate-700">Status
        <select name="status" defaultValue={status} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
          <option value="">All statuses</option>
          {STAFF_STATUSES.map((value) => <option key={value} value={value}>{label(value)}</option>)}
        </select>
      </label>
      <div className="flex items-end gap-2">
        <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Apply filters</button>
        <Link href={getProductAppPath("think-education", "/reports")} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Reset</Link>
      </div>
    </form>

    <section className="grid gap-3 sm:grid-cols-3">
      <article className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div><p className="text-sm text-slate-500">Matching staff</p><p className="mt-1 text-2xl font-bold text-slate-950">{totalCount.toLocaleString()}</p></div>
        <Users className="h-6 w-6 text-blue-700" />
      </article>
      <article className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div><p className="text-sm text-slate-500">Campuses in scope</p><p className="mt-1 text-2xl font-bold text-slate-950">{branchId ? 1 : campuses.length}</p></div>
        <BarChart3 className="h-6 w-6 text-blue-700" />
      </article>
      <article className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div><p className="text-sm text-slate-500">Groups</p><p className="mt-1 text-2xl font-bold text-slate-950">{rows.length}</p></div>
        <BarChart3 className="h-6 w-6 text-blue-700" />
      </article>
    </section>

    {totalCount > REPORT_LIMIT && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      The on-screen breakdown shows the first {REPORT_LIMIT.toLocaleString()} of {totalCount.toLocaleString()} matching records. Narrow the filters to see a complete breakdown and keep exports within the supported limit.
    </p>}

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="font-semibold text-slate-950">Staff headcount</h2>
      </div>
      {rows.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No staff records match these filters in your assigned campuses.</p> : <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-4 py-3">Campus</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Staff count</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => <tr key={`${row.branchId}:${row.category}:${row.status}`}>
              <td className="px-4 py-3 font-medium text-slate-900">{row.campus}</td>
              <td className="px-4 py-3 text-slate-700">{label(row.category)}</td>
              <td className="px-4 py-3 text-slate-700">{label(row.status)}</td>
              <td className="px-4 py-3 text-right font-semibold text-slate-900">{row.count.toLocaleString()}</td>
            </tr>)}
          </tbody>
        </table>
      </div>}
    </section>
    </>}

    {canViewAttendance && <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Student attendance</h2>
          <p className="mt-1 text-sm text-slate-600">Daily attendance records by campus and status. Student names and notes are not included.</p>
        </div>
        {canExportAttendance && <a href={attendanceExportHref} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
          <ArrowDownToLine className="h-4 w-4" /> Download attendance CSV
        </a>}
      </div>
      <form method="get" className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-sm font-medium text-slate-700">From
          <input required type="date" name="attendance_from" defaultValue={attendanceFrom} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">To
          <input required type="date" name="attendance_to" defaultValue={attendanceTo} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Campus
          <select name="attendance_branch" defaultValue={attendanceBranchId} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">All assigned campuses</option>
            {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Status
          <select name="attendance_status" defaultValue={attendanceStatus} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">All statuses</option>
            {ATTENDANCE_STATUSES.map((value) => <option key={value} value={value}>{label(value)}</option>)}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Apply filters</button>
        </div>
      </form>
      {!validAttendanceRange && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">The start date must be on or before the end date. Showing the default 30-day range.</p>}
      <section className="grid gap-3 sm:grid-cols-3">
        <article className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div><p className="text-sm text-slate-500">Matching attendance records</p><p className="mt-1 text-2xl font-bold text-slate-950">{attendanceCount.toLocaleString()}</p></div>
          <CalendarCheck className="h-6 w-6 text-blue-700" />
        </article>
        <article className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div><p className="text-sm text-slate-500">Campuses in filter</p><p className="mt-1 text-2xl font-bold text-slate-950">{attendanceBranchId ? 1 : campuses.length}</p></div>
          <BarChart3 className="h-6 w-6 text-blue-700" />
        </article>
        <article className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div><p className="text-sm text-slate-500">Campus/status groups</p><p className="mt-1 text-2xl font-bold text-slate-950">{attendanceRows.length}</p></div>
          <BarChart3 className="h-6 w-6 text-blue-700" />
        </article>
      </section>
      {attendanceCount > REPORT_LIMIT && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        The on-screen breakdown shows the first {REPORT_LIMIT.toLocaleString()} of {attendanceCount.toLocaleString()} matching records. Narrow the date range or filters for a complete breakdown and export.
      </p>}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {attendanceRows.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No student attendance records match these filters in your assigned campuses.</p> : <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3">Campus</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Records</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {attendanceRows.map((row) => <tr key={`${row.branchId}:${row.status}`}>
                <td className="px-4 py-3 font-medium text-slate-900">{row.campus}</td>
                <td className="px-4 py-3 text-slate-700">{label(row.status)}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900">{row.count.toLocaleString()}</td>
              </tr>)}
            </tbody>
          </table>
        </div>}
      </section>
    </section>}

    {canViewOutcomes && <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Academic outcomes</h2>
          <p className="mt-1 text-sm text-slate-600">Published result summaries by campus and subject. Averages are normalized by each score&apos;s maximum; no pass threshold is assumed.</p>
        </div>
        {canExportOutcomes && selectedExam && <a href={outcomeExportHref} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
          <ArrowDownToLine className="h-4 w-4" /> Download outcomes CSV
        </a>}
      </div>
      <form method="get" className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">Campus
          <select name="outcomes_branch" defaultValue={outcomesBranchId} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">All assigned campuses</option>
            {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Published examination
          <select required name="outcomes_exam" defaultValue={selectedExam?.id ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            {publishedExams.length === 0 && <option value="">No published examinations available</option>}
            {publishedExams.map((exam) => <option key={exam.id} value={exam.id}>
              {campusNameById.get(exam.branch_id) ?? "Campus"} · {exam.name}{exam.starts_at ? ` · ${new Date(exam.starts_at).toLocaleDateString()}` : ""}
            </option>)}
          </select>
        </label>
        <div>
          <button type="submit" disabled={!publishedExams.length} className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300">View outcomes</button>
        </div>
      </form>
      {!publishedExams.length ? <p className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Published examination results will appear here when available.</p> : <>
        <section className="grid gap-3 sm:grid-cols-3">
          <article className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div><p className="text-sm text-slate-500">Published subject results</p><p className="mt-1 text-2xl font-bold text-slate-950">{outcomeCount.toLocaleString()}</p></div>
            <Users className="h-6 w-6 text-blue-700" />
          </article>
          <article className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div><p className="text-sm text-slate-500">Subjects summarized</p><p className="mt-1 text-2xl font-bold text-slate-950">{outcomeRows.length.toLocaleString()}</p></div>
            <BarChart3 className="h-6 w-6 text-blue-700" />
          </article>
          <article className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div><p className="text-sm text-slate-500">Examination</p><p className="mt-1 truncate text-base font-bold text-slate-950">{selectedExam?.name}</p></div>
            <CalendarCheck className="h-6 w-6 text-blue-700" />
          </article>
        </section>
        {outcomeCount > REPORT_LIMIT && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          The on-screen breakdown shows the first {REPORT_LIMIT.toLocaleString()} of {outcomeCount.toLocaleString()} published results. Select a single campus to see a complete breakdown and export.
        </p>}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {outcomeRows.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No published subject results exist for this examination.</p> : <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-3">Campus</th><th className="px-4 py-3">Subject</th><th className="px-4 py-3 text-right">Results</th><th className="px-4 py-3 text-right">Average score</th><th className="px-4 py-3">Grade distribution</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {outcomeRows.map((row) => <tr key={`${row.branch_id}:${row.subject_name}`}>
                  <td className="px-4 py-3 font-medium text-slate-900">{campusNameById.get(row.branch_id) ?? "Campus"}</td>
                  <td className="px-4 py-3 text-slate-700">{row.subject_name}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">{row.result_count.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{row.average_percentage.toFixed(1)}%</td>
                  <td className="px-4 py-3 text-slate-700">{Object.entries(row.grade_counts).map(([grade, count]) => `${grade}: ${count}`).join(" · ")}</td>
                </tr>)}
              </tbody>
            </table>
          </div>}
        </section>
      </>}
    </section>}

    {canViewEnrollment && <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Enrollment &amp; progression</h2>
          <p className="mt-1 text-sm text-slate-600">Enrollment lifecycle totals by campus, academic year, and class. No student details are included.</p>
        </div>
        {canExportEnrollment && <a href={enrollmentExportHref} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
          <ArrowDownToLine className="h-4 w-4" /> Download enrollment CSV
        </a>}
      </div>
      <form method="get" className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm font-medium text-slate-700">Campus
          <select name="enrollment_branch" defaultValue={enrollmentBranchId} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">All assigned campuses</option>
            {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Academic year
          <select name="enrollment_year" defaultValue={enrollmentYearId} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">All academic years</option>
            {academicYears.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Enrollment status
          <select name="enrollment_status" defaultValue={enrollmentStatus} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">All statuses</option>
            {ENROLLMENT_STATUSES.map((value) => <option key={value} value={value}>{label(value)}</option>)}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Apply filters</button>
          <Link href={getProductAppPath("think-education", "/reports")} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Reset</Link>
        </div>
      </form>
      <section className="grid gap-3 sm:grid-cols-3">
        <article className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div><p className="text-sm text-slate-500">Matching enrollments</p><p className="mt-1 text-2xl font-bold text-slate-950">{enrollmentCount.toLocaleString()}</p></div>
          <Users className="h-6 w-6 text-blue-700" />
        </article>
        <article className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div><p className="text-sm text-slate-500">Classes summarized</p><p className="mt-1 text-2xl font-bold text-slate-950">{new Set(enrollmentRows.map((row) => row.class_id)).size.toLocaleString()}</p></div>
          <BarChart3 className="h-6 w-6 text-blue-700" />
        </article>
        <article className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div><p className="text-sm text-slate-500">Lifecycle groups</p><p className="mt-1 text-2xl font-bold text-slate-950">{enrollmentRows.length.toLocaleString()}</p></div>
          <BarChart3 className="h-6 w-6 text-blue-700" />
        </article>
      </section>
      {enrollmentCount > REPORT_LIMIT && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        The on-screen breakdown shows the first {REPORT_LIMIT.toLocaleString()} of {enrollmentCount.toLocaleString()} matching records. Narrow the filters to see a complete breakdown and keep exports within the supported limit.
      </p>}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {enrollmentRows.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No enrollments match these filters in your assigned campuses.</p> : <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3">Campus</th><th className="px-4 py-3">Academic year</th><th className="px-4 py-3">Class</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Enrollments</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {enrollmentRows.map((row) => <tr key={`${row.branch_id}:${row.academic_year_id}:${row.class_id}:${row.status}`}>
                <td className="px-4 py-3 font-medium text-slate-900">{row.campus}</td>
                <td className="px-4 py-3 text-slate-700">{row.academic_year}</td>
                <td className="px-4 py-3 text-slate-700">{row.class_name}</td>
                <td className="px-4 py-3 text-slate-700">{label(row.status)}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900">{row.enrollment_count.toLocaleString()}</td>
              </tr>)}
            </tbody>
          </table>
        </div>}
      </section>
    </section>}
  </main>;
}
