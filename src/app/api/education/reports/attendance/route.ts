import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";

const EXPORT_LIMIT = 5000;
const ATTENDANCE_STATUSES = ["present", "absent", "late", "excused"] as const;

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function escapeCsv(value: string) {
  const safeValue = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safeValue.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const context = await getCurrentOrgContext();
  if (!context) return new Response("Unauthorized.", { status: 401 });
  const [canViewReport, canExportReport, canViewAttendance, canExportAttendance] = await Promise.all([
    canTabPermission("education_reports", "reports", "attendance", "view"),
    canTabPermission("education_reports", "reports", "attendance", "export"),
    canTabPermission("education_attendance", "attendance", "register", "view"),
    canTabPermission("education_attendance", "attendance", "register", "export"),
  ]);
  if (!canViewReport || !canExportReport || !canViewAttendance || !canExportAttendance) {
    return new Response("You do not have permission to export this report.", { status: 403 });
  }

  const url = new URL(request.url);
  const requestedBranch = url.searchParams.get("branch") ?? "";
  const requestedClass = url.searchParams.get("class") ?? "";
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  const statusFilter = url.searchParams.get("status") ?? "";
  if (!isValidDate(from) || !isValidDate(to) || from > to
    || (requestedClass && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedClass))
    || (statusFilter && !ATTENDANCE_STATUSES.includes(statusFilter as typeof ATTENDANCE_STATUSES[number]))) {
    return new Response("Invalid report filters.", { status: 400 });
  }
  const status = statusFilter as typeof ATTENDANCE_STATUSES[number] | "";
  const canViewClasses = await canTabPermission("education_academics", "academics", "classes", "view");
  if (requestedClass && !canViewClasses) {
    return new Response("You do not have permission to filter attendance by class.", { status: 403 });
  }

  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const campusIds = campuses.map((campus) => campus.id);
  if (requestedBranch && !campusIds.includes(requestedBranch)) {
    return new Response("The selected campus is outside your access.", { status: 403 });
  }
  const branchIds = requestedBranch ? [requestedBranch] : campusIds;
  if (!branchIds.length) {
    return new Response("No student attendance records are available in your assigned campuses.", { status: 404 });
  }

  const supabase = await createClient();
  let classNameById = new Map<string, string>();
  if (canViewClasses) {
    let classesQuery = supabase.from("education_classes")
      .select("id, name")
      .eq("org_id", context.orgId)
      .in("branch_id", branchIds)
      .order("name")
      .range(0, EXPORT_LIMIT - 1);
    if (requestedBranch) classesQuery = classesQuery.eq("branch_id", requestedBranch);
    const { data: classes, error: classesError } = await classesQuery;
    if (classesError) {
      console.error("Could not load classes for Think Education attendance export:", classesError.message);
      return new Response("Could not load classes for the attendance report.", { status: 500 });
    }
    classNameById = new Map((classes ?? []).map((classRecord) => [classRecord.id, classRecord.name]));
    if (requestedClass && !classNameById.has(requestedClass)) {
      return new Response("The selected class is outside your campus access.", { status: 403 });
    }
  }
  let query = supabase.from("education_attendance")
    .select("branch_id, class_id, attendance_date, status", { count: "exact" })
    .eq("org_id", context.orgId).in("branch_id", branchIds)
    .not("student_id", "is", null)
    .gte("attendance_date", from).lte("attendance_date", to)
    .order("attendance_date").order("branch_id").order("id")
    .range(0, EXPORT_LIMIT - 1);
  if (status) query = query.eq("status", status);
  if (requestedClass) query = query.eq("class_id", requestedClass);
  const { data, count, error } = await query;
  if (error) {
    console.error("Could not export Think Education attendance report:", error.message);
    return new Response("Could not generate the attendance report.", { status: 500 });
  }
  if ((count ?? 0) > EXPORT_LIMIT) {
    return new Response(
      `This export matches more than ${EXPORT_LIMIT.toLocaleString()} attendance records. Narrow the filters and try again.`,
      { status: 413 },
    );
  }

  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const header = ["Attendance date", "Campus", ...(canViewClasses ? ["Class"] : []), "Status"];
  const lines = [
    header.map(escapeCsv).join(","),
    ...(data ?? []).map((record) => [
      record.attendance_date,
      campusNameById.get(record.branch_id) ?? "Campus",
      ...(canViewClasses ? [record.class_id ? classNameById.get(record.class_id) ?? "Class" : "Unassigned"] : []),
      record.status,
    ].map(escapeCsv).join(",")),
  ];

  return new Response(`\uFEFF${lines.join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="think-education-attendance-report.csv"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
