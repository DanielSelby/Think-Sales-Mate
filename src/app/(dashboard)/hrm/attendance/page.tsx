import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { AttendanceListView, type AttendanceRow, type AttendanceKpis, type LateArrival, type AttendanceActivity } from "@/components/hrm/attendance/attendance-list-view";
import { getCurrentEmployeeMatch } from "@/app/(dashboard)/hrm/attendance/actions";
import { isLateCheckIn } from "@/lib/hrm/attendance";

export const metadata = { title: "Attendance · SalesMate ERP" };

const ACTIVITY_LABEL: Record<string, string> = {
  "attendance.corrected": "Attendance corrected",
};

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const context = await getCurrentOrgContext();
  if (!context) return null;

  const { date: dateParam } = await searchParams;
  const date = dateParam ?? new Date().toISOString().slice(0, 10);

  const orgId = context.orgId;
  const supabase = await createClient();

  const [{ data: employees }, { data: records }, currentEmployee] = await Promise.all([
    supabase.from("employees").select("id, full_name, department, job_title, status").eq("org_id", orgId).eq("status", "active").order("full_name"),
    supabase.from("attendance_records").select("*").eq("org_id", orgId).eq("work_date", date),
    getCurrentEmployeeMatch(),
  ]);

  const rawEmployees = employees ?? [];
  const recordByEmployee = new Map((records ?? []).map((r) => [r.employee_id, r]));

  const rows: AttendanceRow[] = rawEmployees.map((e) => {
    const record = recordByEmployee.get(e.id);
    return {
      recordId: record?.id ?? null,
      employeeId: e.id,
      employeeName: e.full_name,
      department: e.department,
      checkIn: record?.check_in ?? null,
      checkOut: record?.check_out ?? null,
      totalHours: record?.total_hours ?? 0,
      status: record?.status ?? "absent",
      workType: record?.work_type ?? "Office",
    };
  });

  const kpis: AttendanceKpis = {
    totalEmployees: rawEmployees.length,
    present: rows.filter((r) => r.status === "present").length,
    absent: rows.filter((r) => r.status === "absent").length,
    late: rows.filter((r) => r.status === "late").length,
    earlyLeave: rows.filter((r) => r.status === "early_leave").length,
  };

  const departments = Array.from(new Set(rawEmployees.map((e) => e.department).filter(Boolean))) as string[];

  const lateArrivals: LateArrival[] = rows
    .filter((r) => r.checkIn && isLateCheckIn(r.checkIn))
    .map((r) => ({
      employeeName: r.employeeName,
      checkIn: r.checkIn!,
      jobTitle: rawEmployees.find((e) => e.id === r.employeeId)?.job_title ?? null,
    }))
    .sort((a, b) => new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime())
    .slice(0, 6);

  const { data: activityLogs } = await supabase
    .from("audit_logs")
    .select("id, action, metadata, created_at")
    .eq("org_id", orgId)
    .eq("entity_type", "attendance_records")
    .order("created_at", { ascending: false })
    .limit(6);

  const recentActivity: AttendanceActivity[] = (activityLogs ?? []).map((l) => ({
    id: l.id,
    label: ACTIVITY_LABEL[l.action] ?? l.action,
    createdAt: l.created_at,
  }));

  return (
    <AttendanceListView
      date={date}
      rows={rows}
      kpis={kpis}
      departments={departments}
      employeeOptions={rawEmployees.map((e) => ({ id: e.id, name: e.full_name }))}
      currentEmployee={currentEmployee}
      lateArrivals={lateArrivals}
      recentActivity={recentActivity}
    />
  );
}