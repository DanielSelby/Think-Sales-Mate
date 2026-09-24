"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canPermission } from "@/lib/rbac/permissions";

export async function recordPayslipEvent(payslipId: string, eventType: "viewed" | "downloaded" | "printed") {
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "You don't have access to this payslip." };
  const supabase = await createClient();
  if (!await canPermission("hrm", "view")) {
    const { data: membership } = await supabase.from("organization_members").select("employee_id").eq("org_id", context.orgId).eq("user_id", context.userId).eq("status", "active").maybeSingle();
    const { data: ownPayslip } = await supabase.from("payslips").select("id").eq("id", payslipId).eq("org_id", context.orgId).eq("employee_id", membership?.employee_id ?? "").maybeSingle();
    if (!ownPayslip) return { ok: false, error: "You don't have access to this payslip." };
  }
  const { error } = await supabase.from("payslip_events").insert({
    org_id: context.orgId,
    payslip_id: payslipId,
    actor_id: context.userId,
    event_type: eventType,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function regeneratePayslip(payslipId: string) {
  const context = await getCurrentOrgContext();
  if (!context || !await canPermission("hrm", "edit")) return { ok: false, error: "You don't have permission to regenerate payslips." };
  const supabase = await createClient();
  const { data: payslip, error: readError } = await supabase
    .from("payslips")
    .select("id, payroll_run_id, employee_id")
    .eq("id", payslipId)
    .eq("org_id", context.orgId)
    .single();
  if (readError || !payslip) return { ok: false, error: readError?.message ?? "Payslip not found." };
  const { error } = await supabase.from("payslips").update({ status: "generated", generated_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", payslip.id);
  if (error) return { ok: false, error: error.message };
  const { error: eventError } = await supabase.from("payslip_events").insert({
    org_id: context.orgId,
    payslip_id: payslip.id,
    actor_id: context.userId,
    event_type: "regenerated",
    metadata: { payroll_run_id: payslip.payroll_run_id, employee_id: payslip.employee_id },
  });
  if (eventError) return { ok: false, error: eventError.message };
  revalidatePath("/hrm/payslips");
  revalidatePath(`/hrm/payslips/${payslip.id}`);
  return { ok: true };
}

export async function updatePayslip(payslipId: string, formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context || !await canPermission("hrm", "edit")) redirect(`/hrm/payslips/${payslipId}?edit=1&error=permission`);
  const supabase = await createClient();
  const { data: payslip } = await supabase.from("payslips").select("id, payroll_run_id").eq("id", payslipId).eq("org_id", context.orgId).single();
  if (!payslip) redirect("/hrm/payslips?error=not-found");
  const { data: run } = await supabase.from("payroll_runs").select("approval_status, status").eq("id", payslip.payroll_run_id).eq("org_id", context.orgId).single();
  if (!run || run.approval_status === "approved" || run.status === "completed") redirect(`/hrm/payslips/${payslipId}?error=finalized`);
  const netPay = Number(formData.get("net_pay"));
  const notes = String(formData.get("notes") ?? "").trim() || null;
  if (!Number.isFinite(netPay) || netPay < 0) redirect(`/hrm/payslips/${payslipId}?edit=1&error=invalid-amount`);
  const { error } = await supabase.from("payslips").update({ net_pay: netPay, notes, updated_at: new Date().toISOString() }).eq("id", payslipId).eq("org_id", context.orgId);
  if (error) redirect(`/hrm/payslips/${payslipId}?edit=1&error=save-failed`);
  await supabase.from("payslip_events").insert({ org_id: context.orgId, payslip_id: payslipId, actor_id: context.userId, event_type: "regenerated", metadata: { action: "edited" } });
  revalidatePath("/hrm/payslips");
  revalidatePath(`/hrm/payslips/${payslipId}`);
  redirect(`/hrm/payslips/${payslipId}`);
}
