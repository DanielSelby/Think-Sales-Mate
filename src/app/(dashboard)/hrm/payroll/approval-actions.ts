"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canPermission } from "@/lib/rbac/permissions";

export async function approvePayrollRun(runId: string) {
  return approvePayrollRuns([runId]);
}

export async function approvePayrollRuns(runIds: string[]) {
  const context = await getCurrentOrgContext();
  if (!context || !await canPermission("hrm", "edit")) return { ok: false, error: "You don't have permission to approve payroll." };
  const ids = Array.from(new Set(runIds.filter(Boolean)));
  if (!ids.length) return { ok: false, error: "Select at least one payroll run." };
  const supabase = await createClient();
  const { data: runs, error: readError } = await supabase.from("payroll_runs").select("id").eq("org_id", context.orgId).in("id", ids);
  if (readError) return { ok: false, error: readError.message };
  if ((runs ?? []).length !== ids.length) return { ok: false, error: "One or more selected payroll runs could not be found." };
  const { error } = await supabase.from("payroll_runs").update({ approval_status: "approved", approved_by: context.userId, approved_at: new Date().toISOString() }).eq("org_id", context.orgId).in("id", ids);
  if (error) return { ok: false, error: error.message };
  const { error: historyError } = await supabase.from("payroll_approval_history").insert(ids.map((runId) => ({
    org_id: context.orgId, payroll_run_id: runId, actor_id: context.userId, action: "approved",
  })));
  if (historyError) return { ok: false, error: historyError.message };
  revalidatePath("/hrm/payroll");
  for (const runId of ids) revalidatePath(`/hrm/payroll/${runId}`);
  return { ok: true };
}

export async function submitPayrollRun(runId: string) {
  const context = await getCurrentOrgContext();
  if (!context || !await canPermission("hrm_payroll", "edit")) return { ok: false, error: "You don't have permission to submit payroll." };
  const supabase = await createClient();
  const { error } = await supabase.from("payroll_runs").update({ status: "processing", approval_status: "pending" }).eq("id", runId).eq("org_id", context.orgId);
  if (error) return { ok: false, error: error.message };
  await supabase.from("payroll_approval_history").insert({ org_id: context.orgId, payroll_run_id: runId, actor_id: context.userId, action: "submitted" });
  revalidatePath("/hrm/payroll");
  revalidatePath(`/hrm/payroll/${runId}`);
  return { ok: true };
}

export async function markPayrollItemsPaid(itemIds: string[]) {
  const context = await getCurrentOrgContext();
  if (!context || !await canPermission("hrm_payroll", "edit")) return { ok: false, error: "You don't have permission to mark payroll as paid." };
  const ids = Array.from(new Set(itemIds.filter(Boolean)));
  if (!ids.length) return { ok: false, error: "Select at least one payroll item." };
  const supabase = await createClient();
  const { data: items, error: readError } = await supabase.from("payroll_run_items").select("id, payroll_run_id").eq("org_id", context.orgId).in("id", ids);
  if (readError) return { ok: false, error: readError.message };
  const { error } = await supabase.from("payroll_run_items").update({ payment_status: "paid", paid_at: new Date().toISOString(), paid_by: context.userId }).eq("org_id", context.orgId).in("id", ids);
  if (error) return { ok: false, error: error.message };
  for (const runId of Array.from(new Set((items ?? []).map((item) => item.payroll_run_id)))) {
    await supabase.from("payroll_approval_history").insert({ org_id: context.orgId, payroll_run_id: runId, actor_id: context.userId, action: "paid" });
    const [{ data: runItems }, { data: run }] = await Promise.all([
      supabase.from("payroll_run_items").select("payment_status").eq("org_id", context.orgId).eq("payroll_run_id", runId),
      supabase.from("payroll_runs").select("expense_id").eq("org_id", context.orgId).eq("id", runId).single(),
    ]);
    if (run?.expense_id && runItems?.length && runItems.every((item) => item.payment_status === "paid")) {
      await supabase.from("expenses").update({ payment_status: "paid", paid_on: new Date().toISOString().slice(0, 10) }).eq("id", run.expense_id).eq("org_id", context.orgId);
    }
  }
  revalidatePath("/hrm/payroll");
  revalidatePath("/hrm/payslips");
  revalidatePath("/accounting");
  revalidatePath("/accounting/expenses");
  return { ok: true };
}

export async function markPayrollItemPaid(itemId: string) {
  return markPayrollItemsPaid([itemId]);
}

export async function approvePayrollRunFromForm(runId: string) {
  return approvePayrollRun(runId);
}
