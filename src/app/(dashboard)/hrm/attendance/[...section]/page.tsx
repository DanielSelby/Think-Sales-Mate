import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canAccessLocation } from "@/lib/organizations/location-access";
import { manageAttendance } from "../management-actions";
import { ManagementReportExport } from "@/components/hrm/attendance/management-report-export";
import { AttendanceLocationMap } from "@/components/hrm/attendance/attendance-location-map";

const DAY_OPTIONS = [
  ["1", "Mon"], ["2", "Tue"], ["3", "Wed"], ["4", "Thu"], ["5", "Fri"], ["6", "Sat"], ["0", "Sun"],
] as const;

const PAGE_META: Record<string, { title: string; description: string }> = {
  shifts: { title: "Shift Management & Scheduling", description: "Manage shifts, employee assignments, and weekly coverage." },
  locations: { title: "Locations & Geofencing", description: "Configure branch coordinates and attendance verification radius." },
  corrections: { title: "Attendance Corrections & Approvals", description: "Review and approve attendance correction requests." },
  reports: { title: "Attendance Reports & Analytics", description: "Review attendance patterns, hours worked, and absences." },
  breaks: { title: "Break Management", description: "Set break policies and track employee break sessions." },
  calendar: { title: "Employee Attendance Calendar", description: "View attendance status and work sessions by date." },
  overtime: { title: "Overtime Management", description: "Review requested overtime and update approved attendance hours." },
  settings: { title: "Attendance Settings & Policies", description: "Configure attendance rules, policies, and notifications." },
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
  searchParams: Promise<{ start?: string; end?: string; month?: string; date?: string; employee?: string; branch?: string; department?: string }>;
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

  const { start, end, month, date, employee, branch, department } = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const selectedMonth = month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : today.slice(0, 7);
  const [calendarYear, calendarMonthNumber] = selectedMonth.split("-").map(Number);
  const firstCalendarDate = `${selectedMonth}-01`;
  const lastCalendarDate = new Date(Date.UTC(calendarYear, calendarMonthNumber, 0)).toISOString().slice(0, 10);
  const selectedDate = date && date >= firstCalendarDate && date <= lastCalendarDate
    ? date
    : today >= firstCalendarDate && today <= lastCalendarDate ? today : firstCalendarDate;

  const [shiftResult, assignmentResult, rotationResult, correctionResult, policyResult, breakResult, overtimeResult, settingsResult] = await Promise.all([
    pageKey === "shifts" || pageKey === "calendar"
      ? supabase.from("attendance_shifts").select("*").eq("org_id", context.orgId).order("name").limit(200)
      : Promise.resolve(null),
    pageKey === "shifts" || pageKey === "calendar"
      ? supabase.from("attendance_shift_assignments").select("*").eq("org_id", context.orgId).order("assignment_date", { ascending: false }).limit(200)
      : Promise.resolve(null),
    pageKey === "shifts"
      ? supabase.from("attendance_shift_rotations").select("*").eq("org_id", context.orgId).order("created_at", { ascending: false }).limit(100)
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
    rotationResult?.error,
    correctionResult?.error,
    policyResult?.error,
    breakResult?.error,
    overtimeResult?.error,
    settingsResult?.error,
  ];
  const failedResult = resultErrors.find((error) => error);
  if (failedResult) throw new Error(`Could not load attendance management data: ${failedResult.message}`);

  const firstWeekday = (new Date(Date.UTC(calendarYear, calendarMonthNumber - 1, 1)).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(calendarYear, calendarMonthNumber, 0)).getUTCDate();
  const calendarDays: Array<number | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  const monthLabel = new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${firstCalendarDate}T00:00:00Z`));
  const defaultStartDate = new Date();
  defaultStartDate.setDate(defaultStartDate.getDate() - 29);
  const defaultStart = defaultStartDate.toISOString().slice(0, 10);
  const startDate = start && /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : defaultStart;
  const endDate = end && /^\d{4}-\d{2}-\d{2}$/.test(end) ? end : today;
  const recordResult = pageKey === "reports" || pageKey === "overtime" || pageKey === "calendar"
    ? await supabase.from("attendance_records").select("*").eq("org_id", context.orgId)
      .gte("work_date", pageKey === "calendar" ? firstCalendarDate : startDate)
      .lte("work_date", pageKey === "calendar" ? lastCalendarDate : endDate)
      .order("work_date", { ascending: false }).limit(1000)
    : null;
  if (recordResult?.error) throw new Error(`Could not load attendance records: ${recordResult.error.message}`);
  const records = (recordResult?.data ?? []).filter((record) =>
    !context.isBranchScoped || Boolean(record.location_id && context.allowedLocationIds.includes(record.location_id))
  );

  const shifts = (shiftResult?.data ?? []).filter((shift) => canAccessLocation(context, shift.location_id));
  const assignments = (assignmentResult?.data ?? []).filter((assignment) => canAccessLocation(context, assignment.location_id));
  const rotations = (rotationResult?.data ?? []).filter((rotation) => canAccessLocation(context, rotation.location_id));
  const corrections = (correctionResult?.data ?? []).filter((request) => canAccessLocation(context, request.location_id));
  const breakSessions = (breakResult?.data ?? []).filter((session) => canAccessLocation(context, session.location_id));
  const overtimeRequests = (overtimeResult?.data ?? []).filter((request) => canAccessLocation(context, request.location_id));
  const breakPolicies = policyResult?.data ?? [];
  const attendanceSettings = settingsResult?.data ?? null;
  const calendarRecords = records.filter((record) => !employee || record.employee_id === employee);
  const selectedDateRecords = calendarRecords.filter((record) => record.work_date === selectedDate);
  const selectedDateAssignments = assignments.filter((assignment) =>
    assignment.assignment_date === selectedDate && (!employee || assignment.employee_id === employee)
  );
  const reportRecords = records.filter((record) =>
    (!branch || record.location_id === branch)
    && (!department || employees.find((person) => person.id === record.employee_id)?.department === department)
  );
  const reportDepartments = [...new Set(employees.map((person) => person.department).filter((value): value is string => Boolean(value)))].sort();
  const reportDates = [...new Set(reportRecords.map((record) => record.work_date))].sort().slice(-7);
  const reportTrend = reportDates.map((dateValue) => ({
    date: dateValue,
    count: reportRecords.filter((record) => record.work_date === dateValue).length,
    present: reportRecords.filter((record) => record.work_date === dateValue && record.status !== "absent" && record.status !== "on_leave").length,
  }));
  const maxTrendCount = Math.max(1, ...reportTrend.map((point) => point.count));
  const branchSummary = locations.map((location) => ({
    name: location.name,
    count: reportRecords.filter((record) => record.location_id === location.id).length,
  })).filter((item) => item.count > 0);
  const maxBranchCount = Math.max(1, ...branchSummary.map((item) => item.count));
  const geocodedLocations = locations.filter(
    (location): location is (typeof locations)[number] & { latitude: number; longitude: number } =>
      location.latitude !== null && location.longitude !== null
  );
  const mapLocations = geocodedLocations.map((location) => ({
    id: location.id,
    name: location.name,
    latitude: location.latitude,
    longitude: location.longitude,
    geofenceRadiusMeters: location.geofence_radius_meters,
  }));
  const todayBreakSessions = breakSessions.filter((session) => session.started_at.slice(0, 10) === today);
  const completedBreakSessions = breakSessions.filter(
    (session): session is (typeof breakSessions)[number] & { ended_at: string } => session.ended_at !== null
  );
  const averageBreakMinutes = completedBreakSessions.length
    ? Math.round(completedBreakSessions.reduce((total, session) =>
      total + (new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 60000, 0
    ) / completedBreakSessions.length)
    : 0;
  const complianceSessions = completedBreakSessions.filter((session) => session.policy_id);
  const compliantBreakCount = complianceSessions.filter((session) => {
    const policy = breakPolicies.find((item) => item.id === session.policy_id);
    return policy && new Date(session.ended_at).getTime() - new Date(session.started_at).getTime() <= policy.duration_minutes * 60000;
  }).length;
  const breakCompliance = complianceSessions.length ? Math.round(compliantBreakCount / complianceSessions.length * 100) : 0;
  const breakTrend = Array.from({ length: 7 }, (_, index) => {
    const trendDate = new Date();
    trendDate.setUTCDate(trendDate.getUTCDate() - (6 - index));
    const dateValue = trendDate.toISOString().slice(0, 10);
    return {
      date: dateValue,
      count: breakSessions.filter((session) => session.started_at.slice(0, 10) === dateValue).length,
      overPolicy: breakSessions.filter((session) => {
        if (session.started_at.slice(0, 10) !== dateValue || !session.ended_at || !session.policy_id) return false;
        const policy = breakPolicies.find((item) => item.id === session.policy_id);
        return Boolean(policy && new Date(session.ended_at).getTime() - new Date(session.started_at).getTime() > policy.duration_minutes * 60000);
      }).length,
    };
  });
  const maxBreakCount = Math.max(1, ...breakTrend.map((day) => day.count));
  const overtimeDates = [...new Set(records.map((record) => record.work_date))].sort().slice(-7);
  const overtimeTrend = overtimeDates.map((dateValue) => ({
    date: dateValue,
    hours: records.filter((record) => record.work_date === dateValue)
      .reduce((sum, record) => sum + Number(record.overtime_hours ?? 0), 0),
  }));
  const maxOvertimeHours = Math.max(1, ...overtimeTrend.map((day) => day.hours));
  const overtimeByDepartment = reportDepartments.map((name) => ({
    name,
    hours: records.filter((record) => employees.find((person) => person.id === record.employee_id)?.department === name)
      .reduce((sum, record) => sum + Number(record.overtime_hours ?? 0), 0),
  })).filter((item) => item.hours > 0);
  const maxDepartmentOvertime = Math.max(1, ...overtimeByDepartment.map((item) => item.hours));
  const reviewedCorrections = corrections.filter(
    (request): request is (typeof corrections)[number] & { reviewed_at: string } => request.reviewed_at !== null
  );
  const averageCorrectionReviewHours = reviewedCorrections.length
    ? (reviewedCorrections.reduce((total, request) =>
      total + (new Date(request.reviewed_at).getTime() - new Date(request.created_at).getTime()) / 3600000, 0
    ) / reviewedCorrections.length).toFixed(1)
    : "0.0";

  return <main>
    <SectionHeader title={page.title} description={page.description} />

    {pageKey === "shifts" && <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Active shifts", shifts.filter((shift) => shift.status === "active").length],
          ["Employees", employees.length],
          ["Assigned today", new Set(assignments.filter((assignment) => assignment.assignment_date === today).map((assignment) => assignment.employee_id)).size],
          ["Open shifts", Math.max(0, shifts.filter((shift) => shift.status === "active").length - new Set(assignments.filter((assignment) => assignment.assignment_date === today).map((assignment) => assignment.shift_id)).size)],
        ].map(([label, value]) => <article key={label} className={cardClass}><p className="text-sm text-ledger-500">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></article>)}
      </section>
      <div className="grid gap-5 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
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
              <fieldset className="grid gap-2 md:col-span-2"><legend className="text-sm font-medium">Working days</legend>
                <div className="flex flex-wrap gap-3">{DAY_OPTIONS.map(([value, label]) => <label key={value} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" name="workingDay" value={value} defaultChecked={shift.working_days.includes(Number(value))} />{label}
                </label>)}</div>
              </fieldset>
              <button className={`${buttonClass} md:col-span-2`}>Save changes</button>
            </form>
            <form action={manageAttendance} className="mt-2 text-right">
              <input type="hidden" name="intent" value="delete_shift" /><input type="hidden" name="shiftId" value={shift.id} />
              <button className="text-sm font-medium text-red-600 hover:underline">Delete shift</button>
            </form>
          </div>)}
        </div>}
      </section>
      </div>
    </div>}

    {pageKey === "shifts" && <section className={`${cardClass} mt-5`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-lg font-semibold">Employee shift assignments</h2>
          <p className="mt-1 text-sm text-ledger-500">Schedule employees to active shifts by date and branch.</p></div>
      </div>
      <form action={manageAttendance} className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <input type="hidden" name="intent" value="assign_shift" />
        <Field label="Employee"><EmployeeOptions employees={employees} /></Field>
        <Field label="Shift"><ShiftOptions shifts={shifts.filter((shift) => shift.status === "active")} /></Field>
        <Field label="Work date"><input name="assignmentDate" type="date" required className={fieldClass} defaultValue={today} /></Field>
        <Field label="Branch"><LocationOptions locations={locations} /></Field>
        <button className={`${buttonClass} self-end`}>Assign employee</button>
      </form>
      {!assignments.length ? <EmptyState>No shift assignments found.</EmptyState> : <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead className="text-xs uppercase text-ledger-500"><tr><th className="py-2">Date</th><th>Employee</th><th>Shift</th><th>Branch</th></tr></thead>
          <tbody>{assignments.map((assignment) => <tr key={assignment.id} className="border-t border-ledger-100 dark:border-ledger-700">
            <td className="py-3">{assignment.assignment_date}</td>
            <td>{employeeNames.get(assignment.employee_id) ?? "Employee"}</td>
            <td>{shifts.find((shift) => shift.id === assignment.shift_id)?.name ?? "Shift"}</td>
            <td>{locationNames.get(assignment.location_id ?? "") ?? "—"}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>}

    {pageKey === "shifts" && <section className={`${cardClass} mt-5`}>
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Automatic weekly rotation</h2>
        <p className="mt-1 text-sm text-ledger-500">The selected employees move together through the shifts in the order you set. This creates assignments for the next 12 weeks; existing assignments are preserved.</p>
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
        <form action={manageAttendance} className="grid content-start gap-4">
          <input type="hidden" name="intent" value="create_rotation" />
          <Field label="Rotation name"><input name="rotationName" required maxLength={120} className={fieldClass} placeholder="Team A rotation" /></Field>
          <Field label="First week starts"><input name="rotationStartDate" type="date" required min={today} defaultValue={today} className={fieldClass} /></Field>
          <fieldset className="grid gap-3">
            <legend className="mb-1 text-sm font-medium">Shifts, in rotation order</legend>
            {Array.from({ length: 7 }, (_, index) => <Field key={index} label={`Shift ${index + 1}${index < 2 ? " (required)" : " (optional)"}`}>
              <select name={`rotationShift${index + 1}`} required={index < 2} defaultValue="" className={fieldClass}>
                <option value="">{index < 2 ? "Select a shift" : "No additional shift"}</option>
                {shifts.filter((shift) => shift.status === "active").map((shift) => <option key={shift.id} value={shift.id}>{shift.name}</option>)}
              </select>
            </Field>)}
          </fieldset>
          <Field label="Employees (select one or more)">
            <select name="rotationEmployeeId" required multiple size={6} className={fieldClass}>
              {employees.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}
            </select>
          </Field>
          <button className={buttonClass}>Generate 12-week rotation</button>
        </form>
        <div>
          <h3 className="mb-3 font-semibold">Saved rotations</h3>
          {!rotations.length ? <EmptyState>No rotations have been created.</EmptyState> : <div className="space-y-3">
            {rotations.map((rotation) => <article key={rotation.id} className="rounded-lg border border-ledger-200 p-4 text-sm dark:border-ledger-700">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <strong>{rotation.name}</strong>
                <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{rotation.weeks} weeks</span>
              </div>
              <p className="mt-1 text-xs text-ledger-500">Starts {rotation.start_date} · {rotation.employee_ids.length} employees</p>
              <p className="mt-2 text-xs text-ledger-600 dark:text-ledger-300">{rotation.shift_ids.map((shiftId) => shifts.find((shift) => shift.id === shiftId)?.name ?? "Shift").join(" → ")}</p>
            </article>)}
          </div>}
        </div>
      </div>
    </section>}

    {pageKey === "locations" && <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Accessible locations", locations.length],
          ["Coordinates set", geocodedLocations.length],
          ["GPS verification", locations.filter((location) => location.gps_verification_required).length],
          ["Geofences configured", locations.filter((location) => location.geofence_radius_meters > 0).length],
        ].map(([label, value]) => <article key={label} className={cardClass}>
          <p className="text-sm text-ledger-500">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p>
        </article>)}
      </section>
      <div className="grid gap-5 xl:grid-cols-[minmax(240px,0.65fr)_minmax(0,1.35fr)]">
        <section className={cardClass}>
          <h2 className="mb-3 font-semibold">Locations</h2>
          {!locations.length ? <EmptyState>No accessible active branches are available.</EmptyState> : <ul className="space-y-1">
            {locations.map((location) => <li key={location.id}>
              <a href={`#location-${location.id}`} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm hover:bg-ledger-50 dark:hover:bg-ledger-800">
                <span className="truncate">{location.name}</span><span className={`h-2 w-2 shrink-0 rounded-full ${location.latitude !== null && location.longitude !== null ? "bg-emerald-500" : "bg-amber-500"}`} />
              </a>
            </li>)}
          </ul>}
        </section>
        <section className={`${cardClass} overflow-hidden`}>
          <div className="mb-3 flex items-center justify-between gap-2"><h2 className="font-semibold">Location map</h2><span className="text-xs text-emerald-700">● Geofence area</span></div>
          {mapLocations.length
            ? <AttendanceLocationMap locations={mapLocations} />
            : <p className="grid min-h-64 place-items-center text-center text-sm text-ledger-500">Add coordinates to a location to show it on the map.</p>}
        </section>
      </div>
      <section className={cardClass}>
        <div className="mb-4"><h2 className="text-lg font-semibold">Geofence settings</h2><p className="text-sm text-ledger-500">Manage authorized attendance locations and GPS verification.</p></div>
        {!locations.length ? <EmptyState>No accessible active branches are available.</EmptyState> : <div className="grid gap-4 lg:grid-cols-2">
          {locations.map((location) => <form id={`location-${location.id}`} key={location.id} action={manageAttendance} className="grid scroll-mt-6 gap-3 rounded-lg border border-ledger-200 p-4 dark:border-ledger-700">
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
        <p className="mt-4 text-xs text-ledger-500">The street map is provided by OpenStreetMap. Loading map tiles sends standard map tile requests from your browser to OpenStreetMap. Geofence settings are stored here; they do not yet block clock-ins outside the radius.</p>
      </section>
    </div>}

    {pageKey === "corrections" && <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Pending requests", corrections.filter((request) => request.status === "pending").length, "text-amber-700"],
          ["Approved", corrections.filter((request) => request.status === "approved").length, "text-emerald-700"],
          ["Rejected", corrections.filter((request) => request.status === "rejected").length, "text-red-700"],
          ["Average review", `${averageCorrectionReviewHours} hrs`, "text-blue-700"],
        ].map(([label, value, color]) => <article key={label} className={cardClass}><p className="text-sm text-ledger-500">{label}</p><p className={`mt-2 text-2xl font-bold ${color}`}>{value}</p></article>)}
      </section>
      <div className="grid gap-5 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
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
            <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
              <div className="rounded-lg bg-ledger-50 p-2 dark:bg-ledger-800"><dt className="text-ledger-500">Original times</dt>
                <dd className="mt-1 font-medium">In: {request.original_check_in ? new Date(request.original_check_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"} · Out: {request.original_check_out ? new Date(request.original_check_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</dd></div>
              <div className="rounded-lg bg-ledger-50 p-2 dark:bg-ledger-800"><dt className="text-ledger-500">Requested times</dt>
                <dd className="mt-1 font-medium">In: {request.requested_check_in ? new Date(request.requested_check_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"} · Out: {request.requested_check_out ? new Date(request.requested_check_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</dd></div>
            </dl>
            {request.decision_note && <p className="mt-2 text-xs text-ledger-500">Decision: {request.decision_note}</p>}
            {request.status === "pending" && <form action={manageAttendance} className="mt-3 flex flex-wrap items-end gap-2">
              <input type="hidden" name="intent" value="review_correction" /><input type="hidden" name="requestId" value={request.id} />
              <input name="decisionNote" className={`${fieldClass} min-w-40 flex-1`} placeholder="Decision note (optional)" />
              <button name="decision" value="approved" className={buttonClass}>Approve</button>
              <button name="decision" value="rejected" className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700">Reject</button>
            </form>}
          </article>)}
        </div>}
      </section>
      </div>
    </div>}

    {pageKey === "reports" && <div className="space-y-5">
      <form className={`${cardClass} flex flex-wrap items-end gap-3`}>
        <Field label="From"><input type="date" name="start" className={fieldClass} defaultValue={startDate} /></Field>
        <Field label="To"><input type="date" name="end" className={fieldClass} defaultValue={endDate} /></Field>
        <Field label="Branch"><select name="branch" className={fieldClass} defaultValue={branch ?? ""}>
          <option value="">All branches</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
        </select></Field>
        <Field label="Department"><select name="department" className={fieldClass} defaultValue={department ?? ""}>
          <option value="">All departments</option>{reportDepartments.map((name) => <option key={name} value={name}>{name}</option>)}
        </select></Field>
        <button className={buttonClass}>Apply filters</button>
        <ManagementReportExport rows={reportRecords.map((record) => ({
          date: record.work_date,
          employee: employeeNames.get(record.employee_id) ?? "Employee",
          branch: locationNames.get(record.location_id ?? "") ?? "—",
          status: record.status.replace("_", " "),
          hours: Number(record.total_hours ?? 0).toFixed(2),
          overtime: Number(record.overtime_hours ?? 0).toFixed(2),
        }))} />
      </form>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Attendance rate", `${reportRecords.length ? Math.round((reportRecords.filter((record) => record.status === "present" || record.status === "late").length / reportRecords.length) * 1000) / 10 : 0}%`, "text-emerald-700"],
          ["Late arrivals", reportRecords.filter((record) => record.status === "late").length, "text-blue-700"],
          ["Absences", reportRecords.filter((record) => record.status === "absent").length, "text-violet-700"],
          ["Overtime hours", `${reportRecords.reduce((sum, record) => sum + Number(record.overtime_hours ?? 0), 0).toFixed(1)}h`, "text-amber-700"],
        ].map(([label, value, color]) => <article key={label} className={cardClass}>
          <p className="text-sm text-ledger-500">{label}</p><p className={`mt-2 text-2xl font-bold ${color}`}>{value}</p>
        </article>)}
      </section>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className={cardClass}>
          <div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold">Attendance trend</h2><p className="text-xs text-ledger-500">Daily attendance in the selected range</p></div>
            <span className="text-xs text-emerald-700">● Attendance</span></div>
          {!reportTrend.length ? <EmptyState>No attendance data for this range.</EmptyState> : <div className="flex h-44 items-end gap-2 border-b border-ledger-200 px-2 dark:border-ledger-700">
            {reportTrend.map((point) => <div key={point.date} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
              <div className="flex w-full max-w-10 flex-col justify-end rounded-t bg-emerald-500/20" style={{ height: `${Math.max(8, point.count / maxTrendCount * 100)}%` }}>
                <div className="w-full rounded-t bg-emerald-600" style={{ height: `${point.count ? point.present / point.count * 100 : 0}%` }} />
              </div><span className="text-[10px] text-ledger-500">{new Date(`${point.date}T00:00:00Z`).toLocaleDateString("en", { weekday: "short", timeZone: "UTC" })}</span>
            </div>)}
          </div>}
        </section>
        <section className={cardClass}>
          <h2 className="font-semibold">Attendance by branch</h2>
          {!branchSummary.length ? <EmptyState>No branch attendance data for this range.</EmptyState> : <div className="mt-4 space-y-3">
            {branchSummary.map((item) => <div key={item.name} className="grid grid-cols-[minmax(90px,0.7fr)_minmax(0,2fr)_36px] items-center gap-3 text-sm">
              <span className="truncate">{item.name}</span><div className="h-3 overflow-hidden rounded-full bg-ledger-100 dark:bg-ledger-800"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${item.count / maxBranchCount * 100}%` }} /></div>
              <span className="text-right font-semibold">{item.count}</span>
            </div>)}
          </div>}
        </section>
      </div>
      <section className={cardClass}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Attendance records</h2><p className="text-xs text-ledger-500">{reportRecords.length} records</p></div>
        {!reportRecords.length ? <EmptyState>No attendance records in this range.</EmptyState> : <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="text-xs uppercase text-ledger-500"><tr><th className="py-2">Date</th><th>Employee</th><th>Branch</th><th>Status</th><th>Hours</th><th>Overtime</th></tr></thead>
            <tbody>{reportRecords.map((record) => <tr key={record.id} className="border-t border-ledger-100 dark:border-ledger-700">
              <td className="py-3">{record.work_date}</td><td>{employeeNames.get(record.employee_id) ?? "Employee"}</td>
              <td>{locationNames.get(record.location_id ?? "") ?? "—"}</td><td className="capitalize">{record.status.replace("_", " ")}</td>
              <td>{Number(record.total_hours ?? 0).toFixed(2)}</td><td>{Number(record.overtime_hours ?? 0).toFixed(2)}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      </section>
    </div>}

    {pageKey === "breaks" && <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Breaks today", todayBreakSessions.length, "text-emerald-700"],
          ["Currently on break", breakSessions.filter((session) => !session.ended_at).length, "text-blue-700"],
          ["Average break", `${averageBreakMinutes} min`, "text-violet-700"],
          ["Compliance", `${breakCompliance}%`, "text-amber-700"],
        ].map(([label, value, color]) => <article key={label} className={cardClass}><p className="text-sm text-ledger-500">{label}</p><p className={`mt-2 text-2xl font-bold ${color}`}>{value}</p></article>)}
      </section>
      <div className="grid gap-5 xl:grid-cols-2">
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
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className={cardClass}>
          <div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold">Break trend</h2><p className="text-xs text-ledger-500">Recent break sessions</p></div><span className="text-xs text-emerald-700">● Breaks</span></div>
          <div className="flex h-36 items-end gap-2 border-b border-ledger-200 px-2 dark:border-ledger-700">
            {breakTrend.map((day) => <div key={day.date} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
              <div className="flex w-full max-w-10 flex-col justify-end rounded-t bg-emerald-500/20" style={{ height: `${Math.max(8, day.count / maxBreakCount * 100)}%` }}>
                {day.count > 0 && <div className="w-full rounded-t bg-emerald-600" style={{ height: `${(day.count - day.overPolicy) / day.count * 100}%` }} />}
              </div><span className="text-[10px] text-ledger-500">{new Date(`${day.date}T00:00:00Z`).toLocaleDateString("en", { weekday: "short", timeZone: "UTC" })}</span>
            </div>)}
          </div>
        </section>
        <section className={`${cardClass} grid content-center gap-4`}>
          <div><h2 className="font-semibold">Break compliance</h2><p className="text-xs text-ledger-500">Closed sessions with a policy, in the recent activity window</p></div>
          <div className="flex items-center gap-4">
            <div className="grid h-24 w-24 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(#059669 ${breakCompliance}%, #e2e8f0 ${breakCompliance}% 100%)` }}>
              <span className="grid h-16 w-16 place-items-center rounded-full bg-white text-lg font-bold dark:bg-ledger-900">{breakCompliance}%</span>
            </div>
            <p className="text-sm text-ledger-500">{compliantBreakCount} of {complianceSessions.length} policy-linked breaks stayed within their allowed duration.</p>
          </div>
        </section>
      </div>
    </div>}

    {pageKey === "calendar" && <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Present", calendarRecords.filter((record) => record.status === "present").length, "text-emerald-700"],
          ["Late", calendarRecords.filter((record) => record.status === "late").length, "text-amber-700"],
          ["Absent", calendarRecords.filter((record) => record.status === "absent").length, "text-red-700"],
          ["On leave", calendarRecords.filter((record) => record.status === "on_leave").length, "text-violet-700"],
        ].map(([label, value, color]) => <article key={label} className={cardClass}>
          <p className="text-sm text-ledger-500">{label}</p>
          <p className={`mt-2 text-2xl font-bold ${color}`}>{value}</p>
        </article>)}
      </section>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.8fr)]">
        <section className={cardClass}>
          <form method="get" className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <Field label="Month"><input type="month" name="month" className={fieldClass} defaultValue={selectedMonth} /></Field>
            <Field label="Employee"><select name="employee" className={fieldClass} defaultValue={employee ?? ""}>
              <option value="">All employees</option>
              {employees.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}
            </select></Field>
            <button className={buttonClass}>View calendar</button>
            {employee && <input type="hidden" name="date" value={selectedDate} />}
          </form>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{monthLabel}</h2>
            <div className="flex flex-wrap gap-3 text-xs text-ledger-500">
              {[
                ["Present", "bg-emerald-500"], ["Late", "bg-amber-500"],
                ["Absent", "bg-red-500"], ["On leave", "bg-violet-500"],
              ].map(([label, color]) => <span key={label} className="inline-flex items-center gap-1.5">
                <i className={`h-2 w-2 rounded-full ${color}`} />{label}
              </span>)}
            </div>
          </div>
          <div className="grid grid-cols-7 border-l border-t border-ledger-200 dark:border-ledger-700">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((weekday) => <div key={weekday} className="border-b border-r border-ledger-200 bg-ledger-50 p-2 text-center text-xs font-semibold dark:border-ledger-700 dark:bg-ledger-800">{weekday}</div>)}
            {calendarDays.map((day, index) => {
              const dateValue = day ? `${selectedMonth}-${String(day).padStart(2, "0")}` : "";
              const dayRecords = calendarRecords.filter((record) => record.work_date === dateValue);
              const dayAssignments = assignments.filter((assignment) =>
                assignment.assignment_date === dateValue && (!employee || assignment.employee_id === employee)
              );
              const statuses = [...new Set(dayRecords.map((record) => record.status))];
              const href = `/hrm/attendance/calendar?month=${selectedMonth}&date=${dateValue}${employee ? `&employee=${employee}` : ""}`;
              return <div key={`${dateValue || "blank"}-${index}`} className={`min-h-20 border-b border-r border-ledger-200 p-1.5 sm:min-h-24 sm:p-2 dark:border-ledger-700 ${dateValue === selectedDate ? "bg-[var(--theme-primary)]/5" : ""}`}>
                {day && <Link href={href} aria-label={`View attendance on ${dateValue}`} className="block h-full">
                  <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${dateValue === selectedDate ? "bg-[var(--theme-primary)] text-white" : ""}`}>{day}</span>
                  {statuses.length > 0 && <div className="mt-1 flex flex-wrap gap-1" aria-label={`${dayRecords.length} attendance records`}>
                    {statuses.map((status) => <i key={status} className={`h-2 w-2 rounded-full ${status === "present" ? "bg-emerald-500" : status === "late" ? "bg-amber-500" : status === "absent" ? "bg-red-500" : "bg-violet-500"}`} />)}
                  </div>}
                  {dayRecords.length > 0 && <p className="mt-1 text-[10px] text-ledger-500">{dayRecords.length} record{dayRecords.length === 1 ? "" : "s"}</p>}
                  {dayAssignments.length > 0 && <p className="mt-1 truncate text-[10px] font-medium text-[var(--theme-primary)]">{dayAssignments.length} shift{dayAssignments.length === 1 ? "" : "s"}</p>}
                </Link>}
              </div>;
            })}
          </div>
        </section>
        <section className={`${cardClass} grid content-start gap-4`}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ledger-500">Selected date</p>
            <h2 className="mt-1 text-lg font-semibold">{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${selectedDate}T00:00:00Z`))}</h2>
          </div>
          {!selectedDateRecords.length ? <EmptyState>No attendance records for this date.</EmptyState> : selectedDateRecords.map((record) => {
            const statusColor = record.status === "present" ? "text-emerald-700" : record.status === "late" ? "text-amber-700" : record.status === "absent" ? "text-red-700" : "text-violet-700";
            return <article key={record.id} className="rounded-lg border border-ledger-200 p-3 dark:border-ledger-700">
              <div className="flex items-start justify-between gap-2">
                <div><h3 className="font-semibold">{employeeNames.get(record.employee_id) ?? "Employee"}</h3>
                  <p className="text-xs text-ledger-500">{locationNames.get(record.location_id ?? "") ?? "—"}</p></div>
                <span className={`text-xs font-semibold capitalize ${statusColor}`}>{record.status.replace("_", " ")}</span>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div><dt className="text-ledger-500">Check in</dt><dd className="mt-1 font-medium">{record.check_in ? new Date(record.check_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</dd></div>
                <div><dt className="text-ledger-500">Check out</dt><dd className="mt-1 font-medium">{record.check_out ? new Date(record.check_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</dd></div>
                <div><dt className="text-ledger-500">Total hours</dt><dd className="mt-1 font-medium">{Number(record.total_hours ?? 0).toFixed(2)}h</dd></div>
              </dl>
            </article>;
          })}
          <div className="border-t border-ledger-200 pt-3 dark:border-ledger-700">
            <h3 className="mb-2 text-sm font-semibold">Scheduled shifts</h3>
            {!selectedDateAssignments.length ? <p className="text-xs text-ledger-500">No shift assignments for this date.</p> : selectedDateAssignments.map((assignment) => <p key={assignment.id} className="mb-1 rounded bg-[var(--theme-primary)]/10 px-2 py-1.5 text-xs">
              {employeeNames.get(assignment.employee_id) ?? "Employee"} · {shifts.find((shift) => shift.id === assignment.shift_id)?.name ?? "Shift"} · {locationNames.get(assignment.location_id ?? "") ?? "No branch"}
            </p>)}
          </div>
          <div className="flex flex-wrap gap-2 border-t border-ledger-200 pt-3 dark:border-ledger-700">
            <Link href="/hrm/attendance" className="rounded-lg border border-ledger-300 px-3 py-2 text-xs font-semibold hover:bg-ledger-50 dark:border-ledger-600 dark:hover:bg-ledger-800">Attendance register</Link>
            <Link href={`/hrm/attendance/corrections?date=${selectedDate}${employee ? `&employee=${employee}` : ""}`} className="rounded-lg border border-ledger-300 px-3 py-2 text-xs font-semibold hover:bg-ledger-50 dark:border-ledger-600 dark:hover:bg-ledger-800">Request correction</Link>
          </div>
        </section>
      </div>
    </div>}

    {pageKey === "overtime" && <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Total overtime", `${records.reduce((sum, record) => sum + Number(record.overtime_hours ?? 0), 0).toFixed(1)}h`],
          ["Employees on overtime", new Set(records.filter((record) => Number(record.overtime_hours ?? 0) > 0).map((record) => record.employee_id)).size],
          ["Pending requests", overtimeRequests.filter((request) => request.status === "pending").length],
          ["Approved requests", overtimeRequests.filter((request) => request.status === "approved").length],
        ].map(([label, value]) => <article key={label} className={cardClass}><p className="text-sm text-ledger-500">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></article>)}
      </section>
      <div className="grid gap-5 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
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
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className={cardClass}>
          <div className="mb-4"><h2 className="font-semibold">Overtime trend</h2><p className="text-xs text-ledger-500">Recorded overtime hours by day</p></div>
          {!overtimeTrend.length ? <EmptyState>No overtime attendance data for this period.</EmptyState> : <div className="flex h-36 items-end gap-2 border-b border-ledger-200 px-2 dark:border-ledger-700">
            {overtimeTrend.map((day) => <div key={day.date} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
              <div className="w-full max-w-10 rounded-t bg-violet-600" style={{ height: `${Math.max(8, day.hours / maxOvertimeHours * 100)}%` }} />
              <span className="text-[10px] text-ledger-500">{new Date(`${day.date}T00:00:00Z`).toLocaleDateString("en", { weekday: "short", timeZone: "UTC" })}</span>
            </div>)}
          </div>}
        </section>
        <section className={cardClass}>
          <h2 className="font-semibold">Overtime by department</h2>
          {!overtimeByDepartment.length ? <EmptyState>No overtime by department for this period.</EmptyState> : <div className="mt-4 space-y-3">
            {overtimeByDepartment.map((item) => <div key={item.name} className="grid grid-cols-[minmax(90px,0.7fr)_minmax(0,2fr)_48px] items-center gap-3 text-sm">
              <span className="truncate">{item.name}</span><div className="h-3 overflow-hidden rounded-full bg-ledger-100 dark:bg-ledger-800"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${item.hours / maxDepartmentOvertime * 100}%` }} /></div>
              <span className="text-right font-semibold">{item.hours.toFixed(1)}h</span>
            </div>)}
          </div>}
        </section>
      </div>
    </div>}

    {pageKey === "settings" && <form action={manageAttendance} className={`${cardClass} grid gap-5`}>
      <div><h2 className="text-lg font-semibold">Attendance policies</h2><p className="mt-1 text-sm text-ledger-500">Configure work hours, attendance thresholds, geofencing, and notifications for this organization.</p></div>
      <input type="hidden" name="intent" value="save_settings" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <h3 className="text-sm font-semibold text-ink-800 sm:col-span-2 xl:col-span-3 dark:text-white">General settings</h3>
        <Field label="Standard start time"><input type="time" name="workStartTime" required className={fieldClass} defaultValue={attendanceSettings?.work_start_time ?? "09:00"} /></Field>
        <Field label="Standard end time"><input type="time" name="workEndTime" required className={fieldClass} defaultValue={attendanceSettings?.work_end_time ?? "17:00"} /></Field>
        <Field label="Grace period (minutes)"><input type="number" name="gracePeriodMinutes" min="0" max="240" required className={fieldClass} defaultValue={attendanceSettings?.grace_period_minutes ?? 15} /></Field>
        <Field label="Late threshold (minutes)"><input type="number" name="lateThresholdMinutes" min="0" max="480" required className={fieldClass} defaultValue={attendanceSettings?.late_threshold_minutes ?? 15} /></Field>
        <h3 className="mt-2 text-sm font-semibold text-ink-800 sm:col-span-2 xl:col-span-3 dark:text-white">Attendance policies</h3>
        <Field label="Standard daily hours"><input type="number" name="standardDailyHours" min="1" max="24" step="0.25" required className={fieldClass} defaultValue={attendanceSettings?.standard_daily_hours ?? 8} /></Field>
        <Field label="Overtime threshold (minutes)"><input type="number" name="overtimeThresholdMinutes" min="0" max="720" required className={fieldClass} defaultValue={attendanceSettings?.overtime_threshold_minutes ?? 0} /></Field>
        <Field label="Overtime rate multiplier"><input type="number" name="overtimeRateMultiplier" min="1" max="10" step="0.05" required className={fieldClass} defaultValue={attendanceSettings?.overtime_rate_multiplier ?? 1.5} /></Field>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <fieldset className="grid gap-3 rounded-lg border border-ledger-200 p-4 dark:border-ledger-700">
          <legend className="px-1 text-sm font-semibold">Geofencing settings</legend>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="geofencingEnabled" defaultChecked={attendanceSettings?.geofencing_enabled ?? false} />Enable geofencing</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="gpsVerificationRequired" defaultChecked={attendanceSettings?.gps_verification_required ?? false} />Require GPS verification</label>
        </fieldset>
        <fieldset className="grid gap-3 rounded-lg border border-ledger-200 p-4 dark:border-ledger-700">
          <legend className="px-1 text-sm font-semibold">Notification settings</legend>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="notifyLateArrival" defaultChecked={attendanceSettings?.notify_late_arrival ?? true} />Notify managers of late arrivals</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="notifyAbsence" defaultChecked={attendanceSettings?.notify_absence ?? true} />Notify managers of absences</label>
        </fieldset>
      </div>
      <div><button className={buttonClass}>Save attendance settings</button></div>
    </form>}
  </main>;
}
