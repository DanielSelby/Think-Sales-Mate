import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarCheck, Users } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import { saveEducationStaffAttendance } from "../../actions";

const PAGE_SIZE = 50;
const ATTENDANCE_STATUSES = ["present", "absent", "late", "excused"] as const;
type AttendanceStatus = typeof ATTENDANCE_STATUSES[number];

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export default async function EducationStaffAttendancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_attendance", "attendance", "staff", "view")) {
    redirect("/dashboard?accessDenied=think-education.staff-attendance");
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
    canTabPermission("education_attendance", "attendance", "staff", "create"),
    canTabPermission("education_attendance", "attendance", "staff", "edit"),
  ]);
  const supabase = await createClient();
  let staff: Array<{ id: string; staff_number: string; first_name: string; last_name: string; branch_id: string }> = [];
  let totalCount = 0;
  if (branchIds.length) {
    let query = supabase.from("education_staff")
      .select("id, staff_number, first_name, last_name, branch_id", { count: "exact" })
      .eq("org_id", context.orgId).in("branch_id", branchIds).eq("status", "active")
      .order("last_name").order("first_name")
      .range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1);
    if (search) {
      const safeSearch = search.replace(/[^A-Za-z0-9\s_-]/g, "");
      if (safeSearch) {
        const pattern = `%${safeSearch}%`;
        query = query.or(`staff_number.ilike.${pattern},first_name.ilike.${pattern},last_name.ilike.${pattern}`);
      }
    }
    const { data, count, error } = await query;
    if (error) throw new Error(`Could not load staff for Think Education attendance: ${error.message}`);
    staff = data ?? [];
    totalCount = count ?? 0;
  }

  const staffIds = staff.map((member) => member.id);
  const attendanceByStaff = new Map<string, { status: AttendanceStatus; note: string | null }>();
  if (staffIds.length) {
    const { data, error } = await supabase.from("education_attendance")
      .select("staff_id, status, note")
      .eq("org_id", context.orgId).eq("attendance_date", attendanceDate).in("staff_id", staffIds);
    if (error) throw new Error(`Could not load Think Education staff attendance: ${error.message}`);
    for (const record of data ?? []) {
      if (record.staff_id && ATTENDANCE_STATUSES.includes(record.status as AttendanceStatus)) {
        attendanceByStaff.set(record.staff_id, { status: record.status as AttendanceStatus, note: record.note });
      }
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const queryForPage = (page: number) => {
    const next = new URLSearchParams({ date: attendanceDate, page: String(page) });
    if (search) next.set("search", search);
    if (selectedBranch) next.set("branch", selectedBranch);
    return `${getProductAppPath("think-education", "/attendance/staff")}?${next.toString()}`;
  };
  if (currentPage > totalPages) redirect(queryForPage(totalPages));
  const errorMessage = params.error === "invalid"
    ? "Check the attendance date, status, and note."
    : params.error === "staff"
      ? "The staff member is unavailable or not assigned to that campus."
      : params.error === "save"
        ? "Staff attendance could not be saved. Please try again."
        : null;
  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));

  return <main className="mx-auto max-w-[1500px] space-y-5 p-4 md:p-6">
    <header>
      <Link href={getProductAppPath("think-education", "/staff")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
        <ArrowLeft className="h-4 w-4" /> Staff Management
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-950">Staff Attendance</h1>
      <p className="mt-1 text-sm text-slate-600">Record or correct daily attendance for active staff in your authorized campuses.</p>
    </header>

    {params.saved === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Staff attendance saved for {attendanceDate}.</p>}
    {errorMessage && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{errorMessage}</p>}

    <section className="grid gap-3 sm:grid-cols-3">
      {[
        { label: "Active staff in filter", value: totalCount.toLocaleString(), icon: Users },
        { label: "Marked on this page", value: staff.filter((member) => attendanceByStaff.has(member.id)).length.toLocaleString(), icon: CalendarCheck },
        { label: "Campuses in your access", value: campuses.length.toLocaleString(), icon: Users },
      ].map(({ label, value, icon: Icon }) => <article key={label} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-950">{value}</p></div>
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><Icon className="h-5 w-5" /></span>
      </article>)}
    </section>

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <form method="get" action={getProductAppPath("think-education", "/attendance/staff")} className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-[minmax(220px,1fr)_200px_220px_auto]">
        <label className="text-sm font-medium text-slate-700">Search staff
          <input name="search" defaultValue={search} placeholder="Name or staff number" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Campus
          <select name="branch" defaultValue={selectedBranch} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">All assigned campuses</option>{campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Attendance date
          <input type="date" name="date" defaultValue={attendanceDate} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <div className="flex items-end"><button type="submit" className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Apply filters</button></div>
      </form>

      {campuses.length === 0 ? <p className="p-8 text-center text-sm text-slate-600">No active Think Education campuses are assigned to your account.</p>
        : staff.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No active staff match these filters.</p>
          : <ul className="divide-y divide-slate-100">
            {staff.map((member) => {
              const record = attendanceByStaff.get(member.id);
              const canSave = record ? canEdit : canCreate || canEdit;
              return <li key={member.id} className="grid gap-3 p-4 md:grid-cols-[minmax(190px,1fr)_minmax(250px,2fr)] md:items-center">
                <div>
                  <p className="font-semibold text-slate-950">{member.first_name} {member.last_name}</p>
                  <p className="mt-1 text-sm text-slate-500">{member.staff_number} · {campusNameById.get(member.branch_id) ?? "Campus"}</p>
                  <p className="mt-1 text-xs capitalize text-slate-500">{record ? `Currently ${record.status}` : "Not marked"}</p>
                </div>
                {canSave ? <form action={saveEducationStaffAttendance} className="grid gap-2 sm:grid-cols-[130px_minmax(120px,1fr)_auto]">
                  <input type="hidden" name="branch_id" value={member.branch_id} />
                  <input type="hidden" name="staff_id" value={member.id} />
                  <input type="hidden" name="attendance_date" value={attendanceDate} />
                  <label className="sr-only" htmlFor={`status-${member.id}`}>Attendance status</label>
                  <select id={`status-${member.id}`} name="status" defaultValue={record?.status ?? "present"} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    {ATTENDANCE_STATUSES.map((status) => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}
                  </select>
                  <label className="sr-only" htmlFor={`note-${member.id}`}>Attendance note</label>
                  <input id={`note-${member.id}`} name="note" defaultValue={record?.note ?? ""} maxLength={500} placeholder="Optional note" className="min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  <button type="submit" className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800">{record ? "Save correction" : "Record"}</button>
                </form> : <p className="text-sm text-slate-500">{record?.note || "No attendance permission for this record."}</p>}
              </li>;
            })}
          </ul>}

      {totalPages > 1 && <nav aria-label="Staff attendance pages" className="flex items-center justify-between border-t border-slate-100 p-4">
        {currentPage > 1 ? <Link href={queryForPage(currentPage - 1)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Previous</Link> : <span />}
        <span className="text-sm text-slate-500">Page {currentPage} of {totalPages}</span>
        {currentPage < totalPages ? <Link href={queryForPage(currentPage + 1)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Next</Link> : <span />}
      </nav>}
    </section>
  </main>;
}
