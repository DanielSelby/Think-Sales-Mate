import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarClock, Plus } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import { createEducationTimetableEntry } from "../actions";

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
  const canCreate = await canTabPermission("education_timetables", "timetables", "schedule", "create");
  const supabase = await createClient();
  const [{ data: years, error: yearsError }, classesResult, staffResult, entriesResult] = await Promise.all([
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
        .select("id, branch_id, class_id, staff_id, academic_year_id, subject_name, weekday, starts_at, ends_at, room")
        .eq("org_id", context.orgId).in("branch_id", filterBranchIds).eq("status", "active")
        .order("weekday").order("starts_at")
      : Promise.resolve({ data: [] as TimetableRow[], error: null }),
  ]);
  if (yearsError) throw new Error(`Could not load academic years for timetables: ${yearsError.message}`);
  if (classesResult.error) throw new Error(`Could not load classes for timetables: ${classesResult.error.message}`);
  if (staffResult.error) throw new Error(`Could not load staff for timetables: ${staffResult.error.message}`);
  if (entriesResult.error) throw new Error(`Could not load Think Education timetable: ${entriesResult.error.message}`);
  const academicYears = years ?? [];
  const availableAcademicYears = academicYears.filter((year) => year.status === "active" || year.status === "planned");
  const classes = classesResult.data ?? [];
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
  const classNameById = new Map(classes.map((classroom) => [classroom.id, classroom.name]));
  const yearNameById = new Map(academicYears.map((year) => [year.id, year.name]));
  const staffById = new Map(staff.map((member) => [member.id, `${member.first_name} ${member.last_name}`]));
  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const selectedCampusClasses = classes.filter((classroom) =>
    classroom.branch_id === createBranchId
    && Boolean(createYearId)
    && classroom.academic_year_id === createYearId
  );
  const selectedCampusStaff = staff.filter((member) => member.branch_id === createBranchId);
  const errorMessage = params.error === "conflict"
    ? "That time overlaps another lesson for the selected class, staff member, or room."
    : params.error === "invalid"
      ? "Check the campus, class, academic year, subject, day, and time."
      : params.error === "save" ? "The timetable entry could not be saved. Please try again." : null;

  return <main className="mx-auto max-w-[1500px] space-y-5 p-4 md:p-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <Link href={getProductAppPath("think-education", "/dashboard")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">Class Timetables</h1>
        <p className="mt-1 text-sm text-slate-600">View weekly lessons and schedule classes without overlapping their class, teacher, or room.</p>
      </div>
      {canCreate && selectedCampusClasses.length > 0 && <a href="#add-lesson" className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">
        <Plus className="h-4 w-4" /> Add lesson
      </a>}
    </header>

    {params.created === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Timetable entry added.</p>}
    {errorMessage && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{errorMessage}</p>}

    <section className="grid gap-3 sm:grid-cols-3">
      {[
        { label: "Lessons in this view", value: visibleEntries.length, icon: CalendarClock },
        { label: "Campuses in your access", value: campuses.length, icon: CalendarClock },
        { label: "Active classes", value: selectedCampusClasses.length, icon: CalendarClock },
      ].map(({ label, value, icon: Icon }) => <article key={label} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-950">{value.toLocaleString()}</p></div>
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><Icon className="h-5 w-5" /></span>
      </article>)}
    </section>

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <form method="get" action={getProductAppPath("think-education", "/timetables")} className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-[1fr_1fr_1fr_auto]">
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
      </form>

      {campuses.length === 0 ? <div className="p-8 text-center">
        <CalendarClock className="mx-auto h-10 w-10 text-slate-300" />
        <h2 className="mt-3 font-semibold text-slate-900">No campus access assigned</h2>
        <p className="mt-1 text-sm text-slate-500">Ask an authorized Think Education administrator to assign your campus scope.</p>
      </div> : visibleEntries.length === 0 ? <div className="p-8 text-center">
        <CalendarClock className="mx-auto h-10 w-10 text-slate-300" />
        <h2 className="mt-3 font-semibold text-slate-900">No lessons scheduled</h2>
        <p className="mt-1 text-sm text-slate-500">Add a lesson to an active class in an available academic year.</p>
      </div> : <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Day</th><th className="px-4 py-3">Time</th><th className="px-4 py-3">Subject</th><th className="px-4 py-3">Class</th><th className="px-4 py-3">Teacher</th><th className="px-4 py-3">Campus / room</th><th className="px-4 py-3">Year</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{visibleEntries.map((entry) => <tr key={entry.id}>
            <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">{WEEKDAYS.find((day) => day.value === entry.weekday)?.label}</td>
            <td className="whitespace-nowrap px-4 py-3 text-slate-600">{entry.starts_at.slice(0, 5)}–{entry.ends_at.slice(0, 5)}</td>
            <td className="px-4 py-3 font-medium text-slate-900">{entry.subject_name}</td>
            <td className="px-4 py-3 text-slate-600">{classNameById.get(entry.class_id) ?? "Class"}</td>
            <td className="px-4 py-3 text-slate-600">{entry.staff_id ? staffById.get(entry.staff_id) ?? "Staff" : "Unassigned"}</td>
            <td className="px-4 py-3 text-slate-600">{campusNameById.get(entry.branch_id) ?? "Campus"}{entry.room ? ` · ${entry.room}` : ""}</td>
            <td className="px-4 py-3 text-slate-600">{yearNameById.get(entry.academic_year_id) ?? "—"}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>

    {canCreate && selectedCampusClasses.length > 0 && <section id="add-lesson" className="scroll-mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
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
        <label className="text-sm font-medium text-slate-700">Class
          <select required name="class_id" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            {selectedCampusClasses.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name} · {yearNameById.get(classroom.academic_year_id) ?? "Year"}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Teacher
          <select name="staff_id" defaultValue="" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">Unassigned</option>{selectedCampusStaff.map((member) => <option key={member.id} value={member.id}>{member.first_name} {member.last_name} · {member.staff_number}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Subject
          <input required name="subject_name" maxLength={120} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
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
