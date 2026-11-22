import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canAccessLocation } from "@/lib/organizations/location-access";
import { manageAttendance } from "../management-actions";

const DAY_OPTIONS = [
  ["1", "Mon"], ["2", "Tue"], ["3", "Wed"], ["4", "Thu"], ["5", "Fri"], ["6", "Sat"], ["0", "Sun"],
] as const;

const PAGE_META: Record<string, { title: string; description: string }> = {
  shifts: { title: "Shift Management", description: "Create work shifts and assign employees to scheduled days." },
  locations: { title: "Locations & Geofencing", description: "Configure branch coordinates and attendance verification radius." },
  corrections: { title: "Correction Approvals", description: "Review requests to correct an employee’s check-in or check-out." },
  reports: { title: "Attendance Reports", description: "Review attendance patterns, hours worked, and absences." },
  breaks: { title: "Break Management", description: "Set break policies and track employee break sessions." },
  calendar: { title: "Employee Calendar", description: "Schedule employee shifts by date and branch." },
  overtime: { title: "Overtime Management", description: "Review requested overtime and update approved attendance hours." },
  settings: { title: "Attendance Settings", description: "Set organization-wide work hours, thresholds, and notifications." },
};

const cardClass = "rounded-xl border border-ledger-200 bg-white p-5 shadow-sm dark:border-ledger-700 dark:bg-ledger-900";
const fieldClass = "w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 text-sm text-ink-900 dark:border-ledger-600 dark:bg-ledger-800 dark:text-white";
const buttonClass = "inline-flex items-center justify-center rounded-lg bg-[var(--theme-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1.5 text-sm font-medium text-ink-700 dark:text-ledger-200"><span>{label}</span>{children}</label>;
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return <header className="mb-5">
    <h1 className="text-2xl font-bold text-ink-900 dark:text-white">{title}</h1>
    <p className="mt-1 text-sm text-ledger-500">{description}</p>
    <nav aria-label="Attendance management pages" className="mt-4 flex flex-wrap gap-2">
      {Object.entries(PAGE_META).map(([key, page]) =>
        <Link key={key} href={`/hrm/attendance/${key}`} className="rounded-full border border-ledger-200 px-3 py-1.5 text-xs font-medium text-ledger-600 hover:border-[var(--theme-primary)] hover:text-[var(--theme-primary)] dark:border-ledger-700 dark:text-ledger-300">
          {page.title}
        </Link>
      )}
    </nav>
  </header>;
}

