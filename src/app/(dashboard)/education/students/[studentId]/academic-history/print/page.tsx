import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AcademicHistoryPrintButton } from "./print-button";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import {
  getEducationInstitutionDisplayName,
  getEducationInstitutionLogoUrl,
} from "@/lib/education/institution-branding";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";

const MAX_ENROLLMENTS = 500;
const MAX_RESULTS = 1000;
const MAX_ATTENDANCE = 2000;
const MAX_TRANSFERS = 500;

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString();
}

export default async function StudentAcademicHistoryPrintPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(studentId)) {
    notFound();
  }

  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  const [canViewStudent, canExportStudent, canViewAcademics, canViewResults, canViewAttendance, canViewTransfers, { campuses }] = await Promise.all([
    canTabPermission("education_students", "students", "list", "view"),
    canTabPermission("education_students", "students", "list", "export"),
    canTabPermission("education_academics", "academics", "calendar", "view"),
    canTabPermission("education_results", "results", "gradebook", "view"),
    canTabPermission("education_attendance", "attendance", "register", "view"),
    canTabPermission("education_transfers", "transfers", "requests", "view"),
    getAccessibleEducationCampuses(context.orgId, context.userId),
  ]);
  if (!canViewStudent || !canExportStudent) {
    redirect("/dashboard?accessDenied=think-education.students");
  }

  const branchIds = campuses.map((campus) => campus.id);
  if (!branchIds.length) notFound();
  const supabase = await createClient();
  const { data: student, error: studentError } = await supabase.from("education_students")
    .select("id, branch_id, student_number, first_name, last_name, other_names, status, created_at")
    .eq("org_id", context.orgId)
    .eq("id", studentId)
    .in("branch_id", branchIds)
    .maybeSingle();
  if (studentError) throw new Error(`Could not load student academic history: ${studentError.message}`);
  if (!student) notFound();

  const [
    enrollmentResult,
    resultsResult,
    attendanceResult,
    transfersResult,
    institutionResult,
    companyResult,
  ] = await Promise.all([
    canViewAcademics
      ? supabase.from("education_student_enrollments")
        .select("id, branch_id, class_id, academic_year_id, status, enrolled_on, ended_on", { count: "exact" })
        .eq("org_id", context.orgId)
        .eq("student_id", student.id)
        .in("branch_id", branchIds)
        .order("enrolled_on", { ascending: false })
        .limit(MAX_ENROLLMENTS)
      : Promise.resolve({ data: [], error: null, count: 0 }),
    canViewResults
      ? supabase.from("education_results")
        .select("id, examination_id, subject_name, score, maximum_score, grade, created_at", { count: "exact" })
        .eq("org_id", context.orgId)
        .eq("student_id", student.id)
        .in("branch_id", branchIds)
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .limit(MAX_RESULTS)
      : Promise.resolve({ data: [], error: null, count: 0 }),
    canViewAttendance
      ? supabase.from("education_attendance")
        .select("id, branch_id, class_id, attendance_date, status", { count: "exact" })
        .eq("org_id", context.orgId)
        .eq("student_id", student.id)
        .in("branch_id", branchIds)
        .order("attendance_date", { ascending: false })
        .limit(MAX_ATTENDANCE)
      : Promise.resolve({ data: [], error: null, count: 0 }),
    canViewTransfers
      ? supabase.from("education_student_transfers")
        .select("id, source_branch_id, destination_branch_id, effective_on, reason, status, created_at", { count: "exact" })
        .eq("org_id", context.orgId)
        .eq("student_id", student.id)
        .in("source_branch_id", branchIds)
        .in("destination_branch_id", branchIds)
        .order("effective_on", { ascending: false })
        .limit(MAX_TRANSFERS)
      : Promise.resolve({ data: [], error: null, count: 0 }),
    supabase.from("education_institution_settings")
      .select("institution_name, institution_logo_url")
      .eq("org_id", context.orgId)
      .maybeSingle(),
    supabase.from("company_profile")
      .select("logo_url")
      .eq("org_id", context.orgId)
      .maybeSingle(),
  ]);

  const queryErrors = [
    ["enrollment history", enrollmentResult.error],
    ["published results", resultsResult.error],
    ["attendance history", attendanceResult.error],
    ["campus transfer history", transfersResult.error],
    ["institution branding", institutionResult.error],
    ["company branding", companyResult.error],
  ] as const;
  for (const [label, error] of queryErrors) {
    if (error) throw new Error(`Could not load ${label} for the academic history report: ${error.message}`);
  }

  const enrollments = enrollmentResult.data ?? [];
  const results = resultsResult.data ?? [];
  const attendance = attendanceResult.data ?? [];
  const transfers = transfersResult.data ?? [];
  const classIds = [...new Set([
    ...enrollments.map((row) => row.class_id),
    ...attendance.map((row) => row.class_id).filter((id): id is string => Boolean(id)),
  ])];
  const examinationIds = [...new Set(results.map((row) => row.examination_id))];
  const [
    classesResult,
    examinationsResult,
  ] = await Promise.all([
    classIds.length
      ? supabase.from("education_classes")
        .select("id, name, branch_id, class_teacher_id")
        .eq("org_id", context.orgId)
        .in("branch_id", branchIds)
        .in("id", classIds)
      : Promise.resolve({ data: [], error: null }),
    examinationIds.length
      ? supabase.from("education_examinations")
        .select("id, name, academic_year_id, term_id")
        .eq("org_id", context.orgId)
        .in("branch_id", branchIds)
        .in("id", examinationIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (classesResult.error) throw new Error(`Could not load academic classes for the report: ${classesResult.error.message}`);
  if (examinationsResult.error) throw new Error(`Could not load examinations for the report: ${examinationsResult.error.message}`);

  const classes = classesResult.data ?? [];
  const examinations = examinationsResult.data ?? [];
  const teacherIds = [...new Set(classes.map((row) => row.class_teacher_id).filter((id): id is string => Boolean(id)))];
  const yearIds = [...new Set([
    ...enrollments.map((row) => row.academic_year_id),
    ...examinations.map((row) => row.academic_year_id),
  ])];
  const termIds = [...new Set(examinations.map((row) => row.term_id).filter((id): id is string => Boolean(id)))];
  const [{ data: teachers, error: teachersError }, { data: years, error: yearsError }, { data: terms, error: termsError }] = await Promise.all([
    teacherIds.length
      ? supabase.from("education_staff")
        .select("id, first_name, last_name")
        .eq("org_id", context.orgId)
        .in("branch_id", branchIds)
        .in("id", teacherIds)
      : Promise.resolve({ data: [], error: null }),
    yearIds.length
      ? supabase.from("education_academic_years")
        .select("id, name")
        .eq("org_id", context.orgId)
        .in("id", yearIds)
      : Promise.resolve({ data: [], error: null }),
    termIds.length
      ? supabase.from("education_academic_terms")
        .select("id, name")
        .eq("org_id", context.orgId)
        .in("id", termIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (teachersError) throw new Error(`Could not load class teachers for the report: ${teachersError.message}`);
  if (yearsError) throw new Error(`Could not load academic years for the report: ${yearsError.message}`);
  if (termsError) throw new Error(`Could not load academic terms for the report: ${termsError.message}`);

  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const classById = new Map(classes.map((row) => [row.id, row]));
  const teacherById = new Map((teachers ?? []).map((row) => [row.id, `${row.first_name} ${row.last_name}`]));
  const yearNameById = new Map((years ?? []).map((row) => [row.id, row.name]));
  const termNameById = new Map((terms ?? []).map((row) => [row.id, row.name]));
  const examinationById = new Map(examinations.map((row) => [row.id, row]));
  const attendanceCounts = attendance.reduce<Record<string, number>>((counts, row) => {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
    return counts;
  }, {});
  const institutionName = getEducationInstitutionDisplayName(institutionResult.data?.institution_name, context.orgName);
  const institutionLogoUrl = getEducationInstitutionLogoUrl(
    institutionResult.data?.institution_logo_url,
    companyResult.data?.logo_url,
  );
  const reportGeneratedAt = new Date().toLocaleString();
  const fullName = [student.first_name, student.other_names, student.last_name].filter(Boolean).join(" ");

  return <main className="student-academic-history mx-auto w-full max-w-[1100px] space-y-6 p-6 text-slate-950">
    <style>{`
      @media print {
        @page { size: A4 portrait; margin: 14mm; }
        body { background: white !important; }
        body * { visibility: hidden !important; }
        .student-academic-history, .student-academic-history * { visibility: visible !important; }
        .student-academic-history { position: absolute; inset: 0; width: 100%; max-width: none; padding: 0; }
        .no-print { display: none !important; }
        thead { display: table-header-group; }
        tr { break-inside: avoid; }
        section { break-inside: auto; }
      }
    `}</style>

    <div className="no-print flex flex-wrap items-center justify-between gap-3">
      <Link href={getProductAppPath("think-education", `/students/${student.id}?tab=academic`)} className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:underline">
        <ArrowLeft className="h-4 w-4" /> Student profile
      </Link>
      <AcademicHistoryPrintButton />
    </div>

    <header className="border-b-2 border-slate-300 pb-5">
      <div className="flex items-center gap-4">
        {institutionLogoUrl && <img src={institutionLogoUrl} alt="" className="h-16 w-16 object-contain" />}
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{institutionName}</p>
          <h1 className="mt-1 text-2xl font-bold">Student Academic History</h1>
          <p className="mt-1 text-sm text-slate-600">Generated {reportGeneratedAt}</p>
        </div>
      </div>
      <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <p><span className="font-semibold">Student:</span> {fullName}</p>
        <p><span className="font-semibold">Student ID:</span> {student.student_number}</p>
        <p><span className="font-semibold">Campus:</span> {campusNameById.get(student.branch_id) ?? "Campus"}</p>
        <p><span className="font-semibold">Status:</span> <span className="capitalize">{student.status.replaceAll("_", " ")}</span></p>
        <p><span className="font-semibold">Student record created:</span> {formatDate(student.created_at)}</p>
      </div>
    </header>

    {canViewAcademics && <section>
      <h2 className="text-lg font-bold">Enrollment history</h2>
      {enrollments.length ? <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead><tr className="border-y border-slate-400 bg-slate-100">
            <th className="px-2 py-2">Academic year</th><th className="px-2 py-2">Class</th><th className="px-2 py-2">Campus</th>
            <th className="px-2 py-2">Class teacher</th><th className="px-2 py-2">Enrolled</th><th className="px-2 py-2">Ended</th><th className="px-2 py-2">Status</th>
          </tr></thead>
          <tbody>{enrollments.map((row) => {
            const classroom = classById.get(row.class_id);
            return <tr key={row.id} className="border-b border-slate-200">
              <td className="px-2 py-2">{yearNameById.get(row.academic_year_id) ?? "—"}</td>
              <td className="px-2 py-2">{classroom?.name ?? "—"}</td>
              <td className="px-2 py-2">{campusNameById.get(row.branch_id) ?? "Campus"}</td>
              <td className="px-2 py-2">{classroom?.class_teacher_id ? teacherById.get(classroom.class_teacher_id) ?? "—" : "—"}</td>
              <td className="px-2 py-2">{formatDate(row.enrolled_on)}</td>
              <td className="px-2 py-2">{formatDate(row.ended_on)}</td>
              <td className="px-2 py-2 capitalize">{row.status.replaceAll("_", " ")}</td>
            </tr>;
          })}</tbody>
        </table>
      </div> : <p className="mt-2 text-sm text-slate-600">No enrollment records are available.</p>}
      {(enrollmentResult.count ?? 0) > MAX_ENROLLMENTS && <p className="mt-2 text-xs text-amber-800">Showing the most recent {MAX_ENROLLMENTS} enrollment records.</p>}
    </section>}

    {canViewResults && <section>
      <h2 className="text-lg font-bold">Published examination results</h2>
      <p className="mt-1 text-xs text-slate-500">Draft, submitted, and unpublished marks are excluded.</p>
      {results.length ? <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead><tr className="border-y border-slate-400 bg-slate-100">
            <th className="px-2 py-2">Examination</th><th className="px-2 py-2">Year / term</th><th className="px-2 py-2">Subject</th>
            <th className="px-2 py-2">Score</th><th className="px-2 py-2">Percent</th><th className="px-2 py-2">Grade</th><th className="px-2 py-2">Recorded</th>
          </tr></thead>
          <tbody>{results.map((row) => {
            const exam = examinationById.get(row.examination_id);
            const percentage = row.maximum_score > 0 ? (row.score / row.maximum_score) * 100 : null;
            return <tr key={row.id} className="border-b border-slate-200">
              <td className="px-2 py-2">{exam?.name ?? "Examination"}</td>
              <td className="px-2 py-2">{[
                exam ? yearNameById.get(exam.academic_year_id) : null,
                exam?.term_id ? termNameById.get(exam.term_id) : null,
              ].filter(Boolean).join(" · ") || "—"}</td>
              <td className="px-2 py-2">{row.subject_name}</td>
              <td className="px-2 py-2">{row.score}/{row.maximum_score}</td>
              <td className="px-2 py-2">{percentage === null ? "—" : `${percentage.toFixed(1)}%`}</td>
              <td className="px-2 py-2 font-semibold">{row.grade ?? "—"}</td>
              <td className="px-2 py-2">{formatDate(row.created_at)}</td>
            </tr>;
          })}</tbody>
        </table>
      </div> : <p className="mt-2 text-sm text-slate-600">No published examination results are available.</p>}
      {(resultsResult.count ?? 0) > MAX_RESULTS && <p className="mt-2 text-xs text-amber-800">Showing the latest {MAX_RESULTS} published results.</p>}
    </section>}

    {canViewAttendance && <section>
      <h2 className="text-lg font-bold">Attendance history</h2>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        {["present", "late", "absent", "excused"].map((status) => <p key={status} className="rounded border border-slate-200 p-2 capitalize">
          {status}: <strong>{attendanceCounts[status] ?? 0}</strong>
        </p>)}
      </div>
      <p className="mt-2 text-xs text-slate-500">Counts show recorded statuses only; no attendance percentage is calculated because institution-specific counting rules are not configured here.</p>
      {attendance.length ? <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead><tr className="border-y border-slate-400 bg-slate-100">
            <th className="px-2 py-2">Date</th><th className="px-2 py-2">Class</th><th className="px-2 py-2">Campus</th><th className="px-2 py-2">Status</th>
          </tr></thead>
          <tbody>{attendance.map((row) => <tr key={row.id} className="border-b border-slate-200">
            <td className="px-2 py-2">{formatDate(row.attendance_date)}</td>
            <td className="px-2 py-2">{row.class_id ? classById.get(row.class_id)?.name ?? "—" : "—"}</td>
            <td className="px-2 py-2">{campusNameById.get(row.branch_id) ?? "Campus"}</td>
            <td className="px-2 py-2 capitalize">{row.status.replaceAll("_", " ")}</td>
          </tr>)}</tbody>
        </table>
      </div> : <p className="mt-2 text-sm text-slate-600">No attendance records are available.</p>}
      {(attendanceResult.count ?? 0) > MAX_ATTENDANCE && <p className="mt-2 text-xs text-amber-800">Showing the latest {MAX_ATTENDANCE} attendance records.</p>}
    </section>}

    {canViewTransfers && <section>
      <h2 className="text-lg font-bold">Campus transfer history</h2>
      {transfers.length ? <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead><tr className="border-y border-slate-400 bg-slate-100">
            <th className="px-2 py-2">Effective date</th><th className="px-2 py-2">From</th><th className="px-2 py-2">To</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">Reason</th>
          </tr></thead>
          <tbody>{transfers.map((row) => <tr key={row.id} className="border-b border-slate-200">
            <td className="px-2 py-2">{formatDate(row.effective_on)}</td>
            <td className="px-2 py-2">{campusNameById.get(row.source_branch_id) ?? "Campus"}</td>
            <td className="px-2 py-2">{campusNameById.get(row.destination_branch_id) ?? "Campus"}</td>
            <td className="px-2 py-2 capitalize">{row.status.replaceAll("_", " ")}</td>
            <td className="px-2 py-2">{row.reason}</td>
          </tr>)}</tbody>
        </table>
      </div> : <p className="mt-2 text-sm text-slate-600">No campus transfer records are available within your access scope.</p>}
      {(transfersResult.count ?? 0) > MAX_TRANSFERS && <p className="mt-2 text-xs text-amber-800">Showing the most recent {MAX_TRANSFERS} transfer records.</p>}
    </section>}

    <footer className="border-t border-slate-300 pt-3 text-xs text-slate-500">
      This report contains only records visible to the signed-in user and is intended for authorized education use.
    </footer>
  </main>;
}
