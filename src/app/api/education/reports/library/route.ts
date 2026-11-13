import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { summarizeEducationLibraryCirculation, type EducationLibraryCirculationStatus } from "@/lib/education/library-report";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";

const EXPORT_LIMIT = 5000;
const CIRCULATION_STATUSES = ["open", "overdue", "returned"] as const;

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
  const [canViewReport, canExportReport, canViewCirculation, canExportLibrary] = await Promise.all([
    canTabPermission("education_reports", "reports", "library", "view"),
    canTabPermission("education_reports", "reports", "library", "export"),
    canTabPermission("education_library", "library", "circulation", "view"),
    canTabPermission("education_library", "library", "circulation", "export"),
  ]);
  if (!canViewReport || !canExportReport || !canViewCirculation || !canExportLibrary) {
    return new Response("You do not have permission to export this report.", { status: 403 });
  }

  const url = new URL(request.url);
  const requestedBranch = url.searchParams.get("branch") ?? "";
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  const statusFilter = url.searchParams.get("status") ?? "";
  if (!isValidDate(from) || !isValidDate(to) || from > to
    || (statusFilter && !CIRCULATION_STATUSES.includes(statusFilter as typeof CIRCULATION_STATUSES[number]))) {
    return new Response("Invalid report filters.", { status: 400 });
  }

  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const campusIds = campuses.map((campus) => campus.id);
  if (requestedBranch && !campusIds.includes(requestedBranch)) {
    return new Response("The selected campus is outside your access.", { status: 403 });
  }
  const branchIds = requestedBranch ? [requestedBranch] : campusIds;
  if (!branchIds.length) {
    return new Response("No library loans are available in your assigned campuses.", { status: 404 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const supabase = await createClient();
  let query = supabase.from("education_library_loans")
    .select("branch_id, loaned_on, due_on, returned_on", { count: "exact" })
    .eq("org_id", context.orgId).in("branch_id", branchIds)
    .gte("loaned_on", from).lte("loaned_on", to)
    .order("loaned_on").order("branch_id").order("id")
    .range(0, EXPORT_LIMIT - 1);
  if (statusFilter === "returned") query = query.not("returned_on", "is", null);
  if (statusFilter === "open") query = query.is("returned_on", null).gte("due_on", today);
  if (statusFilter === "overdue") query = query.is("returned_on", null).lt("due_on", today);
  const { data, count, error } = await query;
  if (error) {
    console.error("Could not export Think Education library circulation report:", error.message);
    return new Response("Could not generate the library report.", { status: 500 });
  }
  if ((count ?? 0) > EXPORT_LIMIT) {
    return new Response(
      `This export matches more than ${EXPORT_LIMIT.toLocaleString()} library loans. Narrow the date range or filters and try again.`,
      { status: 413 },
    );
  }

  const summaries = summarizeEducationLibraryCirculation(data ?? [], today)
    .filter((summary) => !statusFilter || summary.status === statusFilter as EducationLibraryCirculationStatus);
  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const header = ["Campus", "Circulation status", "Loan count"];
  const lines = [
    header.map(escapeCsv).join(","),
    ...summaries.map((summary) => [
      campusNameById.get(summary.branch_id) ?? "Campus",
      summary.status,
      String(summary.loan_count),
    ].map(escapeCsv).join(",")),
  ];

  return new Response(`\uFEFF${lines.join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="think-education-library-circulation.csv"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
