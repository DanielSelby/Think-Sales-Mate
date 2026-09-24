import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { PayslipDocument, type PayslipDocumentData } from "@/components/hrm/payslip-document";
import { updatePayslip } from "../actions";

export default async function PayslipPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ edit?: string }> }) {
  const { id } = await params;
  const context = await getCurrentOrgContext();
  if (!context) return null;
  const supabase = await createClient();
  const { data: payslip } = await supabase.from("payslips").select("*").eq("id", id).eq("org_id", context.orgId).single();
  if (!payslip) notFound();
  const { data: payrollRun } = await supabase.from("payroll_runs").select("approval_status, status").eq("id", payslip.payroll_run_id).eq("org_id", context.orgId).single();
  if (!can(context.role, "hrm.view")) {
    const { data: membership } = await supabase.from("organization_members").select("employee_id").eq("org_id", context.orgId).eq("user_id", context.userId).eq("status", "active").maybeSingle();
    if (!membership?.employee_id || membership.employee_id !== payslip.employee_id) return null;
  }
  const { data: company } = await supabase.from("company_profile").select("company_name, logo_url, business_email, business_phone, address_line1, address_line2, city, region, country").eq("org_id", context.orgId).maybeSingle();
  const document = { ...payslip, company: { company_name: company?.company_name ?? context.orgName, logo_url: company?.logo_url ?? null, business_email: company?.business_email ?? null, business_phone: company?.business_phone ?? null, address: [company?.address_line1, company?.address_line2, company?.city, company?.region, company?.country].filter(Boolean).join(", ") } } as PayslipDocumentData;
  const editable = can(context.role, "hrm.manage") && payrollRun?.approval_status !== "approved" && payrollRun?.status !== "completed";
  const editMode = (await searchParams)?.edit === "1" && editable;
  return <div className="mx-auto max-w-4xl space-y-4"><Link href="/hrm/payslips" className="inline-flex items-center gap-1 text-sm text-ledger-500 print:hidden"><ArrowLeft className="h-3.5 w-3.5" />Back to payslips</Link>{editMode ? <form action={updatePayslip.bind(null, id)} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-ledger-700 dark:bg-ink-900"><h1 className="text-lg font-bold text-ink-900 dark:text-white">Edit Payslip</h1><p className="mt-1 text-xs text-ledger-500">This payroll period is still open.</p><label className="mt-5 block text-xs font-semibold">Net salary<input name="net_pay" type="number" min="0" step="0.01" defaultValue={payslip.net_pay} className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 dark:border-ledger-700 dark:bg-ink-950" /></label><label className="mt-4 block text-xs font-semibold">Notes<textarea name="notes" defaultValue={payslip.notes ?? ""} className="mt-1 min-h-24 w-full rounded-md border border-slate-200 p-3 dark:border-ledger-700 dark:bg-ink-950" /></label><div className="mt-5 flex gap-2"><button type="submit" className="rounded-md px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: "var(--theme-primary)" }}>Save Changes</button><Link href={`/hrm/payslips/${id}`} className="rounded-md border border-slate-200 px-4 py-2 text-sm">Cancel</Link></div></form> : <PayslipDocument payslip={document} />}</div>;
}
