import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Bus, Route as RouteIcon, UserRound } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { summarizeEducationTransportRoutes } from "@/lib/education/transport-report";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import {
  assignEducationStudentTransport,
  createEducationTransportRoute,
  createEducationTransportVehicle,
  endEducationStudentTransport,
  setEducationTransportRouteStatus,
  setEducationTransportVehicleStatus,
} from "../actions";

const DATA_LIMIT = 1000;

const VEHICLE_STATUS_LABELS = {
  active: "Active",
  maintenance: "Maintenance",
  retired: "Retired",
} as const;

const ROUTE_STATUS_LABELS = {
  active: "Active",
  paused: "Paused",
  retired: "Retired",
} as const;

export default async function EducationTransportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");

  const [canViewFleet, canCreateFleet, canEditFleet, canViewAssignments, canCreateAssignment, canEndAssignment, canViewStudents, { campuses }] = await Promise.all([
    canTabPermission("education_transport", "transport", "fleet", "view"),
    canTabPermission("education_transport", "transport", "fleet", "create"),
    canTabPermission("education_transport", "transport", "fleet", "edit"),
    canTabPermission("education_transport", "transport", "assignments", "view"),
    canTabPermission("education_transport", "transport", "assignments", "create"),
    canTabPermission("education_transport", "transport", "assignments", "edit"),
    canTabPermission("education_students", "students", "list", "view"),
    getAccessibleEducationCampuses(context.orgId, context.userId),
  ]);
  if (!canViewFleet && !canViewAssignments) redirect("/dashboard?accessDenied=think-education.transport");
  const canAssign = canViewAssignments && canCreateAssignment && canViewStudents;

  const params = await searchParams;
  const requestedBranch = typeof params.branch === "string" ? params.branch : "";
  const campusIds = campuses.map((campus) => campus.id);
  const selectedBranch = campusIds.includes(requestedBranch) ? requestedBranch : "";
  const branchIds = selectedBranch ? [selectedBranch] : campusIds;
  const routeCreationBranchId = selectedBranch || campuses[0]?.id || "";
  const supabase = await createClient();

  const [vehiclesResult, routesResult, assignmentsResult] = branchIds.length ? await Promise.all([
    canViewFleet || canViewAssignments
      ? supabase.from("education_transport_vehicles")
        .select("id, branch_id, registration_number, make_model, capacity, status", { count: "exact" })
        .eq("org_id", context.orgId).in("branch_id", branchIds)
        .order("registration_number").range(0, DATA_LIMIT - 1)
      : Promise.resolve({ data: [], count: 0, error: null }),
    canViewFleet || canViewAssignments
      ? supabase.from("education_transport_routes")
        .select("id, branch_id, vehicle_id, name, driver_name, driver_phone, stops, status", { count: "exact" })
        .eq("org_id", context.orgId).in("branch_id", branchIds)
        .order("name").range(0, DATA_LIMIT - 1)
      : Promise.resolve({ data: [], count: 0, error: null }),
    canViewAssignments
      ? supabase.from("education_transport_assignments")
        .select("id, branch_id, route_id, student_id, pickup_stop, dropoff_stop, starts_on, status", { count: "exact" })
        .eq("org_id", context.orgId).in("branch_id", branchIds).eq("status", "active")
        .order("created_at", { ascending: false }).range(0, DATA_LIMIT - 1)
      : Promise.resolve({ data: [], count: 0, error: null }),
  ]) : [
    { data: [], count: 0, error: null },
    { data: [], count: 0, error: null },
    { data: [], count: 0, error: null },
  ];

  if (vehiclesResult.error) throw new Error(`Could not load transport vehicles: ${vehiclesResult.error.message}`);
  if (routesResult.error) throw new Error(`Could not load transport routes: ${routesResult.error.message}`);
  if (assignmentsResult.error) throw new Error(`Could not load student transport assignments: ${assignmentsResult.error.message}`);
  if ((vehiclesResult.count ?? 0) > DATA_LIMIT || (routesResult.count ?? 0) > DATA_LIMIT
    || (assignmentsResult.count ?? 0) > DATA_LIMIT) {
    throw new Error("Transport results exceed 1,000 records. Filter to one campus to view the data.");
  }

  const vehicles = vehiclesResult.data ?? [];
  const routes = routesResult.data ?? [];
  const assignments = assignmentsResult.data ?? [];
  const studentIds = [...new Set(assignments.map((assignment) => assignment.student_id))];
  const { data: students, error: studentsError } = studentIds.length && canViewStudents
    ? await supabase.from("education_students").select("id, student_number, first_name, last_name")
      .eq("org_id", context.orgId).in("id", studentIds)
    : { data: [], error: null };
  if (studentsError) throw new Error(`Could not load transport student details: ${studentsError.message}`);

  const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const routeById = new Map(routes.map((route) => [route.id, route]));
  const studentById = new Map((students ?? []).map((student) => [student.id, student]));
  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const assignmentCountByRoute = new Map<string, number>();
  for (const assignment of assignments) {
    assignmentCountByRoute.set(assignment.route_id, (assignmentCountByRoute.get(assignment.route_id) ?? 0) + 1);
  }
  const activeRoutes = routes.filter((route) => {
    const vehicle = vehicleById.get(route.vehicle_id);
    return route.status === "active" && vehicle?.status === "active";
  });
  const routeSummaries = summarizeEducationTransportRoutes(routes, vehicles, assignments);
  const activeRouteSummaries = routeSummaries.filter((summary) => summary.route_status === "active" && summary.vehicle_status === "active");
  const activeRouteCount = activeRouteSummaries.length;
  const assignedStudents = routeSummaries.reduce((total, summary) => total + summary.active_assignment_count, 0);
  const transportCapacity = routeSummaries.reduce((total, summary) => total + summary.capacity, 0);
  const transportUtilization = transportCapacity > 0 ? Math.round((assignedStudents / transportCapacity) * 1000) / 10 : 0;
  const highestUtilizationRoute = routeSummaries.reduce<null | { route_name: string; utilization: number }>((current, summary) => {
    const utilization = summary.capacity > 0 ? summary.utilization_percentage : 0;
    if (!current || utilization > current.utilization) {
      return { route_name: summary.route_name, utilization };
    }
    return current;
  }, null);
  const csvRows = [
    ["Campus", "Route", "Driver", "Vehicle", "Vehicle status", "Route status", "Capacity", "Assigned students", "Available seats", "Utilization %"],
    ...routeSummaries.map((summary) => {
      const route = routeById.get(summary.route_id);
      return [
        campusNameById.get(summary.branch_id) ?? summary.branch_id,
        summary.route_name,
        route?.driver_name ?? "",
        summary.vehicle_registration,
        summary.vehicle_status,
        summary.route_status,
        String(summary.capacity),
        String(summary.active_assignment_count),
        String(summary.available_seats),
        `${summary.utilization_percentage}`,
      ];
    }),
  ];
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(csvRows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n"))}`;

  const errorMessage = params.error === "invalid"
    ? "Check the campus, vehicle capacity, route details, and stop order."
    : params.error === "duplicate-vehicle"
      ? "A vehicle with that registration number already exists at this campus."
      : params.error === "duplicate-route"
        ? "A route with that name already exists, or its vehicle already has an active route."
        : params.error === "vehicle"
          ? "Select an active vehicle at the selected campus."
          : params.error === "student-or-route"
            ? "The active student or route could not be found at this campus."
            : params.error === "capacity-or-stops"
              ? "The route is full, inactive, or the selected stops are not in route order."
              : params.error === "already-assigned"
                ? "This student already has an active transport assignment."
                : params.error === "vehicle-in-use"
                  ? "Another active route is already using this vehicle."
                  : params.error === "transition"
                    ? "End active assignments or deactivate dependent routes before making this change."
                    : params.error === "not-found"
                      ? "The transport record could not be found."
                      : params.error === "save"
                        ? "The transport update could not be saved. Please try again."
                        : null;

  return <main className="mx-auto max-w-[1400px] space-y-5 p-4 md:p-6">
    <header>
      <Link href={getProductAppPath("think-education", "/dashboard")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-950">Transport</h1>
      <p className="mt-1 text-sm text-slate-600">Manage campus vehicles, routes and stops, drivers, and student transport assignments.</p>
    </header>

    {params.vehicle === "created" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Vehicle added to the fleet.</p>}
    {params.vehicle === "updated" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Vehicle status updated.</p>}
    {params.route === "created" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Route created with its ordered stops.</p>}
    {params.route === "updated" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Route status updated.</p>}
    {params.assignment === "created" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Student assigned to transport.</p>}
    {params.assignment === "ended" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Student transport assignment ended.</p>}
    {params.error && errorMessage && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{errorMessage}</p>}

    <form method="get" action={getProductAppPath("think-education", "/transport")} className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <label className="min-w-60 text-sm font-medium text-slate-700">Campus
        <select name="branch" defaultValue={selectedBranch} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
          <option value="">All assigned campuses</option>
          {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
        </select>
      </label>
      <button type="submit" className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100">Apply campus filter</button>
      {routeSummaries.length > 0 && <a href={csvHref} download={`education-transport-routes-${new Date().toISOString().slice(0, 10)}.csv`} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Export CSV</a>}
    </form>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm text-slate-500">Active routes</p>
        <p className="mt-1 text-2xl font-bold text-slate-950">{activeRouteCount.toLocaleString()}</p>
      </article>
      <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm text-slate-500">Assigned students</p>
        <p className="mt-1 text-2xl font-bold text-slate-950">{assignedStudents.toLocaleString()}</p>
      </article>
      <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm text-slate-500">Seats in routes</p>
        <p className="mt-1 text-2xl font-bold text-slate-950">{transportCapacity.toLocaleString()}</p>
      </article>
      <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm text-slate-500">Avg utilization</p>
        <p className="mt-1 text-2xl font-bold text-slate-950">{transportCapacity > 0 ? `${transportUtilization}%` : "—"}</p>
      </article>
    </section>

    {highestUtilizationRoute && <p className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
      Most utilized route: <span className="font-semibold">{highestUtilizationRoute.route_name}</span> at <span className="font-semibold">{highestUtilizationRoute.utilization.toFixed(1)}%</span>.
    </p>}

    {canViewFleet && <section className="space-y-5">
      {canCreateFleet && <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-950">Add a vehicle</h2>
          {!campuses.length ? <p className="mt-3 text-sm text-slate-500">You need an assigned campus before adding vehicles.</p> : <form action={createEducationTransportVehicle} className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">Campus
              <select required name="branch_id" defaultValue={selectedBranch || campuses[0]?.id || ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
                {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">Registration number
              <input required name="registration_number" maxLength={32} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
            </label>
            <label className="text-sm font-medium text-slate-700">Make / model
              <input required name="make_model" maxLength={120} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
            </label>
            <label className="text-sm font-medium text-slate-700">Seat capacity
              <input required name="capacity" type="number" min="1" max="200" step="1" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
            </label>
            <div className="sm:col-span-2"><button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Add vehicle</button></div>
          </form>}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-950">Create a route</h2>
          <p className="mt-1 text-sm text-slate-500">Enter stops one per line in the order the vehicle visits them. A vehicle can have one active route at a time.</p>
          {!campuses.length ? <p className="mt-3 text-sm text-slate-500">You need an assigned campus before creating routes.</p> : <form action={createEducationTransportRoute} className="mt-4 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="branch_id" value={routeCreationBranchId} />
            <label className="text-sm font-medium text-slate-700">Campus
              <span className="mt-1 block rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-normal">{campusNameById.get(routeCreationBranchId) ?? "Select campus using the campus filter above"}</span>
            </label>
            <label className="text-sm font-medium text-slate-700">Vehicle
              <select required name="vehicle_id" defaultValue="" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
                <option value="" disabled>Select vehicle</option>
                {vehicles.filter((vehicle) => vehicle.status === "active" && vehicle.branch_id === routeCreationBranchId).map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.registration_number} · {vehicle.capacity} seats</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">Route name
              <input required name="name" maxLength={100} placeholder="North campus route" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
            </label>
            <label className="text-sm font-medium text-slate-700">Driver name
              <input required name="driver_name" maxLength={120} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
            </label>
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">Driver phone (optional)
              <input name="driver_phone" maxLength={32} type="tel" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
            </label>
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">Ordered stops
              <textarea required name="stops" rows={4} maxLength={4000} placeholder={"Main Gate\nMarket Square\nSchool"} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
            </label>
            <div className="sm:col-span-2"><button disabled={!vehicles.some((vehicle) => vehicle.status === "active" && vehicle.branch_id === routeCreationBranchId)} type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white enabled:hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">Create route</button></div>
          </form>}
        </section>
      </div>}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 p-4">
          <Bus className="h-5 w-5 text-blue-700" />
          <h2 className="font-semibold text-slate-950">Fleet</h2>
          <span className="text-sm text-slate-500">{vehicles.length} vehicles</span>
        </div>
        {vehicles.length ? <div className="divide-y divide-slate-100">
          {vehicles.map((vehicle) => <article key={vehicle.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-semibold text-slate-950">{vehicle.registration_number} · {vehicle.make_model}</p>
              <p className="mt-1 text-sm text-slate-500">{campusNameById.get(vehicle.branch_id)} · Capacity {vehicle.capacity}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${vehicle.status === "active" ? "bg-emerald-50 text-emerald-700" : vehicle.status === "maintenance" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{VEHICLE_STATUS_LABELS[vehicle.status]}</span>
              {canEditFleet && vehicle.status !== "retired" && <form action={setEducationTransportVehicleStatus} className="flex items-center gap-2">
                <input type="hidden" name="vehicle_id" value={vehicle.id} />
                <select name="status" defaultValue={vehicle.status === "active" ? "maintenance" : "active"} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                  {vehicle.status === "active" ? <option value="maintenance">Maintenance</option> : <option value="active">Active</option>}
                  <option value="retired">Retire</option>
                </select>
                <button type="submit" className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium hover:bg-slate-50">Update</button>
              </form>}
            </div>
          </article>)}
        </div> : <p className="p-6 text-center text-sm text-slate-500">No vehicles have been added to the fleet.</p>}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 p-4">
          <RouteIcon className="h-5 w-5 text-blue-700" />
          <h2 className="font-semibold text-slate-950">Routes</h2>
          <span className="text-sm text-slate-500">{routes.length} routes</span>
        </div>
        {routes.length ? <div className="divide-y divide-slate-100">
          {routes.map((route) => {
            const vehicle = vehicleById.get(route.vehicle_id);
            const routeAssignmentCount = canViewAssignments
              ? assignmentCountByRoute.get(route.id) ?? 0
              : null;
            return <article key={route.id} className="space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-950">{route.name}</p>
                  <p className="mt-1 text-sm text-slate-600">{campusNameById.get(route.branch_id)} · {vehicle?.registration_number ?? "Vehicle"} · {route.driver_name}{route.driver_phone ? ` · ${route.driver_phone}` : ""}</p>
                  <p className="mt-2 text-sm text-slate-500">Stops: {route.stops.join(" → ")}</p>
                  <p className="mt-1 text-xs text-slate-500">{routeAssignmentCount === null ? "Student assignment details are restricted" : `${routeAssignmentCount} assigned of ${vehicle?.capacity ?? 0} seats`}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${route.status === "active" ? "bg-emerald-50 text-emerald-700" : route.status === "paused" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{ROUTE_STATUS_LABELS[route.status]}</span>
                  {canEditFleet && route.status !== "retired" && <form action={setEducationTransportRouteStatus} className="flex items-center gap-2">
                    <input type="hidden" name="route_id" value={route.id} />
                    <select name="status" defaultValue={route.status === "active" ? "paused" : "active"} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                      {route.status === "active" ? <option value="paused">Pause</option> : <option value="active">Activate</option>}
                      <option value="retired">Retire</option>
                    </select>
                    <button type="submit" className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium hover:bg-slate-50">Update</button>
                  </form>}
                </div>
              </div>
              {canAssign && route.status === "active" && vehicle?.status === "active" && <form action={assignEducationStudentTransport} className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-4">
                <input type="hidden" name="route_id" value={route.id} />
                <label className="text-sm font-medium text-slate-700">Student number
                  <input required name="student_number" maxLength={80} autoComplete="off" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal" />
                </label>
                <label className="text-sm font-medium text-slate-700">Pickup stop
                  <select required name="pickup_stop" defaultValue="" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal">
                    <option value="" disabled>Select pickup</option>
                    {route.stops.slice(0, -1).map((stop) => <option key={stop} value={stop}>{stop}</option>)}
                  </select>
                </label>
                <label className="text-sm font-medium text-slate-700">Drop-off stop
                  <select required name="dropoff_stop" defaultValue="" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal">
                    <option value="" disabled>Select drop-off</option>
                    {route.stops.slice(1).map((stop) => <option key={stop} value={stop}>{stop}</option>)}
                  </select>
                </label>
                <div className="flex items-end"><button disabled={routeAssignmentCount !== null && routeAssignmentCount >= (vehicle.capacity ?? 0)} type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white enabled:hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">Assign student</button></div>
              </form>}
            </article>;
          })}
        </div> : <p className="p-6 text-center text-sm text-slate-500">No routes have been created yet.</p>}
      </section>
    </section>}

    {canViewAssignments && <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-100 p-4">
        <UserRound className="h-5 w-5 text-blue-700" />
        <h2 className="font-semibold text-slate-950">Active student assignments</h2>
        <span className="text-sm text-slate-500">{assignments.length}</span>
      </div>
      {assignments.length ? <div className="divide-y divide-slate-100">
        {assignments.map((assignment) => {
          const route = routeById.get(assignment.route_id);
          const student = studentById.get(assignment.student_id);
          return <article key={assignment.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-semibold text-slate-950">{student ? `${student.first_name} ${student.last_name}` : "Student"}{student ? ` · ${student.student_number}` : ""}</p>
              <p className="mt-1 text-sm text-slate-600">{route?.name ?? "Route"} · {campusNameById.get(assignment.branch_id)}</p>
              <p className="mt-1 text-sm text-slate-500">{assignment.pickup_stop} → {assignment.dropoff_stop} · Since {assignment.starts_on}</p>
            </div>
            {canEndAssignment && <form action={endEducationStudentTransport}>
              <input type="hidden" name="assignment_id" value={assignment.id} />
              <button type="submit" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">End assignment</button>
            </form>}
          </article>;
        })}
      </div> : <p className="p-6 text-center text-sm text-slate-500">No active student transport assignments in these campuses.</p>}
    </section>}
  </main>;
}
