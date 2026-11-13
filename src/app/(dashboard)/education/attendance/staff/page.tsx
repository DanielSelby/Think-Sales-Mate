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

  return <main className="mx-auto max-w-[1500px] space-y-4 p-3 md:p-5">
    <header className="space-y-2">
      <Link href={getProductAppPath("think-education", "/staff")} className="inline-flex items-center gap-1 text-sm font-medium" style={{ color: "var(--theme-primary, #2563eb)" }}>
        <ArrowLeft className="h-4 w-4" /> Staff Management
      </Link>
      <h1 className="text-2xl font-bold" style={{ color: "var(--theme-text, #111827)" }}>Staff Attendance</h1>
      <p className="text-sm" style={{ color: "var(--theme-text-muted, #4b5563)" }}>Record or correct daily attendance for active staff in your authorized campuses.</p>
    </header>

    {params.saved === "1" && <p role="status" className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "rgba(16,185,129,0.3)", backgroundColor: "rgba(16,185,129,0.08)", color: "#065f46" }}>Staff attendance saved for {attendanceDate}.</p>}
    {errorMessage && <p role="alert" className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "rgba(239,68,68,0.25)", backgroundColor: "rgba(239,68,68,0.06)", color: "#991b1b" }}>{errorMessage}</p>}

    <section className="grid gap-3 sm:grid-cols-3">
      {[
        { label: "Active staff in filter", value: totalCount.toLocaleString(), icon: Users },
        { label: "Marked on this page", value: staff.filter((member) => attendanceByStaff.has(member.id)).length.toLocaleString(), icon: CalendarCheck },
        { label: "Campuses in your access", value: campuses.length.toLocaleString(), icon: Users },
      ].map(({ label, value, icon: Icon }) => <article key={label} className="flex items-center justify-between rounded-xl border p-4 shadow-sm" style={{ borderColor: "var(--theme-header-border-light, #dbeafe)", backgroundColor: "var(--theme-surface, #fff)" }}>
        <div><p className="text-sm" style={{ color: "var(--theme-text-muted, #4b5563)" }}>{label}</p><p className="mt-1 text-2xl font-bold" style={{ color: "var(--theme-text, #111827)" }}>{value}</p></div>
        <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ backgroundColor: "rgba(37,99,235,0.08)", color: "var(--theme-primary, #2563eb)" }}><Icon className="h-5 w-5" /></span>
      </article>)}
    </section>

    <section className="overflow-hidden rounded-xl border shadow-sm" style={{ borderColor: "var(--theme-header-border-light, #dbeafe)", backgroundColor: "var(--theme-surface, #fff)" }}>
      <form method="get" action={getProductAppPath("think-education", "/attendance/staff")} className="grid gap-3 border-b p-3 md:grid-cols-[minmax(220px,1fr)_200px_220px_auto]" style={{ borderColor: "var(--theme-header-border-light, #dbeafe)" }}>
        <label className="text-sm font-medium" style={{ color: "var(--theme-text, #111827)" }}>Search staff
          <input name="search" defaultValue={search} placeholder="Name or staff number" className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" style={{ borderColor: "var(--theme-header-border-light, #dbeafe)", backgroundColor: "#fff", color: "var(--theme-text, #111827)" }} />
        </label>
        <label className="text-sm font-medium" style={{ color: "var(--theme-text, #111827)" }}>Campus
          <select name="branch" defaultValue={selectedBranch} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" style={{ borderColor: "var(--theme-header-border-light, #dbeafe)", backgroundColor: "#fff", color: "var(--theme-text, #111827)" }}>
            <option value="">All assigned campuses</option>{campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium" style={{ color: "var(--theme-text, #111827)" }}>Attendance date
          <input type="date" name="date" defaultValue={attendanceDate} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" style={{ borderColor: "var(--theme-header-border-light, #dbeafe)", backgroundColor: "#fff", color: "var(--theme-text, #111827)" }} />
        </label>
        <div className="flex items-end"><button type="submit" className="w-full rounded-lg border px-4 py-2 text-sm font-semibold hover:opacity-95" style={{ borderColor: "var(--theme-header-border-light, #dbeafe)", backgroundColor: "var(--theme-primary-pale, #eff6ff)", color: "var(--theme-primary, #2563eb)" }}>Apply filters</button></div>
      </form>

      {campuses.length === 0 ? <p className="p-8 text-center text-sm" style={{ color: "var(--theme-text-muted, #4b5563)" }}>No active Think Education campuses are assigned to your account.</p>
        : staff.length === 0 ? <p className="p-8 text-center text-sm" style={{ color: "var(--theme-text-muted, #4b5563)" }}>No active staff match these filters.</p>
          : <ul className="divide-y" style={{ borderColor: "var(--theme-header-border-light, #dbeafe)" }}>
            {staff.map((member) => {
              const record = attendanceByStaff.get(member.id);
              const canSave = record ? canEdit : canCreate || canEdit;
              return <li key={member.id} className="grid gap-3 p-3 md:grid-cols-[minmax(190px,1fr)_minmax(250px,2fr)] md:items-center">
                <div>
                  <p className="font-semibold" style={{ color: "var(--theme-text, #111827)" }}>{member.first_name} {member.last_name}</p>
                  <p className="mt-1 text-sm" style={{ color: "var(--theme-text-muted, #4b5563)" }}>{member.staff_number} · {campusNameById.get(member.branch_id) ?? "Campus"}</p>
                  <p className="mt-1 text-xs capitalize" style={{ color: "var(--theme-text-muted, #4b5563)" }}>{record ? `Currently ${record.status}` : "Not marked"}</p>
                </div>
                {canSave ? <form action={saveEducationStaffAttendance} className="grid gap-2 sm:grid-cols-[130px_minmax(120px,1fr)_auto]">
                  <input type="hidden" name="branch_id" value={member.branch_id} />
                  <input type="hidden" name="staff_id" value={member.id} />
                  <input type="hidden" name="attendance_date" value={attendanceDate} />
                  <label className="sr-only" htmlFor={`status-${member.id}`}>Attendance status</label>
                  <select id={`status-${member.id}`} name="status" defaultValue={record?.status ?? "present"} className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--theme-header-border-light, #dbeafe)", backgroundColor: "#fff", color: "var(--theme-text, #111827)" }}>
                    {ATTENDANCE_STATUSES.map((status) => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}
                  </select>
                  <label className="sr-only" htmlFor={`note-${member.id}`}>Attendance note</label>
                  <input id={`note-${member.id}`} name="note" defaultValue={record?.note ?? ""} maxLength={500} placeholder="Optional note" className="min-w-0 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--theme-header-border-light, #dbeafe)", backgroundColor: "#fff", color: "var(--theme-text, #111827)" }} />
                  <button type="submit" className="rounded-lg px-3 py-2 text-sm font-semibold text-white hover:opacity-95" style={{ backgroundColor: "var(--theme-primary, #2563eb)" }}>{record ? "Save correction" : "Record"}</button>
                </form> : <p className="text-sm" style={{ color: "var(--theme-text-muted, #4b5563)" }}>{record?.note || "No attendance permission for this record."}</p>}
              </li>;
            })}
          </ul>}

      {totalPages > 1 && <nav aria-label="Staff attendance pages" className="flex items-center justify-between border-t p-3" style={{ borderColor: "var(--theme-header-border-light, #dbeafe)" }}>
        {currentPage > 1 ? <Link href={queryForPage(currentPage - 1)} className="rounded-lg border px-3 py-2 text-sm font-medium hover:opacity-95" style={{ borderColor: "var(--theme-header-border-light, #dbeafe)", backgroundColor: "var(--theme-primary-pale, #eff6ff)", color: "var(--theme-primary, #2563eb)" }}>Previous</Link> : <span />}
        <span className="text-sm" style={{ color: "var(--theme-text-muted, #4b5563)" }}>Page {currentPage} of {totalPages}</span>
        {currentPage < totalPages ? <Link href={queryForPage(currentPage + 1)} className="rounded-lg border px-3 py-2 text-sm font-medium hover:opacity-95" style={{ borderColor: "var(--theme-header-border-light, #dbeafe)", backgroundColor: "var(--theme-primary-pale, #eff6ff)", color: "var(--theme-primary, #2563eb)" }}>Next</Link> : <span />}
      </nav>}
    </section>
  </main>;
}
