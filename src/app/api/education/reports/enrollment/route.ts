import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { summarizeEducationEnrollments, type EducationEnrollmentStatus } from "@/lib/education/enrollment-report";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";

const EXPORT_LIMIT = 5000;
const ENROLLMENT_STATUSES = ["active", "completed", "withdrawn", "transferred"] as const;

function escapeCsv(value: string) {
  const safeValue = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safeValue.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const context = await getCurrentOrgContext();
  if (!context) return new Response("Unauthorized.", { status: 401 });
  const [
    canViewReport,
    canExportReport,
    canViewStudents,
    canExportStudents,
  ] = await Promise.all([
    canTabPermission("education_reports", "reports", "enrollment", "view"),
    canTabPermission("education_reports", "reports", "enrollment", "export"),
    canTabPermission("education_students", "students", "list", "view"),
    canTabPermission("education_students", "students", "list", "export"),
  ]);
  if (!canViewReport || !canExportReport || !canViewStudents || !canExportStudents) {
    return new Response("You do not have permission to export this report.", { status: 403 });
  }

  const url = new URL(request.url);
  const requestedBranch = url.searchParams.get("branch") ?? "";
  const requestedYear = url.searchParams.get("year") ?? "";
  const statusFilter = url.searchParams.get("status") ?? "";
  if ((requestedYear && !/^[0-9a-f-]{36}$/i.test(requestedYear))
    || (statusFilter && !ENROLLMENT_STATUSES.includes(statusFilter as typeof ENROLLMENT_STATUSES[number]))) {
    return new Response("Invalid report filters.", { status: 400 });
  }

  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const campusIds = campuses.map((campus) => campus.id);
  if (requestedBranch && !campusIds.includes(requestedBranch)) {
    return new Response("The selected campus is outside your access.", { status: 403 });
  }
  const branchIds = requestedBranch ? [requestedBranch] : campusIds;
  if (!branchIds.length) {
    return new Response("No enrollments are available in your assigned campuses.", { status: 404 });
  }

  const supabase = await createClient();
  const { data: academicYears, error: yearsError } = await supabase.from("education_academic_years")
    .select("id, name")
    .eq("org_id", context.orgId);
  if (yearsError) {
    console.error("Could not verify Think Education enrollment report year:", yearsError.message);
    return new Response("Could not load the requested academic year.", { status: 500 });
  }
  if (requestedYear && !(academicYears ?? []).some((year) => year.id === requestedYear)) {
    return new Response("The selected academic year is unavailable.", { status: 404 });
  }

  let query = supabase.from("education_student_enrollments")
    .select("branch_id, academic_year_id, class_id, status", { count: "exact" })
    .eq("org_id", context.orgId).in("branch_id", branchIds)
    .order("branch_id").order("academic_year_id").order("class_id").order("id")
    .range(0, EXPORT_LIMIT - 1);
  if (requestedYear) query = query.eq("academic_year_id", requestedYear);
  if (statusFilter) query = query.eq("status", statusFilter as EducationEnrollmentStatus);
  const { data, count, error } = await query;
  if (error) {
    console.error("Could not export Think Education enrollment report:", error.message);
    return new Response("Could not generate the enrollment report.", { status: 500 });
  }
  if ((count ?? 0) > EXPORT_LIMIT) {
    return new Response(
      `This export matches more than ${EXPORT_LIMIT.toLocaleString()} enrollments. Narrow the filters and try again.`,
      { status: 413 },
    );
  }

  const summaries = summarizeEducationEnrollments((data ?? []) as Array<{
    branch_id: string;
    academic_year_id: string;
    class_id: string;
    status: EducationEnrollmentStatus;
  }>);
  const classIds = Array.from(new Set(summaries.map((summary) => summary.class_id)));
  let classes: Array<{ id: string; branch_id: string; name: string }> = [];
  if (classIds.length) {
    const { data: classData, error: classesError } = await supabase.from("education_classes")
      .select("id, branch_id, name")
      .eq("org_id", context.orgId).in("branch_id", branchIds).in("id", classIds);
    if (classesError) {
      console.error("Could not load classes for Think Education enrollment export:", classesError.message);
      return new Response("Could not load classes for the enrollment report.", { status: 500 });
    }
    classes = classData ?? [];
  }
  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const yearNameById = new Map((academicYears ?? []).map((year) => [year.id, year.name]));
  const classNameById = new Map(classes.map((classRecord) => [classRecord.id, classRecord.name]));
  const header = ["Campus", "Academic year", "Class", "Enrollment status", "Enrollment count"];
  const lines = [
    header.map(escapeCsv).join(","),
    ...summaries.map((summary) => [
      campusNameById.get(summary.branch_id) ?? "Campus",
      yearNameById.get(summary.academic_year_id) ?? "Academic year",
      classNameById.get(summary.class_id) ?? "Class",
      summary.status,
      String(summary.enrollment_count),
    ].map(escapeCsv).join(",")),
  ];

  return new Response(`\uFEFF${lines.join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="think-education-enrollment-report.csv"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
