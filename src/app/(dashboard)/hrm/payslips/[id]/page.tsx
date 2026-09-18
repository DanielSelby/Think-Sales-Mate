import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { PayslipDocument, type PayslipDocumentData } from "@/components/hrm/payslip-document";

export default async function PayslipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getCurrentOrgContext();
  if (!context) return null;
  const supabase = await createClient();
  const { data: payslip } = await supabase.from("payslips").select("*").eq("id", id).eq("org_id", context.orgId).single();
  if (!payslip) notFound();
  if (!can(context.role, "hrm.view")) {
    const { data: membership } = await supabase.from("organization_members").select("employee_id").eq("org_id", context.orgId).eq("user_id", context.userId).eq("status", "active").maybeSingle();
    if (!membership?.employee_id || membership.employee_id !== payslip.employee_id) return null;
  }
  const { data: company } = await supabase.from("company_profile").select("company_name, logo_url, business_email, business_phone, address_line1, address_line2, city, region, country").eq("org_id", context.orgId).maybeSingle();
  const document = { ...payslip, company: { company_name: company?.company_name ?? context.orgName, logo_url: company?.logo_url ?? null, business_email: company?.business_email ?? null, business_phone: company?.business_phone ?? null, address: [company?.address_line1, company?.address_line2, company?.city, company?.region, company?.country].filter(Boolean).join(", ") } } as PayslipDocumentData;
  return <div className="mx-auto max-w-4xl space-y-4"><Link href="/hrm/payslips" className="inline-flex items-center gap-1 text-sm text-ledger-500 print:hidden"><ArrowLeft className="h-3.5 w-3.5" />Back to payslips</Link><PayslipDocument payslip={document} /></div>;
}
