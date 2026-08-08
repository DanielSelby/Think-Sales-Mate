import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import {
  HrmDashboardView, type DashboardKpis, type PayrollHistoryPoint, type DistributionSlice,
  type EmployeePreviewRow, type UpcomingPayment, type HrActivity,
} from "@/components/hrm/hrm-dashboard-view";

export const metadata = { title: "HRM & Payroll · SalesMate ERP" };

const ACTIVITY_LABEL: Record<string, string> = {
  "employee.created": "New employee added",
  "payroll.processed": "Payroll processed",
};

export default async function HrmDashboardPage() {
  const context = await getCurrentOrgContext();
  if (!context) return null;

  const orgId = context.orgId;
  const supabase = createClient();

  const [{ data: employees }, { data: payrollRuns }] = await Promise.all([
    supabase.from("employees").select("*").eq("org_id", orgId).order("created_at", { ascending: false }),
    supabase.from("payroll_runs").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(6),
  ]);

  const rawEmployees = employees ?? [];
  const rawRuns = payrollRuns ?? [];

  const activeEmployees = rawEmployees.filter((e) => e.status === "active");
  const grossPayPreview = activeEmployees.reduce((sum, e) => sum + e.monthly_salary, 0);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const runsThisMonth = rawRuns.filter((r) => r.payment_date && new Date(r.payment_date) >= monthStart);

  const kpis: DashboardKpis = {
    totalEmployees: rawEmployees.length,
    totalPayrollThisMonth: runsThisMonth.reduce((sum, r) => sum + r.gross_pay, 0),
    netPayThisMonth: runsThisMonth.reduce((sum, r) => sum + r.net_pay, 0),
    deductionsThisMonth: runsThisMonth.reduce((sum, r) => sum + r.deductions, 0),
    pendingPayments: 0, // filled in below once we have item counts
  };

  const payrollHistory: PayrollHistoryPoint[] = [...rawRuns]
    .reverse()
    .map((r) => ({ label: r.payroll_type ? `${r.pay_period_start?.slice(5) ?? ""}` : r.period_label, gross: r.gross_pay, deductions: r.deductions, net: r.net_pay }));

  const latestRun = rawRuns[0] ?? null;
  const distribution: DistributionSlice[] = latestRun
    ? [
        { name: "Basic Pay", value: latestRun.gross_pay },
        { name: "Allowances", value: latestRun.allowances },
        { name: "Deductions", value: latestRun.deductions },
        { name: "Employer Cost", value: Math.max(0, latestRun.employer_cost - latestRun.gross_pay) },
      ].filter((d) => d.value > 0)
    : [];

  const employeesPreview: EmployeePreviewRow[] = rawEmployees.slice(0, 5).map((e) => ({
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
  }));

  // Upcoming payments: items from the most recent run whose payment date
  // hasn't arrived yet — the closest honest reading of "pending" available
  // from this data model.
  let upcomingPayments: UpcomingPayment[] = [];
  const upcomingRun = rawRuns.find((r) => r.payment_date && new Date(r.payment_date) >= now);
  if (upcomingRun) {
    const { data: items } = await supabase
      .from("payroll_run_items")
      .select("id, employee_name, amount")
      .eq("payroll_run_id", upcomingRun.id)
      .order("amount", { ascending: false })
      .limit(3);
    upcomingPayments = (items ?? []).map((i) => ({
      id: i.id,
      employeeName: i.employee_name,
      amount: i.amount,
      paymentDate: upcomingRun.payment_date!,
    }));

    const { count } = await supabase
      .from("payroll_run_items")
      .select("id", { count: "exact", head: true })
      .eq("payroll_run_id", upcomingRun.id);
    kpis.pendingPayments = count ?? 0;
  }

  const { data: activityLogs } = await supabase
    .from("audit_logs")
    .select("id, action, created_at")
    .eq("org_id", orgId)
    .in("entity_type", ["employees", "payroll_runs"])
    .order("created_at", { ascending: false })
    .limit(6);

  const recentActivity: HrActivity[] = (activityLogs ?? []).map((l) => ({
    id: l.id,
    label: ACTIVITY_LABEL[l.action] ?? l.action,
    createdAt: l.created_at,
  }));

  return (
    <HrmDashboardView
      kpis={kpis}
      payrollHistory={payrollHistory}
      distribution={distribution}
      employeesPreview={employeesPreview}
      totalEmployeeCount={rawEmployees.length}
      activeEmployeeCount={activeEmployees.length}
      grossPayPreview={grossPayPreview}
      currency={context.currency}
      upcomingPayments={upcomingPayments}
      recentActivity={recentActivity}
    />
  );
}