"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { can } from "@/lib/rbac";

export async function approvePayrollRun(runId: string) {
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "hrm.manage")) return { ok: false, error: "You don't have permission to approve payroll." };
  const supabase = await createClient();
  const { error } = await supabase.from("payroll_runs").update({ approval_status: "approved", approved_by: context.userId, approved_at: new Date().toISOString() }).eq("id", runId).eq("org_id", context.orgId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/hrm/payroll");
  revalidatePath(`/hrm/payroll/${runId}`);
  return { ok: true };
}
