import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowDownToLine, ArrowLeft, CalendarDays, Users } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { EDUCATION_STAFF_ATTENDANCE_STATUSES, summarizeEducationStaffAttendance, type EducationStaffAttendanceStatus } from "@/lib/education/staff-attendance-report";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";

const REPORT_LIMIT = 5000;
type SearchParams = Record<string, string | string[] | undefined>;

function getParam(params: SearchParams, key: string) {
  return typeof params[key] === "string" ? params[key] as string : "";
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function label(value: string) {
  return value[0].toUpperCase() + value.slice(1);
}

function escapeCsv(value: string | number) {
  const text = String(value ?? "");
  const safeText = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

export default async function EducationStaffAttendanceReportPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  const [
    canViewReport,
    canViewAttendance,
    canViewStaff,
    canExportReport,
    canExportAttendance,
    canExportStaff,
  ] = await Promise.all([
    canTabPermission("education_reports", "reports", "staff", "view"),
    canTabPermission("education_attendance", "attendance", "staff", "view"),
    canTabPermission("education_staff", "staff", "directory", "view"),
    canTabPermission("education_reports", "reports", "staff", "export"),
    canTabPermission("education_attendance", "attendance", "staff", "export"),
    canTabPermission("education_staff", "staff", "directory", "export"),
  ]);
  if (!canViewReport || !canViewAttendance || !canViewStaff) {
    redirect("/dashboard?accessDenied=think-education.staff-attendance-report");
  }

  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const defaultFromDate = new Date(`${today}T00:00:00.000Z`);
  defaultFromDate.setUTCDate(defaultFromDate.getUTCDate() - 29);
  const defaultFrom = defaultFromDate.toISOString().slice(0, 10);
  const requestedFrom = getParam(params, "from");
  const requestedTo = getParam(params, "to");
  const candidateFrom = isValidDate(requestedFrom) ? requestedFrom : defaultFrom;
  const candidateTo = isValidDate(requestedTo) ? requestedTo : today;
  const validDateRange = (!requestedFrom || isValidDate(requestedFrom))
    && (!requestedTo || isValidDate(requestedTo))
    && candidateFrom <= candidateTo;
  const fromDate = validDateRange ? candidateFrom : defaultFrom;
  const toDate = validDateRange ? candidateTo : today;
  const requestedStatus = getParam(params, "status");
  const validStatus = !requestedStatus
    || EDUCATION_STAFF_ATTENDANCE_STATUSES.includes(requestedStatus as EducationStaffAttendanceStatus);
  const status = validStatus && EDUCATION_STAFF_ATTENDANCE_STATUSES.includes(requestedStatus as EducationStaffAttendanceStatus)
    ? requestedStatus as EducationStaffAttendanceStatus
    : "";
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const campusIds = campuses.map((campus) => campus.id);
  const requestedBranch = getParam(params, "branch");
  const validBranchFilter = !requestedBranch || campusIds.includes(requestedBranch);
  const branchId = validBranchFilter && requestedBranch ? requestedBranch : "";
  const branchIds = branchId ? [branchId] : campusIds;
  const supabase = await createClient();

  let attendanceRecords: Array<{
    branch_id: string;
    staff_id: string;
    status: EducationStaffAttendanceStatus;
  }> = [];
  let attendanceCount = 0;
  if (branchIds.length) {
    let query = supabase.from("education_attendance")
      .select("branch_id, staff_id, status", { count: "exact" })
      .eq("org_id", context.orgId)
      .in("branch_id", branchIds)
      .not("staff_id", "is", null)
      .is("student_id", null)
      .gte("attendance_date", fromDate)
      .lte("attendance_date", toDate)
      .order("attendance_date", { ascending: false }).order("branch_id").order("staff_id");
    if (status) query = query.eq("status", status);
    const { data, count, error } = await query.range(0, REPORT_LIMIT - 1);
    if (error) throw new Error(`Could not load Think Education staff attendance report: ${error.message}`);
    attendanceRecords = (data ?? []).filter((record) =>
      record.staff_id
      && EDUCATION_STAFF_ATTENDANCE_STATUSES.includes(record.status as EducationStaffAttendanceStatus)
    ).map((record) => ({
      branch_id: record.branch_id,
      staff_id: record.staff_id as string,
      status: record.status as EducationStaffAttendanceStatus,
    }));
    attendanceCount = count ?? 0;
  }

  const staffIds = Array.from(new Set(attendanceRecords.map((record) => record.staff_id)));
  const { data: staff, error: staffError } = staffIds.length
    ? await supabase.from("education_staff")
      .select("id, branch_id, staff_number, first_name, last_name")
      .eq("org_id", context.orgId).in("id", staffIds).in("branch_id", campusIds)
    : { data: [], error: null };
  if (staffError) throw new Error(`Could not load staff names for the report: ${staffError.message}`);

  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const staffById = new Map((staff ?? []).map((member) => [
    member.id,
    { name: `${member.first_name} ${member.last_name}`, number: member.staff_number },
  ]));
  const summaries = summarizeEducationStaffAttendance(attendanceRecords);
  const totals = attendanceRecords.reduce<Record<EducationStaffAttendanceStatus, number>>((result, record) => {
    result[record.status] += 1;
    return result;
  }, { present: 0, absent: 0, late: 0, excused: 0 });
  const csvRows = [
    ["Staff number", "Staff name", "Campus", "Present", "Absent", "Late", "Excused", "Total records"],
    ...summaries.map((summary) => {
      const staffRecord = staffById.get(summary.staff_id);
      return [
        staffRecord?.number ?? "",
        staffRecord?.name ?? "Staff member",
        campusNameById.get(summary.branch_id) ?? "Campus",
        String(summary.present_count),
        String(summary.absent_count),
        String(summary.late_count),
        String(summary.excused_count),
        String(summary.total_records),
      ];
    }),
  ];
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(`\uFEFF${csvRows.map((row) => row.map(escapeCsv).join(",")).join("\r\n")}`)}`;
  const canExport = canExportReport && canExportAttendance && canExportStaff;

  return <main className="mx-auto max-w-[1400px] space-y-5 p-4 md:p-6">
    <header>
      <Link href={getProductAppPath("think-education", "/attendance/staff")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
        <ArrowLeft className="h-4 w-4" /> Staff attendance
      </Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Staff Attendance Report</h1>
          <p className="mt-1 text-sm text-slate-600">Attendance totals by employee and campus. Notes and student records are excluded.</p>
        </div>
        {canExport && attendanceCount > 0 && attendanceCount <= REPORT_LIMIT && <a href={csvHref} download={`education-staff-attendance-${fromDate}-to-${toDate}.csv`} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
          <ArrowDownToLine className="h-4 w-4" /> Download CSV
        </a>}
      </div>
    </header>

    <form method="get" action={getProductAppPath("think-education", "/reports/staff-attendance")} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
      <label className="text-sm font-medium text-slate-700">From
        <input type="date" name="from" defaultValue={fromDate} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
      </label>
      <label className="text-sm font-medium text-slate-700">To
        <input type="date" name="to" defaultValue={toDate} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
      </label>
      <label className="text-sm font-medium text-slate-700">Campus
        <select name="branch" defaultValue={branchId} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
          <option value="">All assigned campuses</option>
          {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium text-slate-700">Status
        <select name="status" defaultValue={status} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
          <option value="">All statuses</option>
          {EDUCATION_STAFF_ATTENDANCE_STATUSES.map((item) => <option key={item} value={item}>{label(item)}</option>)}
        </select>
      </label>
      <div className="flex items-end"><button type="submit" className="w-full rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">Apply filters</button></div>
    </form>

    {!validDateRange && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Choose valid dates with the start on or before the end. Showing the default 30-day range.</p>}
    {(!validStatus || !validBranchFilter) && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">An invalid or unauthorized campus/status filter was ignored. The report remains limited to your assigned campuses.</p>}
    {attendanceCount > REPORT_LIMIT && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">The report is limited to the first {REPORT_LIMIT.toLocaleString()} of {attendanceCount.toLocaleString()} records. Narrow the date range or campus filter for complete totals and CSV export.</p>}

    <section className="grid gap-3 sm:grid-cols-3">
      {[
        { label: "Attendance records", value: attendanceCount.toLocaleString(), icon: CalendarDays },
        { label: "Staff and campus groups", value: summaries.length.toLocaleString(), icon: Users },
        { label: "Present records", value: totals.present.toLocaleString(), icon: CalendarDays },
      ].map(({ label: metric, value, icon: Icon }) => <article key={metric} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div><p className="text-sm text-slate-500">{metric}</p><p className="mt-1 text-2xl font-bold text-slate-950">{value}</p></div>
        <Icon className="h-6 w-6 text-blue-700" />
      </article>)}
    </section>

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {summaries.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No staff attendance records match these filters in your assigned campuses.</p> : <div className="overflow-x-auto">
        <table className="w-full min-w-[850px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-4 py-3">Staff ID</th><th className="px-4 py-3">Staff member</th><th className="px-4 py-3">Campus</th><th className="px-4 py-3 text-right">Present</th><th className="px-4 py-3 text-right">Absent</th><th className="px-4 py-3 text-right">Late</th><th className="px-4 py-3 text-right">Excused</th><th className="px-4 py-3 text-right">Total</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {summaries.map((summary) => {
              const staffRecord = staffById.get(summary.staff_id);
              return <tr key={`${summary.branch_id}:${summary.staff_id}`}>
                <td className="px-4 py-3 font-medium text-slate-700">{staffRecord?.number ?? "—"}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{staffRecord?.name ?? "Staff member"}</td>
                <td className="px-4 py-3 text-slate-700">{campusNameById.get(summary.branch_id) ?? "Campus"}</td>
                <td className="px-4 py-3 text-right">{summary.present_count}</td>
                <td className="px-4 py-3 text-right">{summary.absent_count}</td>
                <td className="px-4 py-3 text-right">{summary.late_count}</td>
                <td className="px-4 py-3 text-right">{summary.excused_count}</td>
                <td className="px-4 py-3 text-right font-semibold">{summary.total_records}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>}
    </section>
  </main>;
}
