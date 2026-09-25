import Link from "next/link";
import type { ReactNode } from "react";
import { CalendarDays, CheckCircle2, ChevronRight, Download, Eye, FileText, Filter, Pencil, Play, Printer, Search, WalletCards, Users } from "lucide-react";
import { cookies } from "next/headers";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { formatCurrency } from "@/lib/sales/format";
import { runPayroll } from "./actions";
import { approvePayrollRunFromForm, markPayrollItemPaid } from "./approval-actions";

type SearchParams = { month?: string; year?: string; branch?: string; department?: string; status?: string; payroll_type?: string; employee?: string; error?: string };

const monthName = (value: string) => new Date(`${value}-01T00:00:00Z`).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });

export default async function PayrollPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;
  if (!can(context.role, "hrm.view")) return <div className="mx-auto max-w-2xl rounded-xl border border-dashed border-ledger-200 bg-white p-10 text-center dark:border-ledger-700 dark:bg-ink-900"><p className="text-sm text-ledger-500">Payroll data is restricted to managers and above.</p></div>;

  const filters = await searchParams;
  const supabase = await createClient();
  const [{ data: employees }, { data: departments }, { data: locations }] = await Promise.all([
    supabase.from("employees").select("id, employee_number, full_name, department, location_id, monthly_salary").eq("org_id", context.orgId).eq("status", "active").order("full_name"),
    supabase.from("employees").select("department").eq("org_id", context.orgId).not("department", "is", null).order("department"),
    supabase.from("business_locations").select("id, name").eq("org_id", context.orgId).eq("is_active", true).order("name")
  ]);
  let query = supabase.from("payroll_runs").select("id, period_label, period_month, total_amount, employee_count, created_at, approval_status, status, payroll_type, deductions, allowances, net_pay, processed_by, payment_date, expense_id").eq("org_id", context.orgId).order("period_month", { ascending: false });
  if (filters.month) query = query.eq("period_month", `${filters.month}-01`);
  if (filters.year && /^\d{4}$/.test(filters.year)) query = query.gte("period_month", `${filters.year}-01-01`).lt("period_month", `${Number(filters.year) + 1}-01-01`);
  if (filters.status === "approved" || filters.status === "pending") query = query.eq("approval_status", filters.status);
  if (filters.payroll_type) query = query.eq("payroll_type", filters.payroll_type);
  const { data: runs } = await query;
  const runIds = (runs ?? []).map((run) => run.id);
  const { data: items } = runIds.length ? await supabase.from("payroll_run_items").select("id, payroll_run_id, employee_id, employee_name, amount, basic_pay, deductions, net_pay, payment_status, paid_at").in("payroll_run_id", runIds).order("employee_name") : { data: [] };
  const { data: payslipRows } = runIds.length ? await supabase.from("payslips").select("id, payroll_run_id, employee_id").eq("org_id", context.orgId).in("payroll_run_id", runIds) : { data: [] };
  const locationNames = new Map((locations ?? []).map((location) => [location.id, location.name]));
  const employeeMap = new Map((employees ?? []).map((employee) => [employee.id, employee]));
  const payslipMap = new Map((payslipRows ?? []).map((payslip) => [`${payslip.payroll_run_id}:${payslip.employee_id}`, payslip.id]));
  const filteredItems = (items ?? []).filter((item) => {
    const employee = employeeMap.get(item.employee_id ?? "");
    const run = runs?.find((entry) => entry.id === item.payroll_run_id);
    return (!filters.department || employee?.department === filters.department)
      && (!filters.branch || employee?.location_id === filters.branch)
      && (!filters.payroll_type || run?.payroll_type === filters.payroll_type);
  }).filter((item) => !filters.employee || `${item.employee_name} ${employeeMap.get(item.employee_id ?? "")?.employee_number ?? ""}`.toLowerCase().includes(filters.employee.toLowerCase()));
  const currentRun = runs?.[0];
  const totalPayroll = (runs ?? []).reduce((sum, run) => sum + Number(run.total_amount), 0);
  const deductions = (runs ?? []).reduce((sum, run) => sum + Number(run.deductions ?? 0), 0);
  const paidEmployees = (items ?? []).filter((item) => item.payment_status === "paid").length;
  const pendingEmployees = (items ?? []).filter((item) => item.payment_status !== "paid").length;
  const departmentsCovered = new Set(filteredItems.map((item) => employeeMap.get(item.employee_id ?? "")?.department).filter(Boolean)).size;
  const monthOptions = Array.from(new Set((runs ?? []).map((run) => run.period_month?.slice(0, 7)).filter(Boolean))) as string[];
  const yearOptions = Array.from(new Set((runs ?? []).map((run) => run.period_month?.slice(0, 4)).filter(Boolean))) as string[];
  const departmentOptions = Array.from(new Set((departments ?? []).map((row) => row.department).filter(Boolean))) as string[];
  const canManage = can(context.role, "hrm.manage");

  return (
    <div className="min-h-full bg-[#f4f8fc] px-4 py-5 dark:bg-ink-950 md:px-6">
      <div className="mx-auto max-w-[1680px] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#dce8f2] bg-white p-4 shadow-sm dark:border-ledger-700 dark:bg-ink-900">
          <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl text-white" style={{ backgroundColor: "var(--theme-primary)" }}><WalletCards className="h-6 w-6" /></div><div><div className="mb-1 text-[11px] font-semibold text-[var(--theme-primary)]">HRM &amp; Payroll <span className="mx-1 text-slate-300">›</span> Payroll</div><h1 className="text-xl font-bold text-[#12345a] dark:text-white">Payroll</h1><p className="text-xs text-ledger-500">Manage employee salaries, generate payslips and track payroll records.</p></div></div>
          {canManage && <form action={runPayroll}><button type="submit" className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold text-white shadow-sm" style={{ backgroundColor: "var(--theme-primary)" }}><Play className="h-4 w-4" />Generate Payroll</button></form>}
        </div>
        {filters.error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{filters.error}</div>}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <Kpi icon={<Users />} label="Total Employees" value={String(employees?.length ?? 0)} tone="blue" />
          <Kpi icon={<WalletCards />} label="Total Payroll Amount" value={formatCurrency(totalPayroll, context.currency)} tone="green" />
          <Kpi icon={<CheckCircle2 />} label="Paid Employees" value={String(paidEmployees)} tone="teal" />
          <Kpi icon={<CalendarDays />} label="Pending Payments" value={String(pendingEmployees)} tone="orange" />
          <Kpi icon={<Filter />} label="Payroll Deductions" value={formatCurrency(deductions, context.currency)} tone="purple" />
          <Kpi icon={<WalletCards />} label="Net Salary Payable" value={formatCurrency(totalPayroll - deductions, context.currency)} tone="blue" />
        </div>

        <form method="get" className="grid gap-3 rounded-xl border border-[#dce8f2] bg-white p-3 shadow-sm dark:border-ledger-700 dark:bg-ink-900 md:grid-cols-3 xl:grid-cols-7">
          <label className="text-[10px] font-semibold text-slate-500">Payroll Month<select name="month" defaultValue={filters.month ?? ""} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-ledger-700 dark:bg-ink-950"><option value="">All months</option>{monthOptions.map((month) => <option key={month} value={month}>{monthName(month)}</option>)}</select></label>
          <label className="text-[10px] font-semibold text-slate-500">Payroll Year<select name="year" defaultValue={filters.year ?? ""} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-ledger-700 dark:bg-ink-950"><option value="">All years</option>{yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
          <label className="text-[10px] font-semibold text-slate-500">Branch<select name="branch" defaultValue={filters.branch ?? ""} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-ledger-700 dark:bg-ink-950"><option value="">All branches</option>{(locations ?? []).map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
          <label className="text-[10px] font-semibold text-slate-500">Department<select name="department" defaultValue={filters.department ?? ""} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-ledger-700 dark:bg-ink-950"><option value="">All departments</option>{departmentOptions.map((department) => <option key={department} value={department}>{department}</option>)}</select></label>
          <label className="text-[10px] font-semibold text-slate-500">Payment Status<select name="status" defaultValue={filters.status ?? ""} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-ledger-700 dark:bg-ink-950"><option value="">All statuses</option><option value="approved">Paid</option><option value="pending">Pending</option></select></label>
          <label className="text-[10px] font-semibold text-slate-500">Payroll Type<select name="payroll_type" defaultValue={filters.payroll_type ?? ""} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-ledger-700 dark:bg-ink-950"><option value="">All types</option><option value="Monthly">Monthly</option><option value="Weekly">Weekly</option><option value="Contract">Contract</option></select></label>
          <label className="text-[10px] font-semibold text-slate-500">Search Employee<div className="relative mt-1"><Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" /><input name="employee" defaultValue={filters.employee} placeholder="Name or employee ID..." className="h-9 w-full rounded-md border border-slate-200 pl-8 pr-2 text-xs dark:border-ledger-700 dark:bg-ink-950" /></div></label>
          <div className="flex items-end gap-2"><button type="submit" className="h-9 flex-1 rounded-md px-3 text-xs font-semibold text-white" style={{ backgroundColor: "var(--theme-primary)" }}>Apply Filter</button><Link href="/hrm/payroll" className="inline-flex h-9 items-center rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-600 dark:border-ledger-700 dark:text-slate-300">Reset</Link><button type="button" className="inline-flex h-9 items-center gap-1 rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-600 dark:border-ledger-700 dark:text-slate-300"><Download className="h-3.5 w-3.5" />Export</button></div>
        </form>

        <section className="overflow-hidden rounded-xl border border-[#dce8f2] bg-white shadow-sm dark:border-ledger-700 dark:bg-ink-900">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 dark:border-ledger-700"><div><h2 className="font-bold text-[#12345a] dark:text-white">Payroll Records</h2><p className="text-xs text-slate-500">Showing {filteredItems.length} employee records across {runs?.length ?? 0} payroll runs.</p></div><div className="flex gap-2"><Link href="/accounting/expenses" className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 dark:border-ledger-700 dark:text-slate-300"><WalletCards className="h-3.5 w-3.5" />Salary Expenses</Link><Link href="/hrm/payslips" className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 dark:border-ledger-700 dark:text-slate-300"><FileText className="h-3.5 w-3.5" />Payslip Generated</Link>{currentRun && <Link href={`/hrm/payroll/${currentRun.id}`} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 dark:border-ledger-700 dark:text-slate-300">Latest run <ChevronRight className="h-3.5 w-3.5" /></Link>}</div></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[1250px] text-left text-xs"><thead className="sticky top-0 z-10 bg-[#eef6ff] text-[10px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3"><input type="checkbox" aria-label="Select all payroll records" /></th>{["Payroll Date", "Salary Month", "Employee ID", "Employee Name", "Branch", "Department", "Basic Salary", "Allowances", "Deductions", "Net Salary", "Payment Status", "Actions"].map((heading) => <th key={heading} className="border-b border-slate-200 px-3 py-3">{heading}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-ledger-700">{filteredItems.map((item) => { const employee = employeeMap.get(item.employee_id ?? ""); const run = runs?.find((entry) => entry.id === item.payroll_run_id); const payslipId = payslipMap.get(`${item.payroll_run_id}:${item.employee_id}`); const status = item.payment_status === "paid" ? "Paid" : run?.status === "processing" ? "Processing" : "Pending"; return <tr key={item.id} className="hover:bg-blue-50/40 dark:hover:bg-slate-800/40"><td className="px-3 py-3"><input type="checkbox" aria-label={`Select ${item.employee_name}`} /></td><td className="px-3 py-3 text-slate-500">{run?.payment_date ? new Date(run.payment_date).toLocaleDateString() : new Date(run?.created_at ?? "").toLocaleDateString()}</td><td className="px-3 py-3">{run?.period_month ? monthName(run.period_month.slice(0, 7)) : "—"}</td><td className="px-3 py-3 font-mono text-[11px]">{employee?.employee_number ? `EMP-${employee.employee_number}` : "—"}</td><td className="px-3 py-3 font-semibold text-[#12345a] dark:text-white">{item.employee_name}</td><td className="px-3 py-3">{locationNames.get(employee?.location_id ?? "") ?? "—"}</td><td className="px-3 py-3">{employee?.department ?? "—"}</td><td className="px-3 py-3 font-semibold">{formatCurrency(Number(item.basic_pay ?? item.amount), context.currency)}</td><td className="px-3 py-3">{formatCurrency(Number(run?.allowances ?? 0) / Math.max(Number(run?.employee_count ?? 1), 1), context.currency)}</td><td className="px-3 py-3">{formatCurrency(Number(item.deductions ?? 0), context.currency)}</td><td className="px-3 py-3 font-bold">{formatCurrency(Number(item.net_pay ?? item.amount), context.currency)}</td><td className="px-3 py-3"><StatusBadge status={status} /></td><td className="px-3 py-3"><div className="flex items-center gap-1">{payslipId && <Link href={`/hrm/payslips/${payslipId}`} title="View payslip" className="rounded-md border border-slate-200 p-1.5 text-[var(--theme-primary)]"><Eye className="h-3.5 w-3.5" /></Link>}{payslipId && <Link href={`/hrm/payslips/${payslipId}`} title="Print payslip" className="rounded-md border border-slate-200 p-1.5 text-[var(--theme-primary)]"><Printer className="h-3.5 w-3.5" /></Link>}{payslipId && canManage && <Link href={`/hrm/payslips/${payslipId}?edit=1`} title="Edit payroll" className="rounded-md border border-slate-200 p-1.5 text-[var(--theme-primary)]"><Pencil className="h-3.5 w-3.5" /></Link>}{canManage && item.payment_status !== "paid" && <form action={markPayrollItemPaid.bind(null, item.id)}><button type="submit" title="Mark as paid" className="rounded-md border border-slate-200 p-1.5 text-[var(--theme-primary)]"><CheckCircle2 className="h-3.5 w-3.5" /></button></form>}{canManage && run?.approval_status !== "approved" &&           <form action={run ? approvePayrollRunFromForm.bind(null, run.id) : undefined}><button type="submit" title="Approve payroll run" className="rounded-md border border-slate-200 p-1.5 text-[var(--theme-primary)]"><CheckCircle2 className="h-3.5 w-3.5" /></button></form>}</div></td></tr>; })}</tbody></table>{filteredItems.length === 0 && <div className="p-12 text-center text-sm text-slate-500">No payroll records match the selected filters.</div>}</div>
        </section>
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone: "blue" | "green" | "teal" | "orange" | "purple" }) {
  const styles = { blue: "bg-blue-50 text-blue-600", green: "bg-emerald-50 text-emerald-600", teal: "bg-teal-50 text-teal-600", orange: "bg-orange-50 text-orange-600", purple: "bg-purple-50 text-purple-600" };
  return <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-ledger-700 dark:bg-ink-900"><div className={`flex h-9 w-9 items-center justify-center rounded-full ${styles[tone]}`}>{icon}</div><div><p className="text-[10px] font-semibold text-slate-500">{label}</p><p className="mt-1 text-lg font-bold text-[#12345a] dark:text-white">{value}</p></div></div>;
}

function StatusBadge({ status }: { status: string }) {
  const styles = status === "Paid" ? "bg-emerald-50 text-emerald-700" : status === "Processing" ? "bg-blue-50 text-blue-700" : "bg-orange-50 text-orange-700";
  return <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${styles}`}>{status}</span>;
}
