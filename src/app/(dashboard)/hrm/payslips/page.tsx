import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { HrmTabNavigation } from "@/components/hrm/hrm-tab-navigation";
import { PayslipBulkActions } from "@/components/hrm/payslip-bulk-actions";

const tabs = ["all", "current", "generated", "pending", "archived"] as const;
type Tab = typeof tabs[number];

export default async function PayslipsPage({ searchParams }: { searchParams?: Promise<{ tab?: string }> }) {
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "hrm.view")) return null;
  const tab = ((await searchParams)?.tab ?? "all") as Tab;
  const activeTab = tabs.includes(tab) ? tab : "all";
  const supabase = await createClient();
  let query = supabase.from("payslips").select("id, employee_name, employee_number, period_label, payment_date, pay_period_start, net_pay, currency, status, generated_at").eq("org_id", context.orgId).order("generated_at", { ascending: false });
  if (activeTab === "current") query = query.gte("pay_period_start", `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`);
  if (activeTab === "generated" || activeTab === "pending" || activeTab === "archived") query = query.eq("status", activeTab);
  const { data: payslips } = await query;
  const rows = (payslips ?? []).map((payslip) => ({ id: payslip.id, employeeName: payslip.employee_name, periodLabel: payslip.period_label, netPay: Number(payslip.net_pay), currency: payslip.currency || context.currency }));
  return <div className="mx-auto max-w-5xl space-y-5"><HrmTabNavigation /><div><Link href="/hrm/payroll" className="inline-flex items-center gap-1 text-sm text-ledger-500"><ArrowLeft className="h-3.5 w-3.5" />Back to payroll</Link><h1 className="mt-2 font-display text-2xl font-semibold text-ink-900 dark:text-white">Payslips</h1><p className="text-sm text-ledger-500">Generated automatically from processed payroll runs.</p></div><div className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900"><div className="mb-5 flex flex-wrap gap-4 border-b border-ledger-100 text-sm font-medium dark:border-ledger-700">{tabs.map((item) => <Link key={item} href={`/hrm/payslips?tab=${item}`} className={`border-b-2 pb-3 capitalize ${activeTab === item ? "border-signal text-signal" : "border-transparent text-ledger-400"}`}>{item === "all" ? "All Payslips" : item === "current" ? "Current Period" : `${item} Payslips`}</Link>)}</div>{rows.length ? <PayslipBulkActions rows={rows} /> : <div className="p-12 text-center text-sm text-ledger-500">No payslips found for this view.</div>}</div></div>;
}
