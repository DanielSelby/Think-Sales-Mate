"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { can } from "@/lib/rbac";
import { createStockTransfer } from "@/app/(dashboard)/inventory/transfers/actions";

export interface StockRequestItemInput {
  productId: string;
  quantity: number;
  reason?: string;
}

export interface CreateStockRequestPayload {
  requestingLocationId: string;
  sourceLocationId: string;
  expectedDeliveryDate?: string;
  priority?: "low" | "normal" | "high" | "urgent";
  reference?: string;
  notes?: string;
  items: StockRequestItemInput[];
  submit?: boolean;
}

export async function createStockRequest(payload: CreateStockRequestPayload) {
  const context = await getCurrentOrgContext();
  if (!context) return { error: "Your session expired — please sign in again." };
  if (!can(context.role, "inventory.stock_request.create")) {
    return { error: "You don't have permission to create stock requests." };
  }
  if (payload.requestingLocationId === payload.sourceLocationId) {
    return { error: "Requesting and source locations must be different." };
  }
  if (context.isBranchScoped && !context.allowedLocationIds.includes(payload.requestingLocationId)) {
    return { error: "You can only create requests for your assigned branch." };
  }

  const items = payload.items.filter((item) => item.productId && item.quantity > 0);
  if (!items.length) return { error: "Add at least one product to the request." };

  const supabase = await createClient();
  const { data: request, error } = await supabase
    .from("stock_requests")
    .insert({
      org_id: context.orgId,
      requested_by: context.userId,
      requesting_location_id: payload.requestingLocationId,
      source_location_id: payload.sourceLocationId,
      priority: payload.priority ?? "normal",
      expected_delivery_date: payload.expectedDeliveryDate || null,
      reference: payload.reference?.trim() || null,
      notes: payload.notes?.trim() || null,
      status: payload.submit ? "pending_approval" : "draft",
      submitted_at: payload.submit ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (error || !request) return { error: error?.message ?? "Could not create stock request." };

  const { error: itemError } = await supabase.from("stock_request_items").insert(
    items.map((item) => ({
      request_id: request.id,
      org_id: context.orgId,
      product_id: item.productId,
      quantity: item.quantity,
      reason: item.reason?.trim() || null,
    }))
  );
  if (itemError) return { error: itemError.message };

  await supabase.from("stock_request_timeline").insert({
    request_id: request.id,
    org_id: context.orgId,
    actor_id: context.userId,
    event: payload.submit ? "submitted" : "created",
  });

  revalidatePath("/inventory/stock-requests");
  return { requestId: request.id };
}

export async function approveStockRequest(requestId: string, comment?: string) {
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "inventory.stock_request.approve")) {
    return { error: "You don't have permission to approve stock requests." };
  }
  const supabase = await createClient();
  const { data: request, error } = await supabase
    .from("stock_requests")
    .select("id, source_location_id, requesting_location_id, status, reference, notes")
    .eq("id", requestId)
    .eq("org_id", context.orgId)
    .single();
  if (error || !request) return { error: error?.message ?? "Stock request not found." };
  if (request.status !== "pending_approval") return { error: "Only pending requests can be approved." };
  const { data: requestItems, error: itemsError } = await supabase
    .from("stock_request_items")
    .select("product_id, quantity")
    .eq("request_id", requestId)
    .eq("org_id", context.orgId);
  if (itemsError) return { error: itemsError.message };
  if (!requestItems?.length) return { error: "This request has no items." };

  const transfer = await createStockTransfer({
    fromLocationId: request.source_location_id,
    toLocationId: request.requesting_location_id,
    referenceNo: `REQ-${requestId.slice(0, 8).toUpperCase()}`,
    reason: "Approved branch stock request",
    notes: request.notes ?? undefined,
    items: requestItems.map((item) => ({ productId: item.product_id, quantity: item.quantity })),
  });
  if (transfer.error || !transfer.transferId) return { error: transfer.error ?? "Could not create the stock transfer." };

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("stock_requests")
    .update({ status: "approved", transfer_id: transfer.transferId, approved_at: now })
    .eq("id", requestId)
    .eq("org_id", context.orgId);
  if (updateError) return { error: updateError.message };

  await supabase.from("stock_request_approvals").insert({
    request_id: requestId,
    org_id: context.orgId,
    approver_id: context.userId,
    decision: "approved",
    comment: comment?.trim() || null,
  });
  await supabase.from("stock_request_timeline").insert({
    request_id: requestId,
    org_id: context.orgId,
    actor_id: context.userId,
    event: "approved",
    details: { transfer_id: transfer.transferId },
  });
  revalidatePath("/inventory/stock-requests");
  revalidatePath("/inventory/transfers");
  return { transferId: transfer.transferId };
}

export async function rejectStockRequest(requestId: string, reason: string) {
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "inventory.stock_request.reject")) {
    return { error: "You don't have permission to reject stock requests." };
  }
  if (!reason.trim()) return { error: "Provide a rejection reason." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("stock_requests")
    .update({ status: "rejected", rejection_reason: reason.trim() })
    .eq("id", requestId)
    .eq("org_id", context.orgId)
    .eq("status", "pending_approval");
  if (error) return { error: error.message };
  await supabase.from("stock_request_approvals").insert({
    request_id: requestId,
    org_id: context.orgId,
    approver_id: context.userId,
    decision: "rejected",
    comment: reason.trim(),
  });
  await supabase.from("stock_request_timeline").insert({
    request_id: requestId,
    org_id: context.orgId,
    actor_id: context.userId,
    event: "rejected",
    details: { reason: reason.trim() },
  });
  revalidatePath("/inventory/stock-requests");
  return { success: true };
}