function LocationOptions({ locations }: { locations: Array<{ id: string; name: string }> }) {
  return <select name="locationId" className={fieldClass} defaultValue="">
    <option value="">Use employee/default location</option>
    {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
  </select>;
}

function EmployeeOptions({ employees }: { employees: Array<{ id: string; full_name: string }> }) {
  return <select name="employeeId" required className={fieldClass} defaultValue="">
    <option value="" disabled>Select employee</option>
    {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}
  </select>;
}

function ShiftOptions({ shifts }: { shifts: Array<{ id: string; name: string }> }) {
  return <select name="shiftId" required className={fieldClass} defaultValue="">
    <option value="" disabled>Select shift</option>
    {shifts.map((shift) => <option key={shift.id} value={shift.id}>{shift.name}</option>)}
  </select>;
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-sm text-ledger-500">{children}</p>;
}

export default async function AttendanceManagementPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string[] }>;
  searchParams: Promise<{ start?: string; end?: string }>;
}) {
  const { section } = await params;
  const pageKey = section[0];
  const page = PAGE_META[pageKey];
  if (!page || section.length !== 1) notFound();

  const context = await getCurrentOrgContext();
  if (!context) return null;
  const supabase = await createClient();
  const [employeeResult, locationResult] = await Promise.all([
    supabase.from("employees").select("id, full_name, location_id, department, status")
      .eq("org_id", context.orgId).eq("status", "active").order("full_name"),
    supabase.from("business_locations").select("id, name, latitude, longitude, geofence_radius_meters, gps_verification_required, is_active")
      .eq("org_id", context.orgId).eq("is_active", true).order("name"),
  ]);
  if (employeeResult.error) throw new Error(`Could not load attendance employees: ${employeeResult.error.message}`);
  if (locationResult.error) throw new Error(`Could not load attendance locations: ${locationResult.error.message}`);

  const locations = (locationResult.data ?? []).filter((location) => canAccessLocation(context, location.id));
  const employees = (employeeResult.data ?? []).filter((employee) =>
    !context.isBranchScoped || Boolean(employee.location_id && context.allowedLocationIds.includes(employee.location_id))
  );
  const employeeNames = new Map(employees.map((employee) => [employee.id, employee.full_name]));
  const locationNames = new Map(locations.map((location) => [location.id, location.name]));

  const [shiftResult, assignmentResult, correctionResult, policyResult, breakResult, overtimeResult, settingsResult] = await Promise.all([
    pageKey === "shifts" || pageKey === "calendar"
      ? supabase.from("attendance_shifts").select("*").eq("org_id", context.orgId).order("name").limit(200)
      : Promise.resolve(null),
    pageKey === "calendar"
      ? supabase.from("attendance_shift_assignments").select("*").eq("org_id", context.orgId).order("assignment_date", { ascending: false }).limit(200)
      : Promise.resolve(null),
    pageKey === "corrections"
      ? supabase.from("attendance_correction_requests").select("*").eq("org_id", context.orgId).order("created_at", { ascending: false }).limit(200)
      : Promise.resolve(null),
    pageKey === "breaks"
      ? supabase.from("attendance_break_policies").select("*").eq("org_id", context.orgId).order("name")
      : Promise.resolve(null),
    pageKey === "breaks"
      ? supabase.from("attendance_break_sessions").select("*").eq("org_id", context.orgId).order("started_at", { ascending: false }).limit(100)
      : Promise.resolve(null),
    pageKey === "overtime"
      ? supabase.from("attendance_overtime_requests").select("*").eq("org_id", context.orgId).order("created_at", { ascending: false }).limit(200)
      : Promise.resolve(null),
    pageKey === "settings"
      ? supabase.from("attendance_management_settings").select("*").eq("org_id", context.orgId).maybeSingle()
      : Promise.resolve(null),
  ]);
  const resultErrors = [
    shiftResult?.error,
    assignmentResult?.error,
    correctionResult?.error,
    policyResult?.error,
    breakResult?.error,
    overtimeResult?.error,
    settingsResult?.error,
  ];
  const failedResult = resultErrors.find((error) => error);
  if (failedResult) throw new Error(`Could not load attendance management data: ${failedResult.message}`);

  const { start, end } = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const monthDate = new Date(`${today}T00:00:00Z`);
  const calendarYear = monthDate.getUTCFullYear();
  const calendarMonth = monthDate.getUTCMonth();
  const firstWeekday = (new Date(Date.UTC(calendarYear, calendarMonth, 1)).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(calendarYear, calendarMonth + 1, 0)).getUTCDate();
  const calendarDays: Array<number | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  const monthLabel = new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(monthDate);
  const defaultStartDate = new Date();
  defaultStartDate.setDate(defaultStartDate.getDate() - 29);
  const defaultStart = defaultStartDate.toISOString().slice(0, 10);
  const startDate = start && /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : defaultStart;
  const endDate = end && /^\d{4}-\d{2}-\d{2}$/.test(end) ? end : today;
  const recordResult = pageKey === "reports" || pageKey === "overtime"
    ? await supabase.from("attendance_records").select("*").eq("org_id", context.orgId)
      .gte("work_date", startDate).lte("work_date", endDate).order("work_date", { ascending: false }).limit(1000)
    : null;
  if (recordResult?.error) throw new Error(`Could not load attendance records: ${recordResult.error.message}`);
  const records = (recordResult?.data ?? []).filter((record) =>
    !context.isBranchScoped || Boolean(record.location_id && context.allowedLocationIds.includes(record.location_id))
  );

  const shifts = (shiftResult?.data ?? []).filter((shift) => canAccessLocation(context, shift.location_id));
  const assignments = (assignmentResult?.data ?? []).filter((assignment) => canAccessLocation(context, assignment.location_id));
  const corrections = (correctionResult?.data ?? []).filter((request) => canAccessLocation(context, request.location_id));
  const breakSessions = (breakResult?.data ?? []).filter((session) => canAccessLocation(context, session.location_id));
  const overtimeRequests = (overtimeResult?.data ?? []).filter((request) => canAccessLocation(context, request.location_id));
  const breakPolicies = policyResult?.data ?? [];
  const attendanceSettings = settingsResult?.data ?? null;

  return <main>
    <SectionHeader title={page.title} description={page.description} />

    {pageKey === "shifts" && <div className="grid gap-5 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
      <form action={manageAttendance} className={`${cardClass} grid content-start gap-4`}>
        <h2 className="text-lg font-semibold">Create a shift</h2>
        <input type="hidden" name="intent" value="add_shift" />
        <Field label="Shift name"><input name="name" required maxLength={120} className={fieldClass} placeholder="Morning shift" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start time"><input name="startsAt" type="time" required className={fieldClass} defaultValue="09:00" /></Field>
          <Field label="End time"><input name="endsAt" type="time" required className={fieldClass} defaultValue="17:00" /></Field>
        </div>
        <Field label="Department (optional)"><input name="department" className={fieldClass} /></Field>
        <Field label="Branch"><LocationOptions locations={locations} /></Field>
        <fieldset className="grid gap-2"><legend className="text-sm font-medium">Working days</legend>
          <div className="flex flex-wrap gap-3">{DAY_OPTIONS.map(([value, label]) => <label key={value} className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="workingDay" value={value} defaultChecked={value !== "0" && value !== "6"} />{label}</label>)}</div>
        </fieldset>
        <button className={buttonClass}>Create shift</button>
      </form>
      <section className={cardClass}>
        <h2 className="mb-4 text-lg font-semibold">Shift list</h2>
        {!shifts.length ? <EmptyState>No shifts have been created.</EmptyState> : <div className="space-y-3">
          {shifts.map((shift) => <div key={shift.id} className="rounded-lg border border-ledger-200 p-4 dark:border-ledger-700">
            <form action={manageAttendance} className="grid gap-3 md:grid-cols-2">
              <input type="hidden" name="intent" value="update_shift" /><input type="hidden" name="shiftId" value={shift.id} />
              <Field label="Shift name"><input name="name" required className={fieldClass} defaultValue={shift.name} /></Field>
              <Field label="Department"><input name="department" className={fieldClass} defaultValue={shift.department ?? ""} /></Field>
              <Field label="Start time"><input name="startsAt" type="time" required className={fieldClass} defaultValue={shift.starts_at.slice(0, 5)} /></Field>
              <Field label="End time"><input name="endsAt" type="time" required className={fieldClass} defaultValue={shift.ends_at.slice(0, 5)} /></Field>
              <Field label="Branch"><select name="locationId" className={fieldClass} defaultValue={shift.location_id ?? ""}><option value="">No branch</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></Field>
              <Field label="Status"><select name="status" className={fieldClass} defaultValue={shift.status}><option value="active">Active</option><option value="inactive">Inactive</option></select></Field>
              {shift.working_days.map((day) => <input key={day} type="hidden" name="workingDay" value={day} />)}
              <button className={`${buttonClass} md:col-span-2`}>Save changes</button>
            </form>
            <form action={manageAttendance} className="mt-2 text-right">
              <input type="hidden" name="intent" value="delete_shift" /><input type="hidden" name="shiftId" value={shift.id} />
              <button className="text-sm font-medium text-red-600 hover:underline">Delete shift</button>
            </form>
          </div>)}
        </div>}
      </section>
    </div>}

    {pageKey === "locations" && <section className={cardClass}>
      <h2 className="mb-4 text-lg font-semibold">Branch geofencing</h2>
      {!locations.length ? <EmptyState>No accessible active branches are available.</EmptyState> : <div className="grid gap-4 lg:grid-cols-2">
        {locations.map((location) => <form key={location.id} action={manageAttendance} className="grid gap-3 rounded-lg border border-ledger-200 p-4 dark:border-ledger-700">
          <input type="hidden" name="intent" value="save_location" /><input type="hidden" name="locationId" value={location.id} />
          <h3 className="font-semibold">{location.name}</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Latitude"><input name="latitude" type="number" step="any" min="-90" max="90" className={fieldClass} defaultValue={location.latitude ?? ""} /></Field>
            <Field label="Longitude"><input name="longitude" type="number" step="any" min="-180" max="180" className={fieldClass} defaultValue={location.longitude ?? ""} /></Field>
          </div>
          <Field label="Geofence radius (meters)"><input name="radiusMeters" type="number" min="10" max="10000" required className={fieldClass} defaultValue={location.geofence_radius_meters} /></Field>
          <label className="flex items-center gap-2 text-sm"><input name="gpsVerificationRequired" type="checkbox" defaultChecked={location.gps_verification_required} />Require GPS verification</label>
          <button className={buttonClass}>Save geofence</button>
        </form>)}
      </div>}
      <p className="mt-4 text-xs text-ledger-500">A geofence is only enforced when organization attendance settings enable geofencing.</p>
    </section>}

    {pageKey === "corrections" && <div className="grid gap-5 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
      <form action={manageAttendance} className={`${cardClass} grid content-start gap-4`}>
        <h2 className="text-lg font-semibold">Request a correction</h2>
        <input type="hidden" name="intent" value="request_correction" />
        <Field label="Employee"><EmployeeOptions employees={employees} /></Field>
        <Field label="Work date"><input name="workDate" type="date" required className={fieldClass} max={today} defaultValue={today} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Requested check-in"><input name="requestedCheckIn" type="time" className={fieldClass} /></Field>
          <Field label="Requested check-out"><input name="requestedCheckOut" type="time" className={fieldClass} /></Field>
        </div>
        <Field label="Branch"><LocationOptions locations={locations} /></Field>
        <Field label="Reason"><textarea name="reason" required maxLength={2000} rows={3} className={fieldClass} /></Field>
        <button className={buttonClass}>Submit request</button>
      </form>
      <section className={cardClass}>
        <h2 className="mb-4 text-lg font-semibold">Recent correction requests</h2>
        {!corrections.length ? <EmptyState>No correction requests found.</EmptyState> : <div className="space-y-3">
          {corrections.map((request) => <article key={request.id} className="rounded-lg border border-ledger-200 p-4 dark:border-ledger-700">
            <div className="flex flex-wrap justify-between gap-2"><strong>{employeeNames.get(request.employee_id) ?? "Employee"}</strong><span className="text-xs capitalize">{request.status}</span></div>
            <p className="mt-1 text-sm text-ledger-500">{request.work_date} · {locationNames.get(request.location_id ?? "") ?? "No branch"}</p>
            <p className="mt-2 text-sm">{request.reason}</p>
            <p className="mt-1 text-xs text-ledger-500">Check-in: {request.requested_check_in ?? request.original_check_in ?? "—"} · Check-out: {request.requested_check_out ?? request.original_check_out ?? "—"}</p>
            {request.status === "pending" && <form action={manageAttendance} className="mt-3 flex flex-wrap items-end gap-2">
              <input type="hidden" name="intent" value="review_correction" /><input type="hidden" name="requestId" value={request.id} />
              <input name="decisionNote" className={`${fieldClass} min-w-40 flex-1`} placeholder="Decision note (optional)" />
              <button name="decision" value="approved" className={buttonClass}>Approve</button>
              <button name="decision" value="rejected" className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700">Reject</button>
            </form>}
          </article>)}
        </div>}
      </section>
    </div>}

    {pageKey === "reports" && <div className="space-y-5">
      <form className={`${cardClass} flex flex-wrap items-end gap-3`}>
        <Field label="From"><input type="date" name="start" className={fieldClass} defaultValue={startDate} /></Field>
        <Field label="To"><input type="date" name="end" className={fieldClass} defaultValue={endDate} /></Field>
        <button className={buttonClass}>Apply date range</button>
      </form>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Records", records.length],
          ["Present", records.filter((record) => record.status === "present").length],
          ["Absent", records.filter((record) => record.status === "absent").length],
          ["Hours worked", records.reduce((sum, record) => sum + Number(record.total_hours ?? 0), 0).toFixed(1)],
        ].map(([label, value]) => <article key={label} className={cardClass}><p className="text-sm text-ledger-500">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></article>)}
      </section>
      <section className={cardClass}>
        <h2 className="mb-4 text-lg font-semibold">Attendance records</h2>
        {!records.length ? <EmptyState>No attendance records in this range.</EmptyState> : <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="text-xs uppercase text-ledger-500"><tr><th className="py-2">Date</th><th>Employee</th><th>Branch</th><th>Status</th><th>Hours</th><th>Overtime</th></tr></thead>
            <tbody>{records.map((record) => <tr key={record.id} className="border-t border-ledger-100 dark:border-ledger-700">
              <td className="py-3">{record.work_date}</td><td>{employeeNames.get(record.employee_id) ?? "Employee"}</td>
              <td>{locationNames.get(record.location_id ?? "") ?? "—"}</td><td className="capitalize">{record.status.replace("_", " ")}</td>
              <td>{Number(record.total_hours ?? 0).toFixed(2)}</td><td>{Number(record.overtime_hours ?? 0).toFixed(2)}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      </section>
    </div>}

    {pageKey === "breaks" && <div className="grid gap-5 xl:grid-cols-2">
      <section className={`${cardClass} grid content-start gap-5`}>
        <form action={manageAttendance} className="grid gap-3">
          <h2 className="text-lg font-semibold">Create break policy</h2><input type="hidden" name="intent" value="add_break_policy" />
          <Field label="Policy name"><input name="name" required maxLength={120} className={fieldClass} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Duration (minutes)"><input name="durationMinutes" type="number" min="1" max="480" required className={fieldClass} defaultValue="30" /></Field>
            <Field label="Applies after (hours)"><input name="appliesAfterHours" type="number" min="0" max="24" step="0.25" required className={fieldClass} defaultValue="4" /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isPaid" />Paid break</label><button className={buttonClass}>Add policy</button>
        </form>
        <div><h3 className="mb-2 font-semibold">Break policies</h3>{!breakPolicies.length ? <EmptyState>No break policies found.</EmptyState> : <div className="space-y-2">{breakPolicies.map((policy) => <form key={policy.id} action={manageAttendance} className="grid gap-3 rounded-lg border border-ledger-200 p-3 dark:border-ledger-700">
          <input type="hidden" name="intent" value="update_break_policy" /><input type="hidden" name="policyId" value={policy.id} />
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Policy name"><input name="name" required maxLength={120} className={fieldClass} defaultValue={policy.name} /></Field><Field label="Duration (minutes)"><input name="durationMinutes" type="number" min="1" max="480" required className={fieldClass} defaultValue={policy.duration_minutes} /></Field><Field label="Applies after (hours)"><input name="appliesAfterHours" type="number" min="0" max="24" step="0.25" required className={fieldClass} defaultValue={policy.applies_after_hours} /></Field></div>
          <div className="flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isPaid" defaultChecked={policy.is_paid} />Paid break</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={policy.is_active} />Active</label><button className={buttonClass}>Save policy</button></div>
        </form>)}</div>}</div>
      </section>
      <section className={`${cardClass} grid content-start gap-5`}>
        <form action={manageAttendance} className="grid gap-3">
          <h2 className="text-lg font-semibold">Start a break</h2><input type="hidden" name="intent" value="start_break" />
          <Field label="Employee"><EmployeeOptions employees={employees} /></Field>
          <Field label="Policy"><select name="policyId" className={fieldClass} defaultValue=""><option value="">No policy</option>{breakPolicies.filter((policy) => policy.is_active).map((policy) => <option key={policy.id} value={policy.id}>{policy.name}</option>)}</select></Field>
          <Field label="Branch"><LocationOptions locations={locations} /></Field>
          <Field label="Notes"><input name="notes" className={fieldClass} /></Field>
          <button className={buttonClass}>Start break</button>
        </form>
        <div><h3 className="mb-2 font-semibold">Break sessions</h3>{!breakSessions.length ? <EmptyState>No break sessions found.</EmptyState> : <ul className="space-y-2">{breakSessions.map((session) => <li key={session.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ledger-200 p-3 text-sm dark:border-ledger-700"><span>{employeeNames.get(session.employee_id) ?? "Employee"} · {new Date(session.started_at).toLocaleString()}</span>{!session.ended_at && <form action={manageAttendance}><input type="hidden" name="intent" value="end_break" /><input type="hidden" name="sessionId" value={session.id} /><button className="font-semibold text-[var(--theme-primary)]">End break</button></form>}</li>)}</ul>}</div>
      </section>
    </div>}

    {pageKey === "calendar" && <div className="grid gap-5 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
      <form action={manageAttendance} className={`${cardClass} grid content-start gap-4`}>
        <h2 className="text-lg font-semibold">Assign a shift</h2><input type="hidden" name="intent" value="assign_shift" />
        <Field label="Employee"><EmployeeOptions employees={employees} /></Field>
        <Field label="Shift"><ShiftOptions shifts={shifts.filter((shift) => shift.status === "active")} /></Field>
        <Field label="Work date"><input name="assignmentDate" type="date" required className={fieldClass} defaultValue={today} /></Field>
        <Field label="Branch"><LocationOptions locations={locations} /></Field>
        <button className={buttonClass}>Save assignment</button>
      </form>
      <section className={cardClass}>
        <h2 className="mb-4 text-lg font-semibold">{monthLabel} schedule</h2>
        <div className="grid grid-cols-7 border-l border-t border-ledger-200 dark:border-ledger-700">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((weekday) => <div key={weekday} className="border-b border-r border-ledger-200 bg-ledger-50 p-2 text-center text-xs font-semibold dark:border-ledger-700 dark:bg-ledger-800">{weekday}</div>)}
          {calendarDays.map((day, index) => {
            const date = day ? `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` : "";
            const dayAssignments = assignments.filter((assignment) => assignment.assignment_date === date);
            return <div key={`${date || "blank"}-${index}`} className="min-h-24 border-b border-r border-ledger-200 p-2 dark:border-ledger-700">
              {day && <><span className="text-xs font-semibold">{day}</span><div className="mt-1 space-y-1">{dayAssignments.slice(0, 3).map((assignment) => <p key={assignment.id} className="truncate rounded bg-[var(--theme-primary)]/10 px-1.5 py-1 text-[10px] text-[var(--theme-primary)]" title={`${employeeNames.get(assignment.employee_id) ?? "Employee"} · ${shifts.find((shift) => shift.id === assignment.shift_id)?.name ?? "Shift"}`}>{employeeNames.get(assignment.employee_id) ?? "Employee"} · {shifts.find((shift) => shift.id === assignment.shift_id)?.name ?? "Shift"}</p>)}{dayAssignments.length > 3 && <p className="text-[10px] text-ledger-500">+{dayAssignments.length - 3} more</p>}</div></>}
            </div>;
          })}
        </div>
        <h3 className="mb-4 mt-6 text-lg font-semibold">All assignments</h3>
        {!assignments.length ? <EmptyState>No shift assignments found.</EmptyState> : <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-left text-sm"><thead className="text-xs uppercase text-ledger-500"><tr><th className="py-2">Date</th><th>Employee</th><th>Shift</th><th>Branch</th></tr></thead>
            <tbody>{assignments.map((assignment) => <tr key={assignment.id} className="border-t border-ledger-100 dark:border-ledger-700"><td className="py-3">{assignment.assignment_date}</td><td>{employeeNames.get(assignment.employee_id) ?? "Employee"}</td><td>{shifts.find((shift) => shift.id === assignment.shift_id)?.name ?? "Shift"}</td><td>{locationNames.get(assignment.location_id ?? "") ?? "—"}</td></tr>)}</tbody>
          </table>
        </div>}
      </section>
    </div>}

    {pageKey === "overtime" && <div className="grid gap-5 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
      <form action={manageAttendance} className={`${cardClass} grid content-start gap-4`}>
        <h2 className="text-lg font-semibold">Request overtime</h2><input type="hidden" name="intent" value="request_overtime" />
        <Field label="Attendance record"><select name="attendanceRecordId" required className={fieldClass} defaultValue=""><option value="" disabled>Select employee and date</option>{records.map((record) => <option key={record.id} value={record.id}>{employeeNames.get(record.employee_id) ?? "Employee"} · {record.work_date}</option>)}</select></Field>
        <Field label="Requested hours"><input name="requestedHours" type="number" min="0.01" max="24" step="0.25" required className={fieldClass} /></Field>
        <Field label="Reason"><textarea name="reason" required maxLength={2000} rows={3} className={fieldClass} /></Field>
        <button className={buttonClass}>Submit request</button>
      </form>
      <section className={cardClass}>
        <h2 className="mb-4 text-lg font-semibold">Overtime requests</h2>
        {!overtimeRequests.length ? <EmptyState>No overtime requests found.</EmptyState> : <div className="space-y-3">
          {overtimeRequests.map((request) => <article key={request.id} className="rounded-lg border border-ledger-200 p-4 dark:border-ledger-700">
            <div className="flex flex-wrap justify-between gap-2"><strong>{employeeNames.get(request.employee_id) ?? "Employee"}</strong><span className="text-xs capitalize">{request.status}</span></div>
            <p className="mt-1 text-sm text-ledger-500">{request.requested_hours} hours requested · {locationNames.get(request.location_id ?? "") ?? "No branch"}</p><p className="mt-2 text-sm">{request.reason}</p>
            {request.status === "pending" && <form action={manageAttendance} className="mt-3 flex flex-wrap items-end gap-2">
              <input type="hidden" name="intent" value="review_overtime" /><input type="hidden" name="requestId" value={request.id} />
              <Field label="Approved hours"><input name="approvedHours" type="number" min="0" max={request.requested_hours} step="0.25" required className={fieldClass} defaultValue={request.requested_hours} /></Field>
              <input name="decisionNote" className={`${fieldClass} min-w-40 flex-1`} placeholder="Decision note (optional)" />
              <button name="decision" value="approved" className={buttonClass}>Approve</button>
              <button name="decision" value="rejected" className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700">Reject</button>
            </form>}
          </article>)}
        </div>}
      </section>
    </div>}

    {pageKey === "settings" && <form action={manageAttendance} className={`${cardClass} grid gap-5`}>
      <h2 className="text-lg font-semibold">Work rules and notifications</h2><input type="hidden" name="intent" value="save_settings" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Field label="Standard start time"><input type="time" name="workStartTime" required className={fieldClass} defaultValue={attendanceSettings?.work_start_time ?? "09:00"} /></Field>
        <Field label="Standard end time"><input type="time" name="workEndTime" required className={fieldClass} defaultValue={attendanceSettings?.work_end_time ?? "17:00"} /></Field>
        <Field label="Grace period (minutes)"><input type="number" name="gracePeriodMinutes" min="0" max="240" required className={fieldClass} defaultValue={attendanceSettings?.grace_period_minutes ?? 15} /></Field>
        <Field label="Late threshold (minutes)"><input type="number" name="lateThresholdMinutes" min="0" max="480" required className={fieldClass} defaultValue={attendanceSettings?.late_threshold_minutes ?? 15} /></Field>
        <Field label="Standard daily hours"><input type="number" name="standardDailyHours" min="1" max="24" step="0.25" required className={fieldClass} defaultValue={attendanceSettings?.standard_daily_hours ?? 8} /></Field>
        <Field label="Overtime threshold (minutes)"><input type="number" name="overtimeThresholdMinutes" min="0" max="720" required className={fieldClass} defaultValue={attendanceSettings?.overtime_threshold_minutes ?? 0} /></Field>
        <Field label="Overtime rate multiplier"><input type="number" name="overtimeRateMultiplier" min="1" max="10" step="0.05" required className={fieldClass} defaultValue={attendanceSettings?.overtime_rate_multiplier ?? 1.5} /></Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="geofencingEnabled" defaultChecked={attendanceSettings?.geofencing_enabled ?? false} />Enable geofencing</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="gpsVerificationRequired" defaultChecked={attendanceSettings?.gps_verification_required ?? false} />Require GPS verification</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="notifyLateArrival" defaultChecked={attendanceSettings?.notify_late_arrival ?? true} />Notify managers of late arrivals</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="notifyAbsence" defaultChecked={attendanceSettings?.notify_absence ?? true} />Notify managers of absences</label>
      </div>
      <div><button className={buttonClass}>Save attendance settings</button></div>
    </form>}
  </main>;
}
