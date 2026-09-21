"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canPermission } from "@/lib/rbac/permissions";
import { approveStockRequest, rejectStockRequest } from "@/app/(dashboard)/inventory/stock-requests/actions";
import { approveExpense, rejectExpense } from "@/app/(dashboard)/expenses/actions";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";

export type ApprovalDecisionInput = {
  type: "stock_request" | "expense" | "purchase_return" | "customer_order";
  id: string;
  decision: "approved" | "rejected";
  reason?: string;
};

export async function decideApproval(input: ApprovalDecisionInput) {
  const context = await getCurrentOrgContext();
  if (!context || !await canPermission("approvals", "approve")) {
    return { error: "You do not have permission to manage approvals." };
  }

  if (input.decision === "rejected" && !input.reason?.trim()) {
    return { error: "Provide a reason before rejecting a request." };
  }

  if (input.type === "stock_request") {
    const result = input.decision === "approved"
      ? await approveStockRequest(input.id)
      : await rejectStockRequest(input.id, input.reason!.trim());
    if ("error" in result && result.error) return { error: result.error };
  } else if (input.type === "expense") {
    const result = input.decision === "approved"
      ? await approveExpense(input.id)
      : await rejectExpense(input.id, input.reason!.trim());
    if (!result.ok) return { error: result.error };
  } else if (input.type === "purchase_return") {
    const supabase = await createClient();
    const { data: row, error: findError } = await supabase
      .from("purchase_returns")
      .select("id, org_id, status")
      .eq("id", input.id)
      .eq("org_id", context.orgId)
      .maybeSingle();
    if (findError || !row) return { error: findError?.message ?? "Purchase return not found." };
    if (row.status !== "submitted") return { error: "Only submitted purchase returns can be decided." };
    const { error } = await supabase
      .from("purchase_returns")
      .update({
        status: input.decision,
        approved_by: context.userId,
        approved_at: new Date().toISOString(),
      })
      .eq("id", input.id)
      .eq("org_id", context.orgId)
      .eq("status", "submitted");
    if (error) return { error: error.message };
    const audit = await recordAuditEvent(supabase, {
      orgId: context.orgId,
      actorId: context.userId,
      action: input.decision === "approved" ? "purchase_return.approved" : "purchase_return.rejected",
      entityType: "purchase_returns",
      entityId: input.id,
      module: "Approvals",
      description: `${input.decision === "approved" ? "Approved" : "Rejected"} purchase return`,
      previousValues: { status: "submitted" },
      newValues: { status: input.decision, reason: input.reason?.trim() ?? null },
    });
    if (audit.error) return { error: audit.error };
  } else {
    const supabase = await createClient();
    const { error } = await supabase.from("customer_orders").update({
      status: input.decision === "approved" ? "processing" : "cancelled",
    }).eq("id", input.id).eq("org_id", context.orgId).eq("status", "new");
    if (error) return { error: error.message };
  }

  revalidatePath("/approvals");
  revalidatePath("/inventory/stock-requests");
  revalidatePath("/expenses");
  revalidatePath("/purchases/returns/new");
  return { success: true };
}

export async function markApprovalDone(input: Pick<ApprovalDecisionInput, "type" | "id">) {
  const context = await getCurrentOrgContext();
  if (!context || !await canPermission("approvals", "approve")) {
    return { error: "You do not have permission to update approval history." };
  }
  const supabase = await createClient();
  const audit = await recordAuditEvent(supabase, {
    orgId: context.orgId,
    actorId: context.userId,
    action: "approval.completed",
    entityType: input.type,
    entityId: input.id,
    module: "Approvals",
    description: `Completed ${input.type.replaceAll("_", " ")} approval`,
    newValues: { approval_type: input.type, approval_id: input.id },
  });
  if (audit.error) return { error: audit.error };
  revalidatePath("/approvals");
  return { success: true };
}
