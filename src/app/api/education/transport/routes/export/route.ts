import { NextResponse, type NextRequest } from "next/server";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";

const BATCH_SIZE = 1000;
const MAX_EXPORT_ROWS = 100_000;

async function collectPages<T>(
  loadPage: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
) {
  const rows: T[] = [];
  for (let offset = 0; offset <= MAX_EXPORT_ROWS; offset += BATCH_SIZE) {
    const { data, error } = await loadPage(offset, offset + BATCH_SIZE - 1);
    if (error) return { rows, error: error.message, exceededLimit: false };
    if (offset === MAX_EXPORT_ROWS && data?.length) {
      return { rows, error: null, exceededLimit: true };
    }
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < BATCH_SIZE) break;
  }
  return { rows, error: null, exceededLimit: false };
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  const safeText = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  const context = await getCurrentOrgContext();
  if (!context) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });

  const [canViewFleet, canViewAssignments, canExportFleet, canExportAssignments] = await Promise.all([
    canTabPermission("education_transport", "transport", "fleet", "view"),
    canTabPermission("education_transport", "transport", "assignments", "view"),
    canTabPermission("education_transport", "transport", "fleet", "export"),
    canTabPermission("education_transport", "transport", "assignments", "export"),
  ]);
  if (!canViewFleet || !canViewAssignments || !canExportFleet || !canExportAssignments) {
    return NextResponse.json({ error: "You do not have permission to export transport routes." }, { status: 403 });
  }

  const requestedBranch = request.nextUrl.searchParams.get("branch") ?? "";
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (requestedBranch && !campuses.some((campus) => campus.id === requestedBranch)) {
    return NextResponse.json({ error: "The selected campus is outside your access scope." }, { status: 403 });
  }
  const branchIds = requestedBranch ? [requestedBranch] : campuses.map((campus) => campus.id);
  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const supabase = await createClient();

  const routesResult = await collectPages((from, to) => branchIds.length
    ? supabase.from("education_transport_routes")
      .select("id, branch_id, vehicle_id, name, driver_name, status")
      .eq("org_id", context.orgId).in("branch_id", branchIds)
      .order("name").order("id").range(from, to)
    : Promise.resolve({ data: [], error: null }));
  if (routesResult.error) {
    console.error("Could not export Think Education transport routes:", routesResult.error);
    return NextResponse.json({ error: "Could not export transport routes." }, { status: 500 });
  }
  if (routesResult.exceededLimit) {
    return NextResponse.json({ error: "Transport route export exceeds the 100,000 record limit." }, { status: 413 });
  }

  const routes = routesResult.rows;
  const routeSummaries = new Map<string, {
    active_assignment_count: number;
    vehicle_registration: string;
    vehicle_status: string;
    capacity: number;
  }>();
  for (let start = 0; start < routes.length; start += 100) {
    const batch = routes.slice(start, start + 100);
    const vehicleIds = [...new Set(batch.map((route) => route.vehicle_id))];
    const { data: vehicles, error: vehiclesError } = await supabase.from("education_transport_vehicles")
      .select("id, branch_id, registration_number, capacity, status")
      .eq("org_id", context.orgId).in("branch_id", branchIds).in("id", vehicleIds);
    if (vehiclesError) {
      console.error("Could not load vehicles for transport route export:", vehiclesError.message);
      return NextResponse.json({ error: "Could not export transport vehicles." }, { status: 500 });
    }

    const vehicleById = new Map((vehicles ?? []).map((vehicle) => [vehicle.id, vehicle]));
    const summaryResult = await supabase.rpc("education_get_transport_dashboard_summary", {
      p_org_id: context.orgId,
      p_branch_ids: branchIds,
      p_route_ids: batch.map((route) => route.id),
    });
    if (summaryResult.error) {
      console.error("Could not load transport assignment totals for export:", summaryResult.error.message);
      return NextResponse.json({ error: "Could not export transport assignment totals." }, { status: 500 });
    }
    const assignmentCountByRoute = new Map((summaryResult.data ?? [])
      .filter((row) => row.route_id !== null)
      .map((row) => [row.route_id, Number(row.active_assignment_count)]));

    for (const route of batch) {
      const vehicle = vehicleById.get(route.vehicle_id);
      if (!vehicle) continue;
      routeSummaries.set(route.id, {
        active_assignment_count: assignmentCountByRoute.get(route.id) ?? 0,
        vehicle_registration: vehicle.registration_number,
        vehicle_status: vehicle.status,
        capacity: vehicle.capacity,
      });
    }
  }

  const csvRows = [
    ["Campus", "Route", "Driver", "Vehicle", "Vehicle status", "Route status", "Capacity", "Assigned students", "Available seats", "Utilization %"],
    ...routes.flatMap((route) => {
      const summary = routeSummaries.get(route.id);
      if (!summary) return [];
      const availableSeats = Math.max(0, summary.capacity - summary.active_assignment_count);
      const utilization = summary.capacity > 0
        ? Math.round((summary.active_assignment_count / summary.capacity) * 1000) / 10
        : 0;
      return [[
        campusNameById.get(route.branch_id) ?? route.branch_id,
        route.name,
        route.driver_name,
        summary.vehicle_registration,
        summary.vehicle_status,
        route.status,
        String(summary.capacity),
        String(summary.active_assignment_count),
        String(availableSeats),
        String(utilization),
      ]];
    }),
  ];

  const csv = csvRows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="education-transport-routes-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
