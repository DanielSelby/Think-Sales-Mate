import Link from "next/link";
import { CalendarDays, Eye, FileText, Mail, MoreHorizontal, Pencil, Printer, Search, Download, Building2, BriefcaseBusiness, WalletCards } from "lucide-react";
import { PayrollKpi } from "@/components/hrm/payroll-kpi";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { formatCurrency } from "@/lib/sales/format";

type SearchParams = {
  date_from?: string;
  date_to?: string;
  salary_month?: string;
  branch?: string;
  department?: string;
  employee?: string;
};

const monthLabel = (value: string) => {
  if (!value) return "All salary months";
  const date = new Date(`${value}-01T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
};

export default async function PayslipsPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "hrm.view")) return null;

  const filters = await searchParams ?? {};
  const supabase = await createClient();
  const [{ data: locations }, { data: departments }] = await Promise.all([
    supabase.from("business_locations").select("id, name").eq("org_id", context.orgId).eq("is_active", true).order("name"),
    supabase.from("employees").select("department").eq("org_id", context.orgId).not("department", "is", null).order("department"),
  ]);

  let query = supabase
    .from("payslips")
    .select("id, employee_name, employee_number, period_label, pay_period_start, payment_date, net_pay, currency, status, generated_at, department, location_id, payroll_run_id")
    .eq("org_id", context.orgId)
    .order("generated_at", { ascending: false });
  if (filters.date_from) query = query.gte("generated_at", `${filters.date_from}T00:00:00.000Z`);
  if (filters.date_to) query = query.lte("generated_at", `${filters.date_to}T23:59:59.999Z`);
  if (filters.salary_month) query = query.gte("pay_period_start", `${filters.salary_month}-01`);
  if (filters.salary_month) {
    const nextMonth = new Date(`${filters.salary_month}-01T00:00:00Z`);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    query = query.lt("pay_period_start", nextMonth.toISOString().slice(0, 10));
  }
  if (filters.branch) query = query.eq("location_id", filters.branch);
  if (filters.department) query = query.eq("department", filters.department);
  if (filters.employee?.trim()) {
    const employeeSearch = filters.employee.trim();
    const employeeNumber = Number(employeeSearch.replace(/^EMP-/i, ""));
    query = Number.isInteger(employeeNumber) && employeeNumber > 0
      ? query.or(`employee_name.ilike.%${employeeSearch}%,employee_number.eq.${employeeNumber}`)
      : query.ilike("employee_name", `%${employeeSearch}%`);
  }
  const { data: payslips } = await query;
  const runIds = (payslips ?? []).map((row) => row.payroll_run_id).filter(Boolean);
  const { data: payrollRuns } = runIds.length
    ? await supabase.from("payroll_runs").select("id, approval_status, status").eq("org_id", context.orgId).in("id", runIds)
    : { data: [] };
  const openRunIds = new Set((payrollRuns ?? []).filter((run) => run.approval_status !== "approved" && run.status !== "completed").map((run) => run.id));

  const locationNames = new Map((locations ?? []).map((location) => [location.id, location.name]));
  const uniqueDepartments = Array.from(new Set((departments ?? []).map((item) => item.department).filter(Boolean))) as string[];
  const rows = payslips ?? [];
  const totalSalary = rows.reduce((sum, row) => sum + Number(row.net_pay), 0);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const currentMonthTotal = rows.filter((row) => row.pay_period_start.startsWith(currentMonth)).reduce((sum, row) => sum + Number(row.net_pay), 0);
  const departmentCount = new Set(rows.map((row) => row.department).filter(Boolean)).size;
  const branchCount = new Set(rows.map((row) => row.location_id).filter(Boolean)).size;
  const currency = rows[0]?.currency || context.currency;
  const clearHref = "/hrm/payslips";

  return (
    <div className="mx-auto max-w-[1680px] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#dce8f2] bg-white p-4 shadow-sm dark:border-ledger-700 dark:bg-ink-900">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl text-white" style={{ backgroundColor: "var(--theme-primary)" }}><FileText className="h-6 w-6" /></div>
            <div><div className="mb-1 text-[11px] font-semibold text-[var(--theme-primary)]">HRM &amp; Payroll <span className="mx-1 text-slate-300">›</span> Payslip Generated</div><h1 className="text-xl font-bold text-[#12345a] dark:text-white">Payslip Generated</h1><p className="text-xs text-ledger-500">View, manage and print employee payslips.</p></div>
          </div>
          <Link href="/hrm/payroll" className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold text-white shadow-sm" style={{ backgroundColor: "var(--theme-primary)" }}><FileText className="h-4 w-4" />Generate Payslip</Link>
        </div>

        <form method="get" className="grid gap-3 rounded-xl border border-[#dce8f2] bg-white p-3 shadow-sm dark:border-ledger-700 dark:bg-ink-900 md:grid-cols-3 xl:grid-cols-6">
          <label className="text-[10px] font-semibold text-slate-500">Date Range<div className="mt-1 flex items-center gap-1"><input name="date_from" type="date" defaultValue={filters.date_from} className="h-9 min-w-0 w-full rounded-md border border-slate-200 px-2 text-[11px] dark:border-ledger-700 dark:bg-ink-950" /><span>–</span><input name="date_to" type="date" defaultValue={filters.date_to} className="h-9 min-w-0 w-full rounded-md border border-slate-200 px-2 text-[11px] dark:border-ledger-700 dark:bg-ink-950" /></div></label>
          <label className="text-[10px] font-semibold text-slate-500">Salary Month<select name="salary_month" defaultValue={filters.salary_month ?? ""} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-ledger-700 dark:bg-ink-950"><option value="">All salary months</option>{Array.from(new Set(rows.map((row) => row.pay_period_start.slice(0, 7)))).map((month) => <option key={month} value={month}>{monthLabel(month)}</option>)}</select></label>
          <label className="text-[10px] font-semibold text-slate-500">Branch<select name="branch" defaultValue={filters.branch ?? ""} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-ledger-700 dark:bg-ink-950"><option value="">All branches</option>{(locations ?? []).map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
          <label className="text-[10px] font-semibold text-slate-500">Department<select name="department" defaultValue={filters.department ?? ""} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-ledger-700 dark:bg-ink-950"><option value="">All departments</option>{uniqueDepartments.map((department) => <option key={department} value={department}>{department}</option>)}</select></label>
          <label className="text-[10px] font-semibold text-slate-500">Employee<div className="relative mt-1"><Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" /><input name="employee" defaultValue={filters.employee} placeholder="Search by name or ID..." className="h-9 w-full rounded-md border border-slate-200 pl-8 pr-2 text-xs dark:border-ledger-700 dark:bg-ink-950" /></div></label>
          <div className="flex items-end"><button type="submit" className="h-9 w-full rounded-md px-3 text-xs font-semibold text-white" style={{ backgroundColor: "var(--theme-primary)" }}>Apply Filters</button><Link href={clearHref} className="ml-2 inline-flex h-9 items-center whitespace-nowrap rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-ledger-700 dark:text-slate-300">Clear</Link></div>
        </form>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <PayrollKpi icon={<FileText className="h-4 w-4" />} label="Total Payslips" value={String(rows.length)} tone="blue" />
          <PayrollKpi icon={<WalletCards className="h-4 w-4" />} label="Total Salary Amount" value={formatCurrency(totalSalary, currency)} tone="green" />
          <PayrollKpi icon={<CalendarDays className="h-4 w-4" />} label="Current Month Payroll" value={formatCurrency(currentMonthTotal, currency)} tone="purple" />
          <PayrollKpi icon={<BriefcaseBusiness className="h-4 w-4" />} label="Departments" value={String(departmentCount)} tone="orange" />
          <PayrollKpi icon={<Building2 className="h-4 w-4" />} label="Branches" value={String(branchCount)} tone="teal" />
        </div>

        <section className="overflow-hidden rounded-xl border border-[#dce8f2] bg-white shadow-sm dark:border-ledger-700 dark:bg-ink-900">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 dark:border-ledger-700"><div className="flex items-center gap-2"><FileText className="h-5 w-5 text-blue-600" /><h2 className="font-bold text-[#12345a] dark:text-white">Payslip List</h2><span className="text-xs text-slate-400">Showing {rows.length} records</span></div><div className="flex gap-2"><button type="button" className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 dark:border-ledger-700 dark:text-slate-300"><Download className="h-3.5 w-3.5" />Export</button><Link href="/hrm/payslips" className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 dark:border-ledger-700 dark:text-slate-300"><Printer className="h-3.5 w-3.5" />Print</Link></div></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[1180px] text-left text-xs"><thead className="bg-[#eef6ff] text-[10px] font-bold uppercase tracking-wide text-slate-500"><tr>{["Date", "Salary Month", "Employee ID", "Employee Name", "Salary Amount", "Branch", "Department", "Status", "Actions"].map((heading) => <th key={heading} className="border-b border-slate-200 px-3 py-3">{heading}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-ledger-700">{rows.map((row) => <tr key={row.id} className="hover:bg-blue-50/40 dark:hover:bg-slate-800/40"><td className="px-3 py-3 text-slate-500">{new Date(row.payment_date).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}</td><td className="px-3 py-3">{monthLabel(row.pay_period_start.slice(0, 7))}</td><td className="px-3 py-3 font-mono text-[11px]">{row.employee_number ? `EMP-${String(row.employee_number).padStart(3, "0")}` : "—"}</td><td className="px-3 py-3 font-semibold text-[#12345a] dark:text-white">{row.employee_name}</td><td className="px-3 py-3 font-bold">{formatCurrency(Number(row.net_pay), row.currency || currency)}</td><td className="px-3 py-3">{locationNames.get(row.location_id ?? "") ?? "—"}</td><td className="px-3 py-3">{row.department ?? "—"}</td><td className="px-3 py-3"><span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold capitalize text-emerald-700">{row.status}</span></td><td className="px-3 py-3"><div className="flex items-center gap-1"><Link href={`/hrm/payslips/${row.id}`} title="View payslip" className="inline-flex items-center gap-1 rounded-md border border-blue-200 px-2 py-1.5 text-[10px] font-semibold text-blue-600 hover:bg-blue-50"><Eye className="h-3 w-3" />View</Link><Link href={`/hrm/payslips/${row.id}`} title="Print or download" className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[10px] font-semibold text-white" style={{ backgroundColor: "var(--theme-primary)" }}><Printer className="h-3 w-3" />Print</Link><Link href={`/hrm/payslips/${row.id}`} title="Download PDF" className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1.5 text-[10px] font-semibold text-slate-600"><Download className="h-3 w-3" />PDF</Link><button type="button" disabled title="Email delivery requires an email provider configuration" className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1.5 text-[10px] font-semibold text-slate-400 disabled:cursor-not-allowed"><Mail className="h-3 w-3" />Email</button>{openRunIds.has(row.payroll_run_id) ? <Link href={`/hrm/payslips/${row.id}?edit=1`} title="Edit payslip" className="inline-flex items-center gap-1 rounded-md border border-[var(--theme-primary)] px-2 py-1.5 text-[10px] font-semibold text-[var(--theme-primary)]"><Pencil className="h-3 w-3" />Edit</Link> : <span title="Payroll Finalized" className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1.5 text-[10px] font-semibold text-slate-400"><Pencil className="h-3 w-3" />Finalized</span>}<button type="button" title="More actions" className="rounded-md border border-slate-200 p-1.5 text-slate-500"><MoreHorizontal className="h-3.5 w-3.5" /></button></div></td></tr>)}</tbody></table>{rows.length === 0 && <div className="p-12 text-center text-sm text-slate-500">No generated payslips match the selected filters.</div>}</div>
        </section>
    </div>
  );
}
