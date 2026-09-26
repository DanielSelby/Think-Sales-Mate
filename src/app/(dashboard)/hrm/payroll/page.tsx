import Link from "next/link";
import { CalendarDays, ChevronRight, FileText, Filter, Play, Search, WalletCards, Users } from "lucide-react";
import { cookies } from "next/headers";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { formatCurrency } from "@/lib/sales/format";
import { runPayroll } from "./actions";
import { PayrollKpi } from "@/components/hrm/payroll-kpi";
import { PayrollRecordsTable, type PayrollRecordRow } from "@/components/hrm/payroll/payroll-records-table";

type SearchParams = { month?: string; year?: string; branch?: string; department?: string; status?: string; payroll_type?: string; employee?: string; error?: string };

const monthName = (value: string) => new Date(`${value}-01T00:00:00Z`).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });

export default async function PayrollPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;
  if (!can(context.role, "hrm.view")) return <div className="mx-auto max-w-2xl rounded-xl border border-dashed border-ledger-200 bg-white p-10 text-center dark:border-ledger-700 dark:bg-ink-900"><p className="text-sm text-ledger-500">Payroll data is restricted to managers and above.</p></div>;

  const filters = await searchParams;
  const supabase = await createClient();
  const employeeBaseQuery = supabase.from("employees").select("id, employee_number, full_name, department, location_id, monthly_salary").eq("org_id", context.orgId).eq("status", "active").order("full_name");
  const locationBaseQuery = supabase.from("business_locations").select("id, name").eq("org_id", context.orgId).eq("is_active", true).order("name");
  const allowedLocationIds = context.isBranchScoped ? context.allowedLocationIds : null;
  const employeeQuery = allowedLocationIds
    ? allowedLocationIds.length ? employeeBaseQuery.in("location_id", allowedLocationIds) : employeeBaseQuery.eq("id", "00000000-0000-0000-0000-000000000000")
    : employeeBaseQuery;
  const locationQuery = allowedLocationIds
    ? allowedLocationIds.length ? locationBaseQuery.in("id", allowedLocationIds) : locationBaseQuery.eq("id", "00000000-0000-0000-0000-000000000000")
    : locationBaseQuery;
  const [{ data: employees }, { data: locations }] = await Promise.all([employeeQuery, locationQuery]);
  const { data: allRuns } = await supabase.from("payroll_runs").select("id, period_label, period_month, total_amount, employee_count, created_at, approval_status, status, payroll_type, deductions, allowances, net_pay, processed_by, payment_date, expense_id").eq("org_id", context.orgId).order("period_month", { ascending: false }).limit(500);
  const allRunIds = (allRuns ?? []).map((run) => run.id);
  const { data: allItems } = allRunIds.length ? await supabase.from("payroll_run_items").select("id, payroll_run_id, employee_id, employee_name, amount, basic_pay, deductions, net_pay, payment_status, paid_at").in("payroll_run_id", allRunIds).order("employee_name") : { data: [] };
  const locationNames = new Map((locations ?? []).map((location) => [location.id, location.name]));
  const employeeMap = new Map((employees ?? []).map((employee) => [employee.id, employee]));
  const runMap = new Map((allRuns ?? []).map((run) => [run.id, run]));
  const filteredRuns = (allRuns ?? []).filter((run) =>
    (!filters.month || run.period_month?.slice(0, 7) === filters.month)
    && (!filters.year || run.period_month?.slice(0, 4) === filters.year)
    && (!filters.payroll_type || run.payroll_type === filters.payroll_type),
  );
  const filteredRunIds = new Set(filteredRuns.map((run) => run.id));
  const { data: payslipRows } = filteredRuns.length ? await supabase.from("payslips").select("id, payroll_run_id, employee_id").eq("org_id", context.orgId).in("payroll_run_id", filteredRuns.map((run) => run.id)) : { data: [] };
  const payslipMap = new Map((payslipRows ?? []).map((payslip) => [`${payslip.payroll_run_id}:${payslip.employee_id}`, payslip.id]));
  const filteredItems = (allItems ?? []).filter((item) => {
    const employee = employeeMap.get(item.employee_id ?? "");
    const run = runMap.get(item.payroll_run_id);
    const paymentStatus = item.payment_status ?? "pending";
    const status = paymentStatus === "paid" ? "paid" : paymentStatus === "partially_paid" ? "partially_paid" : run?.status === "processing" ? "processing" : "pending";
    return filteredRunIds.has(item.payroll_run_id)
      && (allowedLocationIds === null || employeeMap.has(item.employee_id ?? ""))
      && (!filters.department || employee?.department === filters.department)
      && (!filters.branch || employee?.location_id === filters.branch)
      && (!filters.employee || `${item.employee_name} ${employeeMap.get(item.employee_id ?? "")?.employee_number ?? ""}`.toLowerCase().includes(filters.employee.trim().toLowerCase()))
      && (!filters.status || status === filters.status);
  });
  const currentRun = filteredRuns[0];
  const totalPayroll = filteredItems.reduce((sum, item) => sum + Number(item.net_pay ?? item.amount), 0);
  const deductions = filteredItems.reduce((sum, item) => sum + Number(item.deductions ?? 0), 0);
  const grossPayrollAmount = filteredItems.reduce((sum, item) => {
    const run = runMap.get(item.payroll_run_id);
    const allowanceShare = Number(run?.allowances ?? 0) / Math.max(Number(run?.employee_count ?? 1), 1);
    return sum + Number(item.basic_pay ?? item.amount) + allowanceShare;
  }, 0);
  const paidEmployees = filteredItems.filter((item) => item.payment_status === "paid").length;
  const pendingEmployees = filteredItems.filter((item) => item.payment_status !== "paid").length;
  const monthOptions = Array.from(new Set((allRuns ?? []).map((run) => run.period_month?.slice(0, 7)).filter(Boolean))) as string[];
  const yearOptions = Array.from(new Set((allRuns ?? []).map((run) => run.period_month?.slice(0, 4)).filter(Boolean))) as string[];
  const departmentOptions = Array.from(new Set((employees ?? []).map((employee) => employee.department).filter(Boolean))) as string[];
  const canManage = can(context.role, "hrm.manage");
  const matchingEmployees = (employees ?? []).filter((employee) =>
    (!filters.branch || employee.location_id === filters.branch)
    && (!filters.department || employee.department === filters.department)
    && (!filters.employee || `${employee.full_name} ${employee.employee_number ?? ""}`.toLowerCase().includes(filters.employee.trim().toLowerCase())),
  );
  const rows: PayrollRecordRow[] = filteredItems.map((item) => {
    const employee = employeeMap.get(item.employee_id ?? "");
    const run = runMap.get(item.payroll_run_id);
    const paymentStatus = item.payment_status ?? "pending";
    const status: PayrollRecordRow["status"] = paymentStatus === "paid"
      ? "Paid"
      : paymentStatus === "partially_paid"
        ? "Partially Paid"
        : run?.status === "processing" ? "Processing" : "Pending";
    const payrollRun = run!;
    return {
      id: item.id,
      runId: item.payroll_run_id,
      payrollDate: payrollRun.payment_date ? new Date(payrollRun.payment_date).toLocaleDateString() : new Date(payrollRun.created_at).toLocaleDateString(),
      salaryMonth: payrollRun.period_month ? monthName(payrollRun.period_month.slice(0, 7)) : payrollRun.period_label,
      employeeId: employee?.employee_number ? `EMP-${employee.employee_number}` : "—",
      employeeName: item.employee_name,
      branch: locationNames.get(employee?.location_id ?? "") ?? "—",
      department: employee?.department ?? "—",
      basicSalary: Number(item.basic_pay ?? item.amount),
      allowances: Number(payrollRun.allowances ?? 0) / Math.max(Number(payrollRun.employee_count ?? 1), 1),
      deductions: Number(item.deductions ?? 0),
      netSalary: Number(item.net_pay ?? item.amount),
      status,
      approvalStatus: payrollRun.approval_status,
      payslipId: payslipMap.get(`${item.payroll_run_id}:${item.employee_id}`) ?? null,
      canEdit: payrollRun.approval_status !== "approved" && payrollRun.status !== "completed",
    };
  });

  return (
    <div className="mx-auto max-w-[1680px] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#dce8f2] bg-white p-4 shadow-sm dark:border-ledger-700 dark:bg-ink-900">
          <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl text-white" style={{ backgroundColor: "var(--theme-primary)" }}><WalletCards className="h-6 w-6" /></div><div><div className="mb-1 text-[11px] font-semibold text-[var(--theme-primary)]">HRM &amp; Payroll <span className="mx-1 text-slate-300">›</span> Payroll</div><h1 className="text-xl font-bold text-[#12345a] dark:text-white">Payroll</h1><p className="text-xs text-ledger-500">Manage employee salaries, generate payslips and track payroll records.</p></div></div>
          {canManage && <form action={runPayroll}><button type="submit" className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold text-white shadow-sm" style={{ backgroundColor: "var(--theme-primary)" }}><Play className="h-4 w-4" />Generate Payroll</button></form>}
        </div>
        {filters.error && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{filters.error}</span>
            {filters.error.toLowerCase().includes("account") && (
              <Link href="/accounting?tab=coa" className="inline-flex items-center rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100">
                Open Chart of Accounts
              </Link>
            )}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <PayrollKpi icon={<Users className="h-4 w-4" />} label="Total Employees" value={String(matchingEmployees.length)} tone="blue" />
          <PayrollKpi icon={<WalletCards className="h-4 w-4" />} label="Total Payroll Amount" value={formatCurrency(grossPayrollAmount, context.currency)} tone="green" />
          <PayrollKpi icon={<CalendarDays className="h-4 w-4" />} label="Paid Employees" value={String(paidEmployees)} tone="teal" />
          <PayrollKpi icon={<CalendarDays className="h-4 w-4" />} label="Pending Payments" value={String(pendingEmployees)} tone="orange" />
          <PayrollKpi icon={<Filter className="h-4 w-4" />} label="Payroll Deductions" value={formatCurrency(deductions, context.currency)} tone="purple" />
          <PayrollKpi icon={<WalletCards className="h-4 w-4" />} label="Net Salary Payable" value={formatCurrency(totalPayroll, context.currency)} tone="blue" />
        </div>

        <form method="get" className="grid gap-3 rounded-xl border border-[#dce8f2] bg-white p-3 shadow-sm dark:border-ledger-700 dark:bg-ink-900 md:grid-cols-3 xl:grid-cols-7">
          <label className="text-[10px] font-semibold text-slate-500">Payroll Month<select name="month" defaultValue={filters.month ?? ""} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-ledger-700 dark:bg-ink-950"><option value="">All months</option>{monthOptions.map((month) => <option key={month} value={month}>{monthName(month)}</option>)}</select></label>
          <label className="text-[10px] font-semibold text-slate-500">Payroll Year<select name="year" defaultValue={filters.year ?? ""} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-ledger-700 dark:bg-ink-950"><option value="">All years</option>{yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
          <label className="text-[10px] font-semibold text-slate-500">Branch<select name="branch" defaultValue={filters.branch ?? ""} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-ledger-700 dark:bg-ink-950"><option value="">All branches</option>{(locations ?? []).map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
          <label className="text-[10px] font-semibold text-slate-500">Department<select name="department" defaultValue={filters.department ?? ""} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-ledger-700 dark:bg-ink-950"><option value="">All departments</option>{departmentOptions.map((department) => <option key={department} value={department}>{department}</option>)}</select></label>
          <label className="text-[10px] font-semibold text-slate-500">Payment Status<select name="status" defaultValue={filters.status ?? ""} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-ledger-700 dark:bg-ink-950"><option value="">All statuses</option><option value="paid">Paid</option><option value="pending">Pending</option><option value="partially_paid">Partially Paid</option><option value="processing">Processing</option></select></label>
          <label className="text-[10px] font-semibold text-slate-500">Payroll Type<select name="payroll_type" defaultValue={filters.payroll_type ?? ""} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-ledger-700 dark:bg-ink-950"><option value="">All types</option><option value="Monthly">Monthly</option><option value="Weekly">Weekly</option><option value="Contract">Contract</option></select></label>
          <label className="text-[10px] font-semibold text-slate-500">Search Employee<div className="relative mt-1"><Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" /><input name="employee" defaultValue={filters.employee} placeholder="Name or employee ID..." className="h-9 w-full rounded-md border border-slate-200 pl-8 pr-2 text-xs dark:border-ledger-700 dark:bg-ink-950" /></div></label>
          <div className="flex items-end gap-2"><button type="submit" className="h-9 flex-1 rounded-md px-3 text-xs font-semibold text-white" style={{ backgroundColor: "var(--theme-primary)" }}>Apply Filter</button><Link href="/hrm/payroll" className="inline-flex h-9 items-center rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-600 dark:border-ledger-700 dark:text-slate-300">Reset</Link></div>
        </form>

        <section className="overflow-hidden rounded-xl border border-[#dce8f2] bg-white shadow-sm dark:border-ledger-700 dark:bg-ink-900">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 dark:border-ledger-700"><div><h2 className="font-bold text-[#12345a] dark:text-white">Payroll Records</h2><p className="text-xs text-slate-500">Showing {filteredItems.length} employee records across {filteredRuns.length} payroll runs.</p></div><div className="flex gap-2"><Link href="/accounting/expenses" className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 dark:border-ledger-700 dark:text-slate-300"><WalletCards className="h-3.5 w-3.5" />Salary Expenses</Link><Link href="/hrm/payslips" className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 dark:border-ledger-700 dark:text-slate-300"><FileText className="h-3.5 w-3.5" />Payslip Generated</Link>{currentRun && <Link href={`/hrm/payroll/${currentRun.id}`} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 dark:border-ledger-700 dark:text-slate-300">Latest run <ChevronRight className="h-3.5 w-3.5" /></Link>}</div></div>
          <PayrollRecordsTable rows={rows} currency={context.currency} canManage={canManage} />
        </section>
    </div>
  );
}
