import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarClock, Plus } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import {
  cancelEducationTimetableEntry,
  createEducationTimetableEntry,
  updateEducationTimetableEntry,
} from "../actions";

const WEEKDAYS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 7, label: "Sunday" },
];

type TimetableRow = {
  id: string;
  branch_id: string;
  class_id: string;
  staff_id: string | null;
  academic_year_id: string;
  subject_name: string;
  weekday: number;
  starts_at: string;
  ends_at: string;
  room: string | null;
  status: "active" | "cancelled";
  updated_at: string;
};

export default async function EducationTimetablesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_timetables", "timetables", "schedule", "view")) {
    redirect("/dashboard?accessDenied=think-education.timetables");
  }

  const params = await searchParams;
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const branchIds = campuses.map((campus) => campus.id);
  const requestedBranch = typeof params.branch === "string" ? params.branch : "";
  const selectedBranch = branchIds.includes(requestedBranch) ? requestedBranch : "";
  const filterBranchIds = selectedBranch ? [selectedBranch] : branchIds;
  const requestedYear = typeof params.year === "string" ? params.year : "";
  const requestedWeekday = Number(typeof params.weekday === "string" ? params.weekday : "");
  const selectedWeekday = WEEKDAYS.some((day) => day.value === requestedWeekday) ? requestedWeekday : 0;
  const [canCreate, canEdit, canExport, canViewSubjectCatalog] = await Promise.all([
    canTabPermission("education_timetables", "timetables", "schedule", "create"),
    canTabPermission("education_timetables", "timetables", "schedule", "edit"),
    canTabPermission("education_timetables", "timetables", "schedule", "export"),
    canTabPermission("education_academics", "academics", "calendar", "view"),
  ]);
  const supabase = await createClient();
  let activeSubjects: Array<{ id: string; name: string }> = [];
  if (canViewSubjectCatalog) {
    const { data, error } = await supabase.from("education_subjects")
      .select("id, name")
      .eq("org_id", context.orgId).eq("status", "active")
      .order("name");
    if (error) throw new Error(`Could not load active Think Education subjects: ${error.message}`);
    activeSubjects = data ?? [];
  }
  const [{ data: years, error: yearsError }, classesResult, staffResult, entriesResult, classSubjectsResult] = await Promise.all([
    supabase.from("education_academic_years")
      .select("id, name, status")
      .eq("org_id", context.orgId)
      .order("starts_on", { ascending: false }),
    filterBranchIds.length
      ? supabase.from("education_classes")
        .select("id, branch_id, academic_year_id, name")
        .eq("org_id", context.orgId).in("branch_id", filterBranchIds).eq("status", "active").order("name")
      : Promise.resolve({ data: [], error: null }),
    filterBranchIds.length
      ? supabase.from("education_staff")
        .select("id, branch_id, first_name, last_name, staff_number")
        .eq("org_id", context.orgId).in("branch_id", filterBranchIds).eq("status", "active")
        .order("last_name").order("first_name")
      : Promise.resolve({ data: [], error: null }),
    filterBranchIds.length
      ? supabase.from("education_timetable_entries")
        .select("id, branch_id, class_id, staff_id, academic_year_id, subject_name, weekday, starts_at, ends_at, room, status, updated_at")
        .eq("org_id", context.orgId).in("branch_id", filterBranchIds).eq("status", "active")
        .order("weekday").order("starts_at")
      : Promise.resolve({ data: [] as TimetableRow[], error: null }),
    filterBranchIds.length && canViewSubjectCatalog
      ? supabase.from("education_class_subjects")
        .select("id, class_id, subject_id")
        .eq("org_id", context.orgId).in("branch_id", filterBranchIds).eq("status", "active")
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (yearsError) throw new Error(`Could not load academic years for timetables: ${yearsError.message}`);
  if (classesResult.error) throw new Error(`Could not load classes for timetables: ${classesResult.error.message}`);
  if (staffResult.error) throw new Error(`Could not load staff for timetables: ${staffResult.error.message}`);
  if (entriesResult.error) throw new Error(`Could not load Think Education timetable: ${entriesResult.error.message}`);
  if (classSubjectsResult.error) throw new Error(`Could not load class curriculum for timetables: ${classSubjectsResult.error.message}`);
  const academicYears = years ?? [];
  const availableAcademicYears = academicYears.filter((year) => year.status === "active" || year.status === "planned");
  const classes = classesResult.data ?? [];
  const classSubjects = classSubjectsResult.data ?? [];
  const staff = staffResult.data ?? [];
  const entries: TimetableRow[] = entriesResult.data ?? [];
  const yearIds = academicYears.map((year) => year.id);
  const selectedYear = yearIds.includes(requestedYear) ? requestedYear : "";
  const createBranchId = selectedBranch || campuses[0]?.id || "";
  const createYearId = availableAcademicYears.some((year) => year.id === selectedYear)
    ? selectedYear
    : availableAcademicYears[0]?.id || "";
  const visibleEntries = entries.filter((entry) =>
    (!selectedYear || entry.academic_year_id === selectedYear)
    && (!selectedWeekday || entry.weekday === selectedWeekday)
  );
  const timetableDays = selectedWeekday
    ? WEEKDAYS.filter((day) => day.value === selectedWeekday)
    : WEEKDAYS;
  const entriesByWeekday = new Map(timetableDays.map((day) => [
    day.value,
    visibleEntries.filter((entry) => entry.weekday === day.value),
  ]));
  const classNameById = new Map(classes.map((classroom) => [classroom.id, classroom.name]));
  const yearNameById = new Map(academicYears.map((year) => [year.id, year.name]));
  const staffById = new Map(staff.map((member) => [member.id, `${member.first_name} ${member.last_name}`]));
  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const selectedCampusClasses = classes.filter((classroom) =>
    classroom.branch_id === createBranchId
    && Boolean(createYearId)
    && classroom.academic_year_id === createYearId
  );
  const selectedClassIds = new Set(selectedCampusClasses.map((classroom) => classroom.id));
  const subjectNameById = new Map(activeSubjects.map((subject) => [subject.id, subject.name]));
  const activeClassSubjects = classSubjects.filter((assignment) =>
    selectedClassIds.has(assignment.class_id) && subjectNameById.has(assignment.subject_id)
  );
  const selectedCampusStaff = staff.filter((member) => member.branch_id === createBranchId);
  const csvRows = [
    ["Day", "Time", "Subject", "Class", "Teacher", "Campus", "Room", "Academic year"],
    ...visibleEntries.map((entry) => [
      WEEKDAYS.find((day) => day.value === entry.weekday)?.label ?? String(entry.weekday),
      `${entry.starts_at.slice(0, 5)}–${entry.ends_at.slice(0, 5)}`,
      entry.subject_name,
      classNameById.get(entry.class_id) ?? "Class",
      entry.staff_id ? staffById.get(entry.staff_id) ?? "Staff" : "Unassigned",
      campusNameById.get(entry.branch_id) ?? entry.branch_id,
      entry.room ?? "",
      yearNameById.get(entry.academic_year_id) ?? entry.academic_year_id,
    ]),
  ];
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(csvRows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n"))}`;
  const errorMessage = params.error === "conflict"
    ? "That time overlaps another lesson for the selected class, staff member, or room."
    : params.error === "invalid"
      ? "Check the campus, class, academic year, subject, day, and time."
      : params.error === "subject"
        ? "Select an active subject from the catalog. It may have been deactivated."
        : params.error === "allocation"
          ? "Assign this subject to the selected class in Class curriculum before scheduling it."
      : params.error === "stale"
        ? "This timetable entry changed or is no longer active. Refresh the schedule and try again."
        : params.error === "transition"
          ? "Only active timetable entries can be changed."
          : params.error === "save" ? "The timetable entry could not be saved. Please try again." : null;

  return <main className="mx-auto max-w-[1500px] space-y-6 p-4 md:p-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <Link href={getProductAppPath("think-education", "/dashboard")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">Class Timetables</h1>
        <p className="mt-1 text-sm text-slate-600">View weekly lessons and schedule classes without overlapping their class, teacher, or room.</p>
        <div className="mt-2 flex flex-wrap gap-4 text-sm font-semibold">
          <Link href={getProductAppPath("think-education", "/academics/curriculum")} className="text-blue-700 hover:text-blue-900">Manage class curriculum</Link>
          <Link href={getProductAppPath("think-education", "/subjects")} className="text-slate-600 hover:text-slate-900">Subject catalog</Link>
        </div>
      </div>
      {canCreate && selectedCampusClasses.length > 0 && <a href="#add-lesson" className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">
        <Plus className="h-4 w-4" /> Add lesson
      </a>}
    </header>

    {params.created === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Timetable entry added.</p>}
    {params.updated === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Timetable entry updated.</p>}
    {params.cancelled === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Timetable entry cancelled.</p>}
    {errorMessage && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{errorMessage}</p>}

    <section data-education-metrics className="grid gap-3 sm:grid-cols-3">
      {[
        { label: "Lessons in this view", value: visibleEntries.length, icon: CalendarClock },
        { label: "Campuses in your access", value: campuses.length, icon: CalendarClock },
        { label: "Active classes", value: selectedCampusClasses.length, icon: CalendarClock },
      ].map(({ label, value, icon: Icon }) => <article key={label} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-950">{value.toLocaleString()}</p></div>
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><Icon className="h-5 w-5" /></span>
      </article>)}
    </section>

    <section aria-label="Timetable guidance" className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
      <h2 className="text-sm font-semibold text-slate-900">Weekly lesson overview</h2>
      <p className="mt-1 text-sm text-slate-600">Lessons are grouped by day and shown in start-time order. Filter by campus, academic year, or day to focus the schedule.</p>
    </section>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <form method="get" action={getProductAppPath("think-education", "/timetables")} className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-[1fr_1fr_1fr_auto_auto]">
        <label className="text-sm font-medium text-slate-700">Campus
          <select name="branch" defaultValue={selectedBranch} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">All assigned campuses</option>{campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Academic year
          <select name="year" defaultValue={selectedYear} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">All available years</option>{academicYears.map((year) => <option key={year.id} value={year.id}>{year.name} · {year.status}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Day
          <select name="weekday" defaultValue={selectedWeekday || ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">All days</option>{WEEKDAYS.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
          </select>
        </label>
        <button type="submit" className="self-end rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100">Apply filters</button>
        {canExport && visibleEntries.length > 0 && <a href={csvHref} download={`education-timetable-${new Date().toISOString().slice(0, 10)}.csv`} className="self-end rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Export CSV</a>}
      </form>

      {campuses.length === 0 ? <div className="p-8 text-center">
        <CalendarClock className="mx-auto h-10 w-10 text-slate-300" />
        <h2 className="mt-3 font-semibold text-slate-900">No campus access assigned</h2>
        <p className="mt-1 text-sm text-slate-500">Ask an authorized Think Education administrator to assign your campus scope.</p>
      </div> : visibleEntries.length === 0 ? <div className="p-8 text-center">
        <CalendarClock className="mx-auto h-10 w-10 text-slate-300" />
        <h2 className="mt-3 font-semibold text-slate-900">No lessons scheduled</h2>
        <p className="mt-1 text-sm text-slate-500">Add a lesson to an active class in an available academic year.</p>
      </div> : <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 md:p-4">
        {timetableDays.map((day) => {
          const dayEntries = entriesByWeekday.get(day.value) ?? [];
          return <section key={day.value} aria-label={`${day.label} lessons`} className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <header className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-3">
              <h2 className="font-semibold text-slate-900">{day.label}</h2>
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium tabular-nums text-slate-600 ring-1 ring-slate-200">{dayEntries.length} {dayEntries.length === 1 ? "lesson" : "lessons"}</span>
            </header>
            {dayEntries.length === 0 ? <p className="px-4 py-5 text-sm text-slate-500">No lessons scheduled</p> : <ol className="divide-y divide-slate-100">
              {dayEntries.map((entry) => {
                const entryClasses = classes.filter((classroom) =>
                  classroom.branch_id === entry.branch_id && classroom.academic_year_id === entry.academic_year_id
                );
                const entryStaff = staff.filter((member) => member.branch_id === entry.branch_id);
                return <li key={entry.id} className="border-l-2 border-blue-500 px-4 py-3 transition-colors hover:bg-slate-50/70">
                  <p className="text-xs font-semibold tabular-nums text-blue-800">{entry.starts_at.slice(0, 5)}–{entry.ends_at.slice(0, 5)}</p>
                  <h3 className="mt-1 font-semibold text-slate-900">{entry.subject_name}</h3>
                  <p className="mt-1 text-sm text-slate-600">{classNameById.get(entry.class_id) ?? "Class"} · {entry.staff_id ? staffById.get(entry.staff_id) ?? "Staff" : "Unassigned"}</p>
                  <p className="mt-1 text-xs text-slate-500">{campusNameById.get(entry.branch_id) ?? "Campus"}{entry.room ? ` · ${entry.room}` : ""} · {yearNameById.get(entry.academic_year_id) ?? "—"}</p>
                  {canEdit && <details className="mt-3 border-t border-slate-100 pt-2">
                    <summary className="cursor-pointer text-sm font-semibold text-blue-700">Edit or cancel lesson</summary>
                    <form action={updateEducationTimetableEntry} className="mt-3 grid gap-2 sm:grid-cols-2">
                      <input type="hidden" name="entry_id" value={entry.id} />
                      <input type="hidden" name="expected_updated_at" value={entry.updated_at} />
                      <label className="text-xs font-medium text-slate-600">Class
                        <select required name="class_id" defaultValue={entry.class_id} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm font-normal">
                          {!entryClasses.some((classroom) => classroom.id === entry.class_id) && <option value={entry.class_id}>{classNameById.get(entry.class_id) ?? "Current class (inactive)"}</option>}
                          {entryClasses.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name}</option>)}
                        </select>
                      </label>
                      <label className="text-xs font-medium text-slate-600">Teacher
                        <select name="staff_id" defaultValue={entry.staff_id ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm font-normal">
                          <option value="">Unassigned</option>
                          {entry.staff_id && !entryStaff.some((member) => member.id === entry.staff_id) && <option value={entry.staff_id}>{staffById.get(entry.staff_id) ?? "Current teacher (inactive)"}</option>}
                          {entryStaff.map((member) => <option key={member.id} value={member.id}>{member.first_name} {member.last_name}</option>)}
                        </select>
                      </label>
                      <label className="text-xs font-medium text-slate-600">Day
                        <select required name="weekday" defaultValue={entry.weekday} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm font-normal">
                          {WEEKDAYS.map((weekday) => <option key={weekday.value} value={weekday.value}>{weekday.label}</option>)}
                        </select>
                      </label>
                      <label className="text-xs font-medium text-slate-600">Room
                        <input name="room" maxLength={80} defaultValue={entry.room ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm font-normal" />
                      </label>
                      <label className="text-xs font-medium text-slate-600">Starts
                        <input required type="time" name="starts_at" defaultValue={entry.starts_at.slice(0, 5)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm font-normal" />
                      </label>
                      <label className="text-xs font-medium text-slate-600">Ends
                        <input required type="time" name="ends_at" defaultValue={entry.ends_at.slice(0, 5)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm font-normal" />
                      </label>
                      <div className="sm:col-span-2">
                        <button type="submit" className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800">Save changes</button>
                      </div>
                    </form>
                    <form action={cancelEducationTimetableEntry} className="mt-3 border-t border-slate-100 pt-3">
                      <input type="hidden" name="entry_id" value={entry.id} />
                      <input type="hidden" name="expected_updated_at" value={entry.updated_at} />
                      <button type="submit" className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">Cancel lesson</button>
                      <p className="mt-1 text-xs text-slate-500">The cancelled lesson is retained for audit and no longer blocks its time slot.</p>
                    </form>
                  </details>}
                </li>;
              })}
            </ol>}
          </section>;
        })}
      </div>}
    </section>

    {canCreate && selectedCampusClasses.length > 0 && activeClassSubjects.length === 0 && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      No subjects are assigned to classes in this campus and academic year. Manage them in <Link className="font-semibold underline" href={getProductAppPath("think-education", "/academics/curriculum")}>Class curriculum</Link>.
    </p>}

    {canCreate && selectedCampusClasses.length > 0 && activeClassSubjects.length > 0 && <section id="add-lesson" className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-slate-950">Add lesson to timetable</h2>
      <p className="mt-1 text-sm text-slate-500">The server checks for class, teacher, and room conflicts before saving.</p>
      <form action={createEducationTimetableEntry} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-sm font-medium text-slate-700">Campus
          <select required name="branch_id" defaultValue={selectedBranch || undefined} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Academic year
          <span className="mt-1 block rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-normal text-slate-700">
            {yearNameById.get(createYearId) ?? "No available academic year"}
          </span>
          {createYearId && <input type="hidden" name="academic_year_id" value={createYearId} />}
        </label>
        <label className="text-sm font-medium text-slate-700">Teacher
          <select name="staff_id" defaultValue="" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">Unassigned</option>{selectedCampusStaff.map((member) => <option key={member.id} value={member.id}>{member.first_name} {member.last_name} · {member.staff_number}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Class · subject
          <select required name="class_subject_id" defaultValue="" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="" disabled>Select an assigned subject</option>
            {activeClassSubjects.map((assignment) => <option key={assignment.id} value={assignment.id}>{classNameById.get(assignment.class_id) ?? "Class"} · {subjectNameById.get(assignment.subject_id)}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Day
          <select required name="weekday" defaultValue={1} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            {WEEKDAYS.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Starts
          <input required type="time" name="starts_at" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Ends
          <input required type="time" name="ends_at" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Room
          <input name="room" maxLength={80} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <div className="flex items-end"><button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"><Plus className="h-4 w-4" /> Save lesson</button></div>
      </form>
    </section>}
  </main>;
}
