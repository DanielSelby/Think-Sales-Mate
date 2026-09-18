import Link from "next/link";
import { FileText } from "lucide-react";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/sales/format";

export default async function MyPayslipsPage() {
  const context = await getCurrentOrgContext();
  if (!context) return null;
  const supabase = await createClient();
  const { data: membership } = await supabase.from("organization_members").select("employee_id").eq("org_id", context.orgId).eq("user_id", context.userId).eq("status", "active").maybeSingle();
  if (!membership?.employee_id) return <div className="mx-auto max-w-2xl rounded-card border border-dashed border-ledger-200 bg-white p-10 text-center"><p className="text-sm text-ledger-500">Your account is not linked to an employee record. Ask HR to link your employee profile.</p></div>;
  const { data: payslips } = await supabase.from("payslips").select("id, period_label, payment_date, net_pay, currency, generated_at").eq("org_id", context.orgId).eq("employee_id", membership.employee_id).order("pay_period_start", { ascending: false });
  return <div className="mx-auto max-w-3xl space-y-5"><div><h1 className="font-display text-2xl font-semibold text-ink-900 dark:text-white">My Payslips</h1><p className="text-sm text-ledger-500">Your personal payslip history.</p></div><div className="divide-y divide-ledger-100 rounded-card border border-ledger-100 bg-white shadow-card dark:divide-ledger-700 dark:border-ledger-700 dark:bg-ink-900">{payslips?.length ? payslips.map((payslip) => <Link key={payslip.id} href={`/hrm/payslips/${payslip.id}`} className="flex items-center justify-between px-5 py-4 hover:bg-ledger-50"><div className="flex items-center gap-3"><FileText className="h-5 w-5 text-signal" /><span className="font-medium">{payslip.period_label}</span></div><span className="font-medium">{formatCurrency(payslip.net_pay, payslip.currency || context.currency)}</span></Link>) : <p className="p-10 text-center text-sm text-ledger-500">No payslips available.</p>}</div></div>;
}
