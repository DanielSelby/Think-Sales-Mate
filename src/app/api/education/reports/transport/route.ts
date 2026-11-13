import { getAccessibleEducationCampuses } from "@/lib/education/access";
import {
  summarizeEducationTransportRoutes,
  type EducationTransportRouteStatus,
} from "@/lib/education/transport-report";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";

const EXPORT_LIMIT = 5000;
const ROUTE_STATUSES = ["active", "paused", "retired"] as const;

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
    canViewFleet,
    canExportFleet,
    canViewAssignments,
    canExportAssignments,
  ] = await Promise.all([
    canTabPermission("education_reports", "reports", "transport", "view"),
    canTabPermission("education_reports", "reports", "transport", "export"),
    canTabPermission("education_transport", "transport", "fleet", "view"),
    canTabPermission("education_transport", "transport", "fleet", "export"),
    canTabPermission("education_transport", "transport", "assignments", "view"),
    canTabPermission("education_transport", "transport", "assignments", "export"),
  ]);
  if (!canViewReport || !canExportReport || !canViewFleet || !canExportFleet || !canViewAssignments || !canExportAssignments) {
    return new Response("You do not have permission to export this report.", { status: 403 });
  }

  const url = new URL(request.url);
  const requestedBranch = url.searchParams.get("branch") ?? "";
  const statusFilter = url.searchParams.get("status") ?? "";
  if (statusFilter && !ROUTE_STATUSES.includes(statusFilter as typeof ROUTE_STATUSES[number])) {
    return new Response("Invalid report filters.", { status: 400 });
  }

  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const campusIds = campuses.map((campus) => campus.id);
  if (requestedBranch && !campusIds.includes(requestedBranch)) {
    return new Response("The selected campus is outside your access.", { status: 403 });
  }
  const branchIds = requestedBranch ? [requestedBranch] : campusIds;
  if (!branchIds.length) {
    return new Response("No transport routes are available in your assigned campuses.", { status: 404 });
  }

  const supabase = await createClient();
  let routeQuery = supabase.from("education_transport_routes")
    .select("id, branch_id, vehicle_id, name, status", { count: "exact" })
    .eq("org_id", context.orgId).in("branch_id", branchIds)
    .order("branch_id").order("name").order("id").range(0, EXPORT_LIMIT - 1);
  if (statusFilter) routeQuery = routeQuery.eq("status", statusFilter as EducationTransportRouteStatus);
  const { data: routes, count: routeCount, error: routeError } = await routeQuery;
  if (routeError) {
    console.error("Could not export Think Education transport routes:", routeError.message);
    return new Response("Could not generate the transport report.", { status: 500 });
  }
  if ((routeCount ?? 0) > EXPORT_LIMIT) {
    return new Response(
      `This export matches more than ${EXPORT_LIMIT.toLocaleString()} routes. Select a campus or route status and try again.`,
      { status: 413 },
    );
  }

  const routeRecords = (routes ?? []) as Array<{
    id: string;
    branch_id: string;
    vehicle_id: string;
    name: string;
    status: EducationTransportRouteStatus;
  }>;
  const routeIds = routeRecords.map((route) => route.id);
  const vehicleIds = Array.from(new Set(routeRecords.map((route) => route.vehicle_id)));
  const [{ data: vehicles, error: vehiclesError }, assignmentsResult] = await Promise.all([
    vehicleIds.length
      ? supabase.from("education_transport_vehicles")
        .select("id, registration_number, capacity, status")
        .eq("org_id", context.orgId).in("branch_id", branchIds).in("id", vehicleIds)
        .order("id").range(0, EXPORT_LIMIT - 1)
      : Promise.resolve({ data: [], error: null }),
    routeIds.length
      ? supabase.from("education_transport_assignments")
        .select("route_id", { count: "exact" })
        .eq("org_id", context.orgId).in("branch_id", branchIds).in("route_id", routeIds).eq("status", "active")
        .order("route_id").order("id").range(0, EXPORT_LIMIT - 1)
      : Promise.resolve({ data: [], count: 0, error: null }),
  ]);
  if (vehiclesError) {
    console.error("Could not load vehicles for Think Education transport export:", vehiclesError.message);
    return new Response("Could not load vehicles for the transport report.", { status: 500 });
  }
  if (assignmentsResult.error) {
    console.error("Could not export Think Education transport assignments:", assignmentsResult.error.message);
    return new Response("Could not load assignments for the transport report.", { status: 500 });
  }
  if ((assignmentsResult.count ?? 0) > EXPORT_LIMIT) {
    return new Response(
      `This export matches more than ${EXPORT_LIMIT.toLocaleString()} active assignments. Select a campus or route status and try again.`,
      { status: 413 },
    );
  }

  const summaries = summarizeEducationTransportRoutes(
    routeRecords,
    (vehicles ?? []).map((vehicle) => ({ ...vehicle, capacity: Number(vehicle.capacity) })),
    assignmentsResult.data ?? [],
  );
  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const header = [
    "Campus",
    "Route",
    "Route status",
    "Vehicle",
    "Vehicle status",
    "Active assignments",
    "Capacity",
    "Available seats",
    "Utilization percentage",
  ];
  const lines = [
    header.map(escapeCsv).join(","),
    ...summaries.map((summary) => [
      campusNameById.get(summary.branch_id) ?? "Campus",
      summary.route_name,
      summary.route_status,
      summary.vehicle_registration,
      summary.vehicle_status,
      String(summary.active_assignment_count),
      String(summary.capacity),
      String(summary.available_seats),
      summary.utilization_percentage.toFixed(1),
    ].map(escapeCsv).join(",")),
  ];

  return new Response(`\uFEFF${lines.join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="think-education-transport-utilization.csv"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
