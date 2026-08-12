import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import {
  LeaveListView, type LeaveRequestRow, type LeaveKpis, type BalanceBucketSlice,
  type LeaveTypeSummarySlice, type UpcomingLeave, type CalendarLeaveDay,
} from "@/components/hrm/leave/leave-list-view";
import { ensureLeaveTypes } from "@/app/(dashboard)/hrm/leave/actions";
import { deriveBalanceBucket, type BalanceBucket } from "@/lib/hrm/leave";

export const metadata = { title: "Leave Management · SalesMate ERP" };

export default async function LeaveManagementPage() {
  const context = await getCurrentOrgContext();
  if (!context) return null;

  const orgId = context.orgId;
  const supabase = await createClient();
  const leaveTypes = await ensureLeaveTypes();

  const [{ data: employees }, { data: requests }] = await Promise.all([
    supabase.from("employees").select("id, full_name, department, status").eq("org_id", orgId).eq("status", "active"),
    supabase
      .from("leave_requests")
      .select("id, employee_id, leave_type_id, start_date, end_date, duration_days, status, applied_on")
      .eq("org_id", orgId)
      .order("applied_on", { ascending: false }),
  ]);

  const rawEmployees = employees ?? [];
  const rawRequests = requests ?? [];
  const employeeById = new Map(rawEmployees.map((e) => [e.id, e]));
  const leaveTypeById = new Map(leaveTypes.map((t) => [t.id, t.name]));

  const rows: LeaveRequestRow[] = rawRequests
    .filter((r) => employeeById.has(r.employee_id))
    .map((r) => {
      const emp = employeeById.get(r.employee_id)!;
      return {
        id: r.id,
        employeeName: emp.full_name,
        department: emp.department,
        leaveTypeName: leaveTypeById.get(r.leave_type_id) ?? "—",
        startDate: r.start_date,
        endDate: r.end_date,
        durationDays: r.duration_days,
        status: r.status,
        appliedOn: r.applied_on,
      };
    });

  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const kpis: LeaveKpis = {
    totalEmployees: rawEmployees.length,
    onLeaveToday: rawRequests.filter((r) => r.status === "approved" && r.start_date <= today && r.end_date >= today).length,
    pendingRequests: rows.filter((r) => r.status === "pending").length,
    approvedThisMonth: rows.filter((r) => r.status === "approved" && new Date(r.appliedOn) >= monthStart).length,
    rejectedThisMonth: rows.filter((r) => r.status === "rejected" && new Date(r.appliedOn) >= monthStart).length,
  };

  const departments = Array.from(new Set(rawEmployees.map((e) => e.department).filter(Boolean))) as string[];

  // Balance overview
  const year = now.getFullYear();
  const { data: balances } = await supabase.from("leave_balances").select("employee_id, allocated_days, used_days").eq("org_id", orgId).eq("year", year);
  const balanceByEmployee = new Map((balances ?? []).map((b) => [b.employee_id, b]));
  const bucketCounts = new Map<BalanceBucket, number>();
  for (const e of rawEmployees) {
    const bal = balanceByEmployee.get(e.id) ?? { allocated_days: 21, used_days: 0 };
    const bucket = deriveBalanceBucket(bal.allocated_days, bal.used_days);
    bucketCounts.set(bucket, (bucketCounts.get(bucket) ?? 0) + 1);
  }
  const bucketOrder: BalanceBucket[] = ["full", "partial", "low", "none"];
  const balanceOverview: BalanceBucketSlice[] = bucketOrder
    .map((bucket) => ({ bucket, count: bucketCounts.get(bucket) ?? 0 }))
    .filter((b) => b.count > 0);

  // Leave type summary (this month, by applied_on)
  const typeCounts = new Map<string, number>();
  for (const r of rows) {
    if (new Date(r.appliedOn) >= monthStart) typeCounts.set(r.leaveTypeName, (typeCounts.get(r.leaveTypeName) ?? 0) + 1);
  }
  const typeSummary: LeaveTypeSummarySlice[] = Array.from(typeCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  // Upcoming leaves (approved, starting today or later)
  const upcomingLeaves: UpcomingLeave[] = rows
    .filter((r) => r.status === "approved" && r.startDate >= today)
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
    .slice(0, 5)
    .map((r) => ({ id: r.id, employeeName: r.employeeName, leaveTypeName: r.leaveTypeName, startDate: r.startDate, endDate: r.endDate }));

  // Calendar: every day covered by an approved request, mapped to the
  // employees on leave that day (for the current + adjacent months)
  const calendarMap = new Map<string, string[]>();
  for (const r of rows.filter((r) => r.status === "approved")) {
    const d = new Date(r.startDate);
    const end = new Date(r.endDate);
    while (d <= end) {
      const iso = d.toISOString().slice(0, 10);
      const list = calendarMap.get(iso) ?? [];
      list.push(r.employeeName);
      calendarMap.set(iso, list);
      d.setDate(d.getDate() + 1);
    }
  }
  const calendarDays: CalendarLeaveDay[] = Array.from(calendarMap.entries()).map(([date, employeeNames]) => ({ date, employeeNames }));

  return (
    <LeaveListView
      requests={rows}
      kpis={kpis}
      departments={departments}
      leaveTypes={leaveTypes}
      employees={rawEmployees.map((e) => ({ id: e.id, name: e.full_name }))}
      balanceOverview={balanceOverview}
      typeSummary={typeSummary}
      upcomingLeaves={upcomingLeaves}
      calendarDays={calendarDays}
    />
  );
}