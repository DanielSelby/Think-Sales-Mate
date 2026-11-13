export type EducationTransportRouteStatus = "active" | "paused" | "retired";

export interface EducationTransportRouteReportRecord {
  id: string;
  branch_id: string;
  vehicle_id: string;
  name: string;
  status: EducationTransportRouteStatus;
}

export interface EducationTransportVehicleReportRecord {
  id: string;
  registration_number: string;
  capacity: number;
  status: "active" | "maintenance" | "retired";
}

export interface EducationTransportAssignmentReportRecord {
  route_id: string;
}

export interface EducationTransportRouteSummary {
  route_id: string;
  branch_id: string;
  route_name: string;
  route_status: EducationTransportRouteStatus;
  vehicle_registration: string;
  vehicle_status: EducationTransportVehicleReportRecord["status"];
  capacity: number;
  active_assignment_count: number;
  available_seats: number;
  utilization_percentage: number;
}

export function summarizeEducationTransportRoutes(
  routes: readonly EducationTransportRouteReportRecord[],
  vehicles: readonly EducationTransportVehicleReportRecord[],
  assignments: readonly EducationTransportAssignmentReportRecord[],
): EducationTransportRouteSummary[] {
  const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const assignmentCountByRoute = new Map<string, number>();
  for (const assignment of assignments) {
    assignmentCountByRoute.set(assignment.route_id, (assignmentCountByRoute.get(assignment.route_id) ?? 0) + 1);
  }

  return routes.flatMap((route) => {
    const vehicle = vehicleById.get(route.vehicle_id);
    if (!vehicle) return [];
    const activeAssignmentCount = assignmentCountByRoute.get(route.id) ?? 0;
    return [{
      route_id: route.id,
      branch_id: route.branch_id,
      route_name: route.name,
      route_status: route.status,
      vehicle_registration: vehicle.registration_number,
      vehicle_status: vehicle.status,
      capacity: vehicle.capacity,
      active_assignment_count: activeAssignmentCount,
      available_seats: Math.max(0, vehicle.capacity - activeAssignmentCount),
      utilization_percentage: vehicle.capacity > 0
        ? Math.round((activeAssignmentCount / vehicle.capacity) * 1000) / 10
        : 0,
    }];
  }).sort((left, right) =>
    left.branch_id.localeCompare(right.branch_id) || left.route_name.localeCompare(right.route_name),
  );
}
