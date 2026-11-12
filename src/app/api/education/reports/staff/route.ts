import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";

const EXPORT_LIMIT = 5000;
const STAFF_STATUSES = ["active", "on_leave", "inactive", "suspended", "archived"] as const;
const STAFF_CATEGORIES = ["teaching", "non_teaching"] as const;

function escapeCsv(value: string) {
  const safeValue = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safeValue.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const context = await getCurrentOrgContext();
  if (!context) return new Response("Unauthorized.", { status: 401 });
  const [canView, canExport] = await Promise.all([
    canTabPermission("education_reports", "reports", "staff", "view"),
    canTabPermission("education_reports", "reports", "staff", "export"),
  ]);
  if (!canView || !canExport) {
    return new Response("You do not have permission to export this report.", { status: 403 });
  }

  const url = new URL(request.url);
  const requestedBranch = url.searchParams.get("branch") ?? "";
  const statusFilter = url.searchParams.get("status") ?? "";
  const categoryFilter = url.searchParams.get("category") ?? "";
  if ((statusFilter && !STAFF_STATUSES.includes(statusFilter as typeof STAFF_STATUSES[number]))
    || (categoryFilter && !STAFF_CATEGORIES.includes(categoryFilter as typeof STAFF_CATEGORIES[number]))) {
    return new Response("Invalid report filters.", { status: 400 });
  }
  const requestedStatus = statusFilter as typeof STAFF_STATUSES[number] | "";
  const requestedCategory = categoryFilter as typeof STAFF_CATEGORIES[number] | "";

  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const campusIds = campuses.map((campus) => campus.id);
  if (requestedBranch && !campusIds.includes(requestedBranch)) {
    return new Response("The selected campus is outside your access.", { status: 403 });
  }
  const branchIds = requestedBranch ? [requestedBranch] : campusIds;
  if (!branchIds.length) {
    return new Response("No staff records are available in your assigned campuses.", { status: 404 });
  }

  const supabase = await createClient();
  let query = supabase.from("education_staff")
    .select("staff_number, first_name, last_name, staff_category, job_title, branch_id, status", { count: "exact" })
    .eq("org_id", context.orgId).in("branch_id", branchIds)
    .order("branch_id").order("staff_number").order("id")
    .range(0, EXPORT_LIMIT - 1);
  if (requestedStatus) query = query.eq("status", requestedStatus);
  if (requestedCategory) query = query.eq("staff_category", requestedCategory);
  const { data, count, error } = await query;
  if (error) {
    console.error("Could not export Think Education staff report:", error.message);
    return new Response("Could not generate the staff report.", { status: 500 });
  }
  if ((count ?? 0) > EXPORT_LIMIT) {
    return new Response(
      `This export matches more than ${EXPORT_LIMIT.toLocaleString()} staff records. Narrow the filters and try again.`,
      { status: 413 },
    );
  }

  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const header = ["Staff number", "First name", "Last name", "Category", "Job title", "Campus", "Status"];
  const lines = [
    header.map(escapeCsv).join(","),
    ...(data ?? []).map((staff) => [
      staff.staff_number,
      staff.first_name,
      staff.last_name,
      staff.staff_category.replaceAll("_", " "),
      staff.job_title ?? "",
      campusNameById.get(staff.branch_id) ?? "Campus",
      staff.status.replaceAll("_", " "),
    ].map(escapeCsv).join(",")),
  ];

  return new Response(`\uFEFF${lines.join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="think-education-staff-report.csv"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
