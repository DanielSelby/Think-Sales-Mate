import { NextResponse, type NextRequest } from "next/server";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";

const BATCH_SIZE = 1000;
const MAX_EXPORT_ROWS = 100_000;

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
  const { count: routeCount, error: countError } = branchIds.length
    ? await supabase.from("education_transport_routes")
      .select("id", { count: "exact", head: true })
      .eq("org_id", context.orgId).in("branch_id", branchIds)
    : { count: 0, error: null };
  if (countError) {
    console.error("Could not count Think Education transport routes for export:", countError.message);
    return NextResponse.json({ error: "Could not export transport routes." }, { status: 500 });
  }
  if ((routeCount ?? 0) > MAX_EXPORT_ROWS) {
    return NextResponse.json({ error: "Transport route export exceeds the 100,000 record limit." }, { status: 413 });
  }

  const encoder = new TextEncoder();
  let offset = 0;
  let finished = !branchIds.length || routeCount === 0;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode([
        ["Campus", "Route", "Driver", "Vehicle", "Vehicle status", "Route status", "Capacity", "Assigned students", "Available seats", "Utilization %"]
          .map(csvCell).join(","),
        "",
      ].join("\r\n")));
      if (finished) controller.close();
    },
    async pull(controller) {
      if (finished) return;
      try {
        const { data: routes, error: routesError } = await supabase.from("education_transport_routes")
          .select("id, branch_id, vehicle_id, name, driver_name, status")
          .eq("org_id", context.orgId).in("branch_id", branchIds)
          .order("name").order("id")
          .range(offset, Math.min(offset + BATCH_SIZE - 1, MAX_EXPORT_ROWS - 1));
        if (routesError) throw new Error(`Could not load transport routes: ${routesError.message}`);
        if (!routes?.length) {
          finished = true;
          controller.close();
          return;
        }

        const vehicleIds = [...new Set(routes.map((route) => route.vehicle_id))];
        const [vehiclesResult, summaryResult] = await Promise.all([
          supabase.from("education_transport_vehicles")
            .select("id, branch_id, registration_number, capacity, status")
            .eq("org_id", context.orgId).in("branch_id", branchIds).in("id", vehicleIds),
          supabase.rpc("education_get_transport_dashboard_summary", {
            p_org_id: context.orgId,
            p_branch_ids: branchIds,
            p_route_ids: routes.map((route) => route.id),
          }),
        ]);
        if (vehiclesResult.error) throw new Error(`Could not load vehicles for transport export: ${vehiclesResult.error.message}`);
        if (summaryResult.error) throw new Error(`Could not load transport assignments for export: ${summaryResult.error.message}`);

        const vehicleById = new Map((vehiclesResult.data ?? []).map((vehicle) => [vehicle.id, vehicle]));
        const assignmentCountByRoute = new Map((summaryResult.data ?? [])
          .filter((row) => row.route_id !== null)
          .map((row) => [row.route_id, Number(row.active_assignment_count)]));
        const lines: string[] = [];
        for (const route of routes) {
          const vehicle = vehicleById.get(route.vehicle_id);
          if (!vehicle) continue;
          const assignmentCount = assignmentCountByRoute.get(route.id) ?? 0;
          const availableSeats = Math.max(0, vehicle.capacity - assignmentCount);
          const utilization = vehicle.capacity > 0
            ? Math.round((assignmentCount / vehicle.capacity) * 1000) / 10
            : 0;
          lines.push([
            campusNameById.get(route.branch_id) ?? route.branch_id,
            route.name,
            route.driver_name,
            vehicle.registration_number,
            vehicle.status,
            route.status,
            String(vehicle.capacity),
            String(assignmentCount),
            String(availableSeats),
            String(utilization),
          ].map(csvCell).join(","));
        }
        if (lines.length) controller.enqueue(encoder.encode(`${lines.join("\r\n")}\r\n`));
        offset += routes.length;
        if (routes.length < BATCH_SIZE || offset >= (routeCount ?? 0)) {
          finished = true;
          controller.close();
        }
      } catch (error) {
        console.error("Could not stream Think Education transport export:", error);
        finished = true;
        controller.error(error);
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="education-transport-routes-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
