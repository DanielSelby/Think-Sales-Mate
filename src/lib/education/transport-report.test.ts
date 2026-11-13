import { describe, expect, it } from "vitest";
import { summarizeEducationTransportRoutes } from "./transport-report";

describe("summarizeEducationTransportRoutes", () => {
  it("reports active assignment counts, remaining seats, and utilization by route", () => {
    expect(summarizeEducationTransportRoutes(
      [
        { id: "route-b", branch_id: "campus-b", vehicle_id: "vehicle-b", name: "North", status: "active" },
        { id: "route-a", branch_id: "campus-a", vehicle_id: "vehicle-a", name: "Central", status: "paused" },
      ],
      [
        { id: "vehicle-a", registration_number: "BUS-001", capacity: 20, status: "maintenance" },
        { id: "vehicle-b", registration_number: "BUS-002", capacity: 4, status: "active" },
      ],
      [
        { route_id: "route-b" },
        { route_id: "route-b" },
        { route_id: "route-b" },
      ],
    )).toEqual([
      {
        route_id: "route-a",
        branch_id: "campus-a",
        route_name: "Central",
        route_status: "paused",
        vehicle_registration: "BUS-001",
        vehicle_status: "maintenance",
        capacity: 20,
        active_assignment_count: 0,
        available_seats: 20,
        utilization_percentage: 0,
      },
      {
        route_id: "route-b",
        branch_id: "campus-b",
        route_name: "North",
        route_status: "active",
        vehicle_registration: "BUS-002",
        vehicle_status: "active",
        capacity: 4,
        active_assignment_count: 3,
        available_seats: 1,
        utilization_percentage: 75,
      },
    ]);
  });

  it("does not produce rows for routes whose vehicles are not in the supplied scope", () => {
    expect(summarizeEducationTransportRoutes(
      [{ id: "route-a", branch_id: "campus-a", vehicle_id: "unavailable", name: "Central", status: "active" }],
      [],
      [],
    )).toEqual([]);
  });
});
