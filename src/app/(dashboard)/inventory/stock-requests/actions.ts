"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canPermission } from "@/lib/rbac/permissions";
import { createStockTransfer } from "@/app/(dashboard)/inventory/transfers/actions";
import { createNotification } from "@/lib/notifications";

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

async function recordStockRequestAudit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: { orgId: string; actorId: string; action: string; requestId: string; metadata?: Record<string, unknown> }
) {
  const { error } = await supabase.from("audit_logs").insert({
    org_id: input.orgId,
    actor_id: input.actorId,
    action: input.action,
    entity_type: "stock_request",
    entity_id: input.requestId,
    metadata: input.metadata ?? {},
  });
  if (error) console.error("[stock-requests] Failed to record audit event:", error);
}

async function notifyStockRequestUsers(input: {
  orgId: string;
  requestId: string;
  title: string;
  message: string;
  requesterId?: string | null;
  locationId?: string | null;
  recipientIds?: string[];
}) {
  const recipients = new Set((input.recipientIds ?? []).filter(Boolean));
  if (input.requesterId) recipients.add(input.requesterId);
  if (recipients.size) {
    await Promise.all([...recipients].map((userId) => createNotification({
      orgId: input.orgId,
      userId,
      title: input.title,
      message: input.message,
      type: "general",
      entityType: "stock_requests",
      entityId: input.requestId,
    })));
  }
  if (input.locationId) {
    await createNotification({
      orgId: input.orgId,
      locationId: input.locationId,
      title: input.title,
      message: input.message,
      type: "general",
      entityType: "stock_requests",
      entityId: input.requestId,
    });
  }
}

export async function createStockRequest(payload: CreateStockRequestPayload) {
  const context = await getCurrentOrgContext();
  if (!context) return { error: "Your session expired — please sign in again." };
  if (!await canPermission("inventory", "create")) {
    return { error: "You don't have permission to create stock requests." };
  }
  if (payload.requestingLocationId === payload.sourceLocationId) {
    return { error: "Requesting and source locations must be different." };
  }
  if (context.isBranchScoped && !context.allowedLocationIds.includes(payload.requestingLocationId)) {
    return { error: "You can only create requests for your assigned branch." };
  }
  if (context.isBranchScoped && !context.allowedLocationIds.includes(payload.sourceLocationId)) {
    return { error: "You can only request stock from your assigned branches." };
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
  await recordStockRequestAudit(supabase, {
    orgId: context.orgId,
    actorId: context.userId,
    action: payload.submit ? "stock_request_submitted" : "stock_request_created",
    requestId: request.id,
    metadata: { status: payload.submit ? "pending_approval" : "draft", item_count: items.length },
  });
  if (payload.submit) {
    await notifyStockRequestUsers({
      orgId: context.orgId,
      requestId: request.id,
      title: "Stock request submitted",
      message: "A branch stock request is awaiting approval.",
      requesterId: context.userId,
      locationId: payload.requestingLocationId,
    });
  }

  revalidatePath("/inventory/stock-requests");
  return { requestId: request.id };
}

export async function approveStockRequest(requestId: string, comment?: string) {
  const context = await getCurrentOrgContext();
  if (!context || !await canPermission("inventory", "approve")) {
    return { error: "You don't have permission to approve stock requests." };
  }
  const supabase = await createClient();
  const { data: request, error } = await supabase
    .from("stock_requests")
    .select("id, request_number, requested_by, source_location_id, requesting_location_id, status, reference, notes")
    .eq("id", requestId)
    .eq("org_id", context.orgId)
    .single();
  if (error || !request) return { error: error?.message ?? "Stock request not found." };
  if (context.isBranchScoped &&
      (!context.allowedLocationIds.includes(request.source_location_id) || !context.allowedLocationIds.includes(request.requesting_location_id))) {
    return { error: "You can only approve requests involving your assigned branches." };
  }
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
  const { data: approvers } = await supabase
    .from("organization_members")
    .select("user_id")
    .eq("org_id", context.orgId)
    .eq("status", "active")
    .in("role", ["owner", "admin", "manager"]);
  await recordStockRequestAudit(supabase, {
    orgId: context.orgId,
    actorId: context.userId,
    action: "stock_request_approved",
    requestId,
    metadata: { transfer_id: transfer.transferId, comment: comment?.trim() || null },
  });
  await recordStockRequestAudit(supabase, {
    orgId: context.orgId,
    actorId: context.userId,
    action: "stock_request_transfer_generated",
    requestId,
    metadata: { transfer_id: transfer.transferId },
  });
  await notifyStockRequestUsers({
    orgId: context.orgId,
    requestId,
    title: "Stock request approved",
    message: "Your branch stock request was approved and a transfer was created.",
    requesterId: request.requested_by,
    locationId: request.requesting_location_id,
    recipientIds: (approvers ?? []).map((approver) => approver.user_id).filter((userId): userId is string => Boolean(userId)),
  });
  revalidatePath("/inventory/stock-requests");
  revalidatePath("/inventory/transfers");
  return { transferId: transfer.transferId };
}

export async function rejectStockRequest(requestId: string, reason: string) {
  const context = await getCurrentOrgContext();
  if (!context || !await canPermission("inventory", "delete")) {
    return { error: "You don't have permission to reject stock requests." };
  }
  if (!reason.trim()) return { error: "Provide a rejection reason." };
  const supabase = await createClient();
  const { data: request, error: requestError } = await supabase
    .from("stock_requests")
    .select("id, request_number, requested_by, source_location_id, requesting_location_id, status")
    .eq("id", requestId)
    .eq("org_id", context.orgId)
    .single();
  if (requestError || !request) return { error: requestError?.message ?? "Stock request not found." };
  if (context.isBranchScoped &&
      (!context.allowedLocationIds.includes(request.source_location_id) || !context.allowedLocationIds.includes(request.requesting_location_id))) {
    return { error: "You can only reject requests involving your assigned branches." };
  }
  if (request.status !== "pending_approval") return { error: "Only pending requests can be rejected." };
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
  await recordStockRequestAudit(supabase, {
    orgId: context.orgId,
    actorId: context.userId,
    action: "stock_request_rejected",
    requestId,
    metadata: { reason: reason.trim() },
  });
  await notifyStockRequestUsers({
    orgId: context.orgId,
    requestId,
    title: "Stock request rejected",
    message: `Your branch stock request was rejected. Reason: ${reason.trim()}`,
    requesterId: request.requested_by,
    locationId: request.requesting_location_id,
  });
  revalidatePath("/inventory/stock-requests");
  revalidatePath("/inventory/stock-requests/history");
  return { success: true };
}
