import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import {
  EmployeeListView, type EmployeeKpis, type EmploymentTypeSlice, type DepartmentSlice, type RecentHire,
} from "@/components/hrm/employees/employee-list-view";
import { deriveEmployeeStatus } from "@/lib/hrm/format";
import type { EmploymentType } from "@/types/database";

export const metadata = { title: "Employees · SalesMate ERP" };

export default async function EmployeesPage() {
  const context = await getCurrentOrgContext();
  if (!context) return null;

  const orgId = context.orgId;
  const supabase = await createClient();

  const { data: employees } = await supabase.from("employees").select("*").eq("org_id", orgId).order("full_name");
  const rows = (employees ?? []).map((e) => ({
    id: e.id,
    name: e.full_name,
    email: e.email,
    employeeNumber: e.employee_number,
    department: e.department,
    jobTitle: e.job_title,
    employmentType: e.employment_type,
    monthlySalary: e.monthly_salary,
    status: e.status,
    onLeaveUntil: e.on_leave_until,
    hireDate: e.hire_date,
  }));

  const withStatus = rows.map((r) => ({ ...r, displayStatus: deriveEmployeeStatus(r.status, r.onLeaveUntil) }));

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const departments = Array.from(new Set(rows.map((r) => r.department).filter(Boolean))) as string[];

  const kpis: EmployeeKpis = {
    totalEmployees: rows.length,
    activeEmployees: withStatus.filter((r) => r.displayStatus === "active").length,
    onLeave: withStatus.filter((r) => r.displayStatus === "on_leave").length,
    departmentCount: departments.length,
    newHiresThisMonth: rows.filter((r) => new Date(r.hireDate) >= monthStart).length,
  };

  const typeOrder: EmploymentType[] = ["full_time", "part_time", "contract", "intern"];
  const employmentOverview: EmploymentTypeSlice[] = typeOrder
    .map((type) => ({ type, count: rows.filter((r) => r.employmentType === type).length }))
    .filter((t) => t.count > 0);

  const deptCounts = new Map<string, number>();
  for (const r of rows) if (r.department) deptCounts.set(r.department, (deptCounts.get(r.department) ?? 0) + 1);
  const departmentDistribution: DepartmentSlice[] = Array.from(deptCounts.entries())
    .map(([department, count]) => ({ department, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const recentHires: RecentHire[] = [...rows]
    .sort((a, b) => new Date(b.hireDate).getTime() - new Date(a.hireDate).getTime())
    .slice(0, 5)
    .map((r) => ({ id: r.id, name: r.name, jobTitle: r.jobTitle, hireDate: r.hireDate }));

  return (
    <EmployeeListView
      employees={rows}
      kpis={kpis}
      currency={context.currency}
      departments={departments}
      employmentOverview={employmentOverview}
      departmentDistribution={departmentDistribution}
      recentHires={recentHires}
    />
  );
}