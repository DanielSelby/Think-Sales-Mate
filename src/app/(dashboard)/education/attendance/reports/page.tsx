import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarCheck } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import {
  parseEducationAttendanceReportResult,
  type EducationAttendanceStatus,
} from "@/lib/education/attendance-report";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { getProductAppPath } from "@/lib/product-app-routes";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 25;
const ATTENDANCE_STATUSES: EducationAttendanceStatus[] = ["present", "absent", "late", "excused"];

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export default async function EducationAttendanceReportPage({
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
  const monthStart = `${today.slice(0, 7)}-01`;
  const requestedFrom = typeof params.from === "string" ? params.from : monthStart;
  const requestedTo = typeof params.to === "string" ? params.to : today;
  const validFrom = isValidDate(requestedFrom);
  const validTo = isValidDate(requestedTo);
  const dateRangeError = !validFrom || !validTo || requestedFrom > requestedTo;
  const fromDate = validFrom ? requestedFrom : monthStart;
  const toDate = validTo ? requestedTo : today;
  const search = typeof params.search === "string" ? params.search.trim().slice(0, 80) : "";
  const safeSearch = search.replace(/[^A-Za-z0-9\s_-]/g, "");
  const requestedStatus = typeof params.status === "string" ? params.status : "";
  const status = requestedStatus ? ATTENDANCE_STATUSES.find((item) => item === requestedStatus) : "all";
  if (!status) redirect(getProductAppPath("think-education", "/attendance/reports"));
  const requestedPage = Number.parseInt(typeof params.page === "string" ? params.page : "1", 10);
  const currentPage = Number.isFinite(requestedPage) ? Math.min(1_000_000, Math.max(1, requestedPage)) : 1;

  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const accessibleBranchIds = campuses.map((campus) => campus.id);
  const requestedBranch = typeof params.branch === "string" ? params.branch : "";
  const selectedBranch = accessibleBranchIds.includes(requestedBranch) ? requestedBranch : "";
  const branchIds = selectedBranch ? [selectedBranch] : accessibleBranchIds;
  const [canExport, canViewClasses] = await Promise.all([
    canTabPermission("education_attendance", "attendance", "register", "export"),
    canTabPermission("education_academics", "academics", "classes", "view"),
  ]);
  const supabase = await createClient();

  const classes: Array<{ id: string; name: string; branch_id: string }> = [];
  if (canViewClasses && branchIds.length) {
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase.from("education_classes")
        .select("id, name, branch_id")
        .eq("org_id", context.orgId)
        .in("branch_id", branchIds)
        .order("name")
        .order("id")
        .range(offset, offset + 499);
      if (error) throw new Error(`Could not load classes for the attendance report: ${error.message}`);
      classes.push(...(data ?? []));
      if (!data || data.length < 500) break;
    }
  }
  const requestedClass = typeof params.class === "string" ? params.class : "";
  const selectedClass = canViewClasses && classes.some((classroom) => classroom.id === requestedClass)
    ? requestedClass
    : "";
  const classNameById = new Map(classes.map((classroom) => [classroom.id, classroom.name]));
  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const classOptions = classes.map((classroom) => ({
    id: classroom.id,
    name: branchIds.length > 1
      ? `${classroom.name} - ${campusNameById.get(classroom.branch_id) ?? "Campus"}`
      : classroom.name,
  }));

  let totalCount = 0;
  let rows: ReturnType<typeof parseEducationAttendanceReportResult>["rows"] = [];
  let statusCounts: Record<EducationAttendanceStatus, number> = {
    present: 0,
    absent: 0,
    late: 0,
    excused: 0,
  };
  if (branchIds.length && !dateRangeError) {
    const { data, error } = await supabase.rpc("education_get_attendance_report_page", {
      p_org_id: context.orgId,
      p_branch_ids: branchIds,
      p_from: fromDate,
      p_to: toDate,
      p_search: safeSearch,
      p_class_id: selectedClass || null,
      p_status: status,
      p_page_size: PAGE_SIZE,
      p_offset: (currentPage - 1) * PAGE_SIZE,
    });
    if (error) throw new Error(`Could not load Think Education attendance report: ${error.message}`);
    const report = parseEducationAttendanceReportResult(data?.[0]);
    totalCount = report.totalCount;
    rows = report.rows;
    statusCounts = report.statusCounts;
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const reportParams = new URLSearchParams({ from: fromDate, to: toDate });
  if (search) reportParams.set("search", search);
  if (selectedBranch) reportParams.set("branch", selectedBranch);
  if (selectedClass) reportParams.set("class", selectedClass);
  if (status !== "all") reportParams.set("status", status);
  const reportQuery = reportParams.toString();
  const csvHref = `/api/education/attendance/report-export?${reportQuery}`;
  const pageHref = (page: number) => {
    const next = new URLSearchParams(reportParams);
    next.set("page", String(page));
    return `${getProductAppPath("think-education", "/attendance/reports")}?${next.toString()}`;
  };
  if (currentPage > totalPages) redirect(pageHref(totalPages));

  const allStatusRecords = ATTENDANCE_STATUSES.reduce((sum, item) => sum + statusCounts[item], 0);
  const presentRate = allStatusRecords ? Math.round((statusCounts.present / allStatusRecords) * 100) : 0;
  const filterSummary = [
    `${fromDate} to ${toDate}`,
    selectedBranch ? campusNameById.get(selectedBranch) : "All accessible campuses",
    selectedClass ? `Class: ${classNameById.get(selectedClass) ?? "Selected class"}` : null,
    status === "all" ? "All statuses" : status,
  ].filter(Boolean);

  return (
    <main className="mx-auto w-full max-w-[1680px] space-y-6 p-4 md:p-6 xl:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href={getProductAppPath("think-education", "/attendance")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
            <ArrowLeft className="h-4 w-4" /> Attendance register
          </Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Attendance Report</h1>
          <p className="mt-1 text-sm leading-6 text-slate-600">Review recorded attendance across a date range and export the filtered student-level records.</p>
        </div>
        {canExport && totalCount > 0 && <a href={csvHref} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Export CSV</a>}
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <form method="get" action={getProductAppPath("think-education", "/attendance/reports")} className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <label className="text-sm font-medium text-slate-700">From
            <input type="date" name="from" value={fromDate} max={toDate} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
          </label>
          <label className="text-sm font-medium text-slate-700">To
            <input type="date" name="to" value={toDate} min={fromDate} max={today} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
          </label>
          <label className="text-sm font-medium text-slate-700">Campus
            <select name="branch" defaultValue={selectedBranch} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal">
              <option value="">All assigned campuses</option>
              {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
            </select>
          </label>
          {canViewClasses && <label className="text-sm font-medium text-slate-700">Class
            <select name="class" defaultValue={selectedClass} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal">
              <option value="">All classes</option>
              {classOptions.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name}</option>)}
            </select>
          </label>}
          <label className="text-sm font-medium text-slate-700">Status
            <select name="status" defaultValue={status === "all" ? "" : status} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal">
              <option value="">All statuses</option>
              {ATTENDANCE_STATUSES.map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">Student
            <input type="search" name="search" defaultValue={search} maxLength={80} placeholder="Name or student number" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
          </label>
          <div className="flex items-end gap-2 xl:col-span-6">
            <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Run report</button>
            <span className="text-sm text-slate-500">{filterSummary.join(" | ")}</span>
          </div>
        </form>
      </section>

      {dateRangeError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">Choose valid dates and ensure the From date is not after the To date.</p>}

      <p className="text-xs text-slate-500">Status totals and present rate cover all statuses for the selected date, campus, class, and student filters; the table also applies the selected status.</p>

      <section data-education-metrics className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {[
          { label: "Matching records", value: totalCount },
          { label: "Present", value: statusCounts.present },
          { label: "Absent", value: statusCounts.absent },
          { label: "Late", value: statusCounts.late },
          { label: "Excused", value: statusCounts.excused },
          { label: "Present rate (of records)", value: `${presentRate}%` },
        ].map((metric) => (
          <article key={metric.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">{metric.label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-950">{typeof metric.value === "number" ? metric.value.toLocaleString() : metric.value}</p>
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {rows.length === 0 ? (
          <div className="p-8 text-center">
            <CalendarCheck className="mx-auto h-10 w-10 text-slate-300" />
            <h2 className="mt-3 font-semibold text-slate-900">No attendance records found</h2>
            <p className="mt-1 text-sm text-slate-500">Try another date range or adjust the filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Student ID</th><th className="px-4 py-3">Student</th><th className="px-4 py-3">Campus</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Note</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.attendance_id}>
                    <td className="whitespace-nowrap px-4 py-3">{new Date(`${row.attendance_date}T00:00:00`).toLocaleDateString()}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-blue-800">{row.student_number}</td>
                    <td className="px-4 py-3">{[row.first_name, row.other_names, row.last_name].filter(Boolean).join(" ")}</td>
                    <td className="px-4 py-3">{campusNameById.get(row.branch_id) ?? "Campus"}</td>
                    <td className="px-4 py-3 capitalize">{row.status.replace("_", " ")}</td>
                    <td className="px-4 py-3 text-slate-600">{row.note || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalCount > 0 && <footer className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
          <span className="text-slate-500">Showing {((currentPage - 1) * PAGE_SIZE) + 1}–{Math.min(currentPage * PAGE_SIZE, totalCount)} of {totalCount.toLocaleString()}</span>
          <div className="flex items-center gap-2">
            {currentPage > 1 && <Link href={pageHref(currentPage - 1)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 font-medium text-slate-700"><ArrowLeft className="h-4 w-4" /> Previous</Link>}
            <span className="text-slate-600">{currentPage} / {totalPages}</span>
            {currentPage < totalPages && <Link href={pageHref(currentPage + 1)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 font-medium text-slate-700">Next <ArrowRight className="h-4 w-4" /></Link>}
          </div>
        </footer>}
      </section>
    </main>
  );
}
