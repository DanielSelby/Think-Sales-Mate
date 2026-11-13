import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarCheck, Save, Users } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import { saveEducationAttendance } from "../actions";

const PAGE_SIZE = 25;
const ATTENDANCE_STATUSES = ["present", "absent", "late", "excused"] as const;
type AttendanceStatus = typeof ATTENDANCE_STATUSES[number];

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export default async function EducationAttendancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_attendance", "attendance", "register", "view")) {
    redirect("/dashboard?accessDenied=think-education.attendance");
  }

  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const requestedDate = typeof params.date === "string" ? params.date : today;
  const attendanceDate = isValidDate(requestedDate) ? requestedDate : today;
  const search = typeof params.search === "string" ? params.search.trim().slice(0, 80) : "";
  const requestedBranch = typeof params.branch === "string" ? params.branch : "";
  const requestedPage = Number.parseInt(typeof params.page === "string" ? params.page : "1", 10);
  const currentPage = Number.isFinite(requestedPage) ? Math.min(1_000_000, Math.max(1, requestedPage)) : 1;
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const campusIds = campuses.map((campus) => campus.id);
  const selectedBranch = campusIds.includes(requestedBranch) ? requestedBranch : "";
  const branchIds = selectedBranch ? [selectedBranch] : campusIds;
  const [canCreate, canEdit] = await Promise.all([
    canTabPermission("education_attendance", "attendance", "register", "create"),
    canTabPermission("education_attendance", "attendance", "register", "edit"),
  ]);
  const supabase = await createClient();
  let students: Array<{ id: string; student_number: string; first_name: string; last_name: string; branch_id: string }> = [];
  let totalCount = 0;
  if (branchIds.length) {
    let query = supabase.from("education_students")
      .select("id, student_number, first_name, last_name, branch_id", { count: "exact" })
      .eq("org_id", context.orgId).in("branch_id", branchIds).eq("status", "active")
      .order("last_name").order("first_name")
      .range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1);
    if (search) {
      const safeSearch = search.replace(/[^A-Za-z0-9\s_-]/g, "");
      if (safeSearch) {
        const pattern = `%${safeSearch}%`;
        query = query.or(`student_number.ilike.${pattern},first_name.ilike.${pattern},last_name.ilike.${pattern}`);
      }
    }
    const { data, count, error } = await query;
    if (error) throw new Error(`Could not load students for Think Education attendance: ${error.message}`);
    students = data ?? [];
    totalCount = count ?? 0;
  }

  const studentIds = students.map((student) => student.id);
  const attendanceByStudent = new Map<string, { status: AttendanceStatus; note: string | null }>();
  if (studentIds.length) {
    const { data, error } = await supabase.from("education_attendance")
      .select("student_id, status, note")
      .eq("org_id", context.orgId).eq("attendance_date", attendanceDate).in("student_id", studentIds);
    if (error) throw new Error(`Could not load Think Education attendance: ${error.message}`);
    for (const record of data ?? []) {
      if (record.student_id && ATTENDANCE_STATUSES.includes(record.status as AttendanceStatus)) {
        attendanceByStudent.set(record.student_id, { status: record.status as AttendanceStatus, note: record.note });
      }
    }
  }
  const csvRows = [
    ["Student ID", "Student", "Campus", "Attendance status", "Note", "Date"],
    ...students.map((student) => {
      const existing = attendanceByStudent.get(student.id);
      return [
        student.student_number,
        `${student.first_name} ${student.last_name}`.trim(),
        campuses.find((campus) => campus.id === student.branch_id)?.name ?? "Campus",
        existing?.status ?? "not_marked",
        existing?.note ?? "",
        attendanceDate,
      ];
    }),
  ];
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(csvRows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n"))}`;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const queryForPage = (page: number) => {
    const next = new URLSearchParams({ date: attendanceDate, page: String(page) });
    if (search) next.set("search", search);
    if (selectedBranch) next.set("branch", selectedBranch);
    return `${getProductAppPath("think-education", "/attendance")}?${next.toString()}`;
  };
  if (currentPage > totalPages) redirect(queryForPage(totalPages));
  const errorMessage = params.error === "duplicate"
    ? "Attendance for this student and date was submitted at the same time. Refresh and try again."
    : params.error === "invalid"
      ? "Check the attendance date, status, and note."
      : params.error === "save" ? "Attendance could not be saved. Please try again." : null;

  return <main className="mx-auto max-w-[1500px] space-y-5 p-4 md:p-6">
    <header>
      <Link href={getProductAppPath("think-education", "/dashboard")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-950">Student Attendance</h1>
      <p className="mt-1 text-sm text-slate-600">Record or correct daily attendance for active students in your authorized campuses.</p>
    </header>

    {params.saved === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Attendance saved for {attendanceDate}.</p>}
    {errorMessage && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{errorMessage}</p>}

    <section className="grid gap-3 sm:grid-cols-3">
      {[
        { label: "Active students in filter", value: totalCount.toLocaleString(), icon: Users },
        { label: "Marked on this page", value: students.filter((student) => attendanceByStudent.has(student.id)).length.toLocaleString(), icon: CalendarCheck },
        { label: "Campuses in your access", value: campuses.length.toLocaleString(), icon: Users },
      ].map(({ label, value, icon: Icon }) => <article key={label} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-950">{value}</p></div>
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><Icon className="h-5 w-5" /></span>
      </article>)}
    </section>

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <form method="get" action={getProductAppPath("think-education", "/attendance")} className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-[minmax(220px,1fr)_200px_220px_auto_auto]">
        <label className="text-sm font-medium text-slate-700">Search students
          <input name="search" defaultValue={search} placeholder="Name or student number" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Campus
          <select name="branch" defaultValue={selectedBranch} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">All assigned campuses</option>{campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Attendance date
          <input type="date" name="date" defaultValue={attendanceDate} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <button type="submit" className="self-end rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100">Apply filters</button>
        {students.length > 0 && <a href={csvHref} download={`education-attendance-${attendanceDate}.csv`} className="self-end rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Export CSV</a>}
      </form>

      {campuses.length === 0 ? <div className="p-8 text-center">
        <CalendarCheck className="mx-auto h-10 w-10 text-slate-300" />
        <h2 className="mt-3 font-semibold text-slate-900">No campus access assigned</h2>
        <p className="mt-1 text-sm text-slate-500">Ask an authorized Think Education administrator to assign your campus scope.</p>
      </div> : students.length === 0 ? <div className="p-8 text-center">
        <Users className="mx-auto h-10 w-10 text-slate-300" />
        <h2 className="mt-3 font-semibold text-slate-900">No active students found</h2>
        <p className="mt-1 text-sm text-slate-500">Try another search or campus, or add students first.</p>
      </div> : <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Student ID</th><th className="px-4 py-3">Student</th><th className="px-4 py-3">Campus</th><th className="px-4 py-3">Attendance</th><th className="px-4 py-3">Note</th><th className="px-4 py-3">Save</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{students.map((student) => {
            const existing = attendanceByStudent.get(student.id);
            const canSave = existing ? canEdit : canCreate;
            return <tr key={student.id}>
              <td className="whitespace-nowrap px-4 py-3 font-semibold text-blue-800">{student.student_number}</td>
              <td className="px-4 py-3 font-medium text-slate-900">{student.first_name} {student.last_name}</td>
              <td className="px-4 py-3 text-slate-600">{campuses.find((campus) => campus.id === student.branch_id)?.name ?? "Campus"}</td>
              <td colSpan={3} className="px-4 py-3">
                {canSave ? <form action={saveEducationAttendance} className="grid gap-2 sm:grid-cols-[180px_minmax(160px,1fr)_auto]">
                  <input type="hidden" name="branch_id" value={student.branch_id} />
                  <input type="hidden" name="student_id" value={student.id} />
                  <input type="hidden" name="attendance_date" value={attendanceDate} />
                  <select name="status" defaultValue={existing?.status ?? "present"} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    {ATTENDANCE_STATUSES.map((status) => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}
                  </select>
                  <input name="note" defaultValue={existing?.note ?? ""} maxLength={500} placeholder="Optional note" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800"><Save className="h-4 w-4" />{existing ? "Update" : "Mark"}</button>
                </form> : <span className="text-xs text-slate-500">{existing ? `${existing.status} (edit access required)` : "No attendance access"}</span>}
              </td>
            </tr>;
          })}</tbody>
        </table>
      </div>}

      {totalCount > 0 && <footer className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
        <span className="text-slate-500">Showing {((currentPage - 1) * PAGE_SIZE) + 1}–{Math.min(currentPage * PAGE_SIZE, totalCount)} of {totalCount.toLocaleString()}</span>
        <div className="flex items-center gap-2">
          {currentPage > 1 && <Link href={queryForPage(currentPage - 1)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 font-medium text-slate-700"><ArrowLeft className="h-4 w-4" /> Previous</Link>}
          <span className="text-slate-600">{currentPage} / {totalPages}</span>
          {currentPage < totalPages && <Link href={queryForPage(currentPage + 1)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 font-medium text-slate-700">Next <ArrowRight className="h-4 w-4" /></Link>}
        </div>
      </footer>}
    </section>
  </main>;
}
