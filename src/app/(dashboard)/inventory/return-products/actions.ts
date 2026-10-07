"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canAccessLocation } from "@/lib/organizations/location-access";
import { canPermission } from "@/lib/rbac/permissions";

export interface BranchReturnItemInput {
  productId: string;
  quantity: number;
  condition: string;
  reason: string;
  inspectionNotes?: string | null;
  transferId?: string | null;
}

export interface CreateBranchReturnInput {
  sourceLocationId: string;
  destinationLocationId: string;
  returnDate: string;
  returnReason: string;
  priority: "low" | "normal" | "high" | "urgent";
  notes: string;
  items: BranchReturnItemInput[];
}

export interface ReturnActionResult {
  ok: boolean;
  error?: string;
  warning?: string;
  id?: string;
  number?: number;
}

const RETURN_PRODUCTS_PATH = "/inventory/return-products";

function revalidateReturnViews() {
  revalidatePath(RETURN_PRODUCTS_PATH);
  revalidatePath("/inventory");
  revalidatePath("/inventory/history");
}

async function recordReturnAudit(
  admin: ReturnType<typeof createAdminClient>,
  input: { orgId: string; actorId: string; action: string; entityType: string; entityId: string; metadata?: Record<string, unknown> }
): Promise<string | null> {
  const { error } = await admin.from("audit_logs").insert({
    org_id: input.orgId,
    actor_id: input.actorId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId,
    metadata: { module: "return_products", ...input.metadata },
  });
  if (error) {
    console.error("Could not record branch return audit event:", error.message);
    return error.message;
  }
  return null;
}

export async function createBranchProductReturn(input: CreateBranchReturnInput): Promise<ReturnActionResult> {
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "Your session expired. Please sign in again." };
  if (!await canPermission("inventory", "create")) {
    return { ok: false, error: "You do not have permission to create inventory returns." };
  }
  if (!input.sourceLocationId || !canAccessLocation(context, input.sourceLocationId)) {
    return { ok: false, error: "You are not assigned to the selected source branch." };
  }
  if (!input.destinationLocationId || input.destinationLocationId === input.sourceLocationId) {
    return { ok: false, error: "Choose a returns warehouse different from the source branch." };
  }
  if (!input.returnReason.trim() || !Array.isArray(input.items) || input.items.length === 0) {
    return { ok: false, error: "Enter a return reason and add at least one product." };
  }
  const seenProducts = new Set<string>();
  for (const item of input.items) {
    if (!item.productId || !Number.isInteger(item.quantity) || item.quantity <= 0) {
      return { ok: false, error: "Return quantities must be positive whole numbers." };
    }
    if (seenProducts.has(item.productId)) return { ok: false, error: "Each product can only appear once in a return." };
    if (!item.condition.trim() || !item.reason.trim()) {
      return { ok: false, error: "Select a condition and reason for every return item." };
    }
    seenProducts.add(item.productId);
  }

  const admin = createAdminClient();
  const { data: destination, error: destinationError } = await admin
    .from("business_locations")
    .select("id, location_type, is_active")
    .eq("id", input.destinationLocationId)
    .eq("org_id", context.orgId)
    .maybeSingle();
  if (destinationError) return { ok: false, error: destinationError.message };
  if (!destination?.is_active || (destination.location_type !== "warehouse" && destination.location_type !== "distribution_center")) {
    return { ok: false, error: "The destination must be an active warehouse or distribution center." };
  }

  const { data, error } = await admin.rpc("submit_branch_product_return", {
    p_org_id: context.orgId,
    p_actor_id: context.userId,
    p_source_location_id: input.sourceLocationId,
    p_destination_location_id: input.destinationLocationId,
    p_return_date: input.returnDate || new Date().toISOString().slice(0, 10),
    p_return_reason: input.returnReason.trim(),
    p_priority: input.priority,
    p_notes: input.notes.trim() || null,
    p_items: input.items.map((item) => ({
      product_id: item.productId,
      quantity: item.quantity,
      condition: item.condition.trim(),
      reason: item.reason.trim(),
      inspection_notes: item.inspectionNotes?.trim() || null,
      transfer_id: item.transferId || null,
    })),
  });
  const created = data?.[0];
  if (error || !created) {
    return { ok: false, error: error?.message ?? "The return could not be submitted." };
  }
  revalidateReturnViews();
  return { ok: true, id: created.return_id, number: Number(created.return_number) };
}

export async function uploadBranchProductReturnAttachments(returnId: string, formData: FormData): Promise<ReturnActionResult> {
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "Your session expired. Please sign in again." };
  const canCreate = await canPermission("inventory", "create");
  const canManage = await canPermission("inventory", "approve");
  if (!canCreate && !canManage) return { ok: false, error: "You do not have permission to attach return evidence." };
  const files = formData.getAll("files").filter((value): value is File => value instanceof File && value.size > 0);
  if (files.length === 0) return { ok: true };
  if (files.length > 10) return { ok: false, error: "You can upload a maximum of 10 attachments per submission." };
  const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);
  for (const file of files) {
    if (!allowedTypes.has(file.type)) return { ok: false, error: `Unsupported attachment type: ${file.name}. Use PDF, JPG, or PNG.` };
    if (file.size > 5 * 1024 * 1024) return { ok: false, error: `${file.name} exceeds the 5 MB file limit.` };
  }

  const admin = createAdminClient();
  const { data: parent, error: parentError } = await admin
    .from("branch_product_returns")
    .select("id, source_location_id")
    .eq("id", returnId)
    .eq("org_id", context.orgId)
    .maybeSingle();
  if (parentError || !parent) return { ok: false, error: parentError?.message ?? "Return not found." };
  if (!canAccessLocation(context, parent.source_location_id)) return { ok: false, error: "You cannot attach files to this branch return." };

  const uploadedPaths: string[] = [];
  const attachmentRows: {
    org_id: string;
    return_id: string;
    storage_path: string;
    file_name: string;
    content_type: string;
    file_size: number;
    uploaded_by: string;
  }[] = [];
  for (const file of files) {
    const safeName = file.name.replace(/[^\w.-]/g, "_").slice(-120) || "attachment";
    const path = `${context.orgId}/${returnId}/${context.userId}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await admin.storage
      .from("branch-return-attachments")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) {
      await admin.storage.from("branch-return-attachments").remove(uploadedPaths);
      return { ok: false, error: `Could not upload ${file.name}: ${uploadError.message}` };
    }
    uploadedPaths.push(path);
    attachmentRows.push({
      org_id: context.orgId,
      return_id: returnId,
      storage_path: path,
      file_name: file.name,
      content_type: file.type,
      file_size: file.size,
      uploaded_by: context.userId,
    });
  }
  const { error: insertError } = await admin.from("branch_product_return_attachments").insert(attachmentRows);
  if (insertError) {
    await admin.storage.from("branch-return-attachments").remove(uploadedPaths);
    return { ok: false, error: `Files were uploaded but could not be linked to the return: ${insertError.message}` };
  }
  const auditWarning = await recordReturnAudit(admin, {
    orgId: context.orgId,
    actorId: context.userId,
    action: "branch_product_return.attachments_uploaded",
    entityType: "branch_product_returns",
    entityId: returnId,
    metadata: { files: files.map((file) => file.name) },
  });
  revalidatePath(`${RETURN_PRODUCTS_PATH}/${returnId}`);
  return { ok: true, ...(auditWarning ? { warning: `File upload succeeded but its audit event failed: ${auditWarning}` } : {}) };
}

export async function reviewBranchProductReturn(returnId: string): Promise<ReturnActionResult> {
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "Your session expired. Please sign in again." };
  if (!await canPermission("inventory", "approve")) {
    return { ok: false, error: "You do not have permission to review branch returns." };
  }
  const admin = createAdminClient();
  const { data: branchReturn, error: fetchError } = await admin
    .from("branch_product_returns")
    .select("id, source_location_id, status")
    .eq("id", returnId)
    .eq("org_id", context.orgId)
    .maybeSingle();
  if (fetchError || !branchReturn) return { ok: false, error: fetchError?.message ?? "Return not found." };
  if (!canAccessLocation(context, branchReturn.source_location_id)) return { ok: false, error: "You cannot review this branch return." };
  if (branchReturn.status !== "pending_review") return { ok: false, error: "This return is no longer awaiting review." };

  const { error } = await admin
    .from("branch_product_returns")
    .update({ status: "pending_identification", updated_at: new Date().toISOString() })
    .eq("id", returnId)
    .eq("org_id", context.orgId)
    .eq("status", "pending_review");
  if (error) return { ok: false, error: error.message };
  const auditWarning = await recordReturnAudit(admin, {
    orgId: context.orgId,
    actorId: context.userId,
    action: "branch_product_return.reviewed",
    entityType: "branch_product_returns",
    entityId: returnId,
    metadata: { status: "pending_identification" },
  });
  revalidateReturnViews();
  return { ok: true, ...(auditWarning ? { warning: `Return review succeeded but its audit event failed: ${auditWarning}` } : {}) };
}

export async function identifyBranchProductReturnItem(itemId: string, purchaseItemId: string): Promise<ReturnActionResult> {
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "Your session expired. Please sign in again." };
  if (!await canPermission("inventory", "approve")) {
    return { ok: false, error: "You do not have permission to identify return suppliers." };
  }
  const admin = createAdminClient();
  const { data: item, error: itemError } = await admin
    .from("branch_product_return_items")
    .select("id, product_id, return_id, supplier_id")
    .eq("id", itemId)
    .eq("org_id", context.orgId)
    .maybeSingle();
  if (itemError || !item) return { ok: false, error: itemError?.message ?? "Return item not found." };
  if (item.supplier_id) return { ok: false, error: "A supplier has already been identified for this item." };

  const { data: parent, error: parentError } = await admin
    .from("branch_product_returns")
    .select("id, source_location_id, status")
    .eq("id", item.return_id)
    .eq("org_id", context.orgId)
    .maybeSingle();
  if (parentError || !parent) return { ok: false, error: parentError?.message ?? "Return not found." };
  if (!canAccessLocation(context, parent.source_location_id)) return { ok: false, error: "You cannot identify this branch return." };
  if (parent.status !== "pending_identification" && parent.status !== "identified") {
    return { ok: false, error: "Review the return before identifying its supplier." };
  }

  const { data: purchaseItem, error: purchaseItemError } = await admin
    .from("purchase_items")
    .select("id, product_id, purchase_id, quantity_received, unit_price, purchase:purchases!inner(id, org_id, supplier_id, status)")
    .eq("id", purchaseItemId)
    .eq("product_id", item.product_id)
    .maybeSingle();
  if (purchaseItemError || !purchaseItem) {
    return { ok: false, error: purchaseItemError?.message ?? "No matching purchase line was found for this product." };
  }
  const purchase = Array.isArray(purchaseItem.purchase) ? purchaseItem.purchase[0] : purchaseItem.purchase;
  if (!purchase || purchase.org_id !== context.orgId || !["received", "partially_received"].includes(purchase.status)) {
    return { ok: false, error: "Choose a received purchase in this organization." };
  }

  const { error: updateError } = await admin
    .from("branch_product_return_items")
    .update({
      supplier_id: purchase.supplier_id,
      purchase_id: purchase.id,
      purchase_item_id: purchaseItem.id,
    })
    .eq("id", itemId)
    .eq("org_id", context.orgId)
    .is("supplier_id", null);
  if (updateError) return { ok: false, error: updateError.message };

  const { data: allItems, error: allItemsError } = await admin
    .from("branch_product_return_items")
    .select("supplier_id")
    .eq("return_id", parent.id);
  if (allItemsError) return { ok: false, error: allItemsError.message };
  const nextStatus = (allItems ?? []).every((row) => row.supplier_id || row.supplier_id === purchase.supplier_id)
    ? "identified"
    : "pending_identification";
  const { error: statusError } = await admin
    .from("branch_product_returns")
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq("id", parent.id)
    .eq("org_id", context.orgId);
  if (statusError) return { ok: false, error: statusError.message };

  const auditWarning = await recordReturnAudit(admin, {
    orgId: context.orgId,
    actorId: context.userId,
    action: "branch_product_return.supplier_identified",
    entityType: "branch_product_return_items",
    entityId: itemId,
    metadata: { supplier_id: purchase.supplier_id, purchase_id: purchase.id, purchase_item_id: purchaseItem.id },
  });
  revalidateReturnViews();
  return { ok: true, ...(auditWarning ? { warning: `Supplier identification succeeded but its audit event failed: ${auditWarning}` } : {}) };
}

export async function consolidateBranchProductReturns(returnItemIds: string[]): Promise<ReturnActionResult> {
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "Your session expired. Please sign in again." };
  if (context.isBranchScoped || !await canPermission("inventory", "approve")) {
    return { ok: false, error: "Only authorized central returns staff can consolidate branch returns." };
  }
  const uniqueIds = [...new Set(returnItemIds.filter(Boolean))];
  if (uniqueIds.length === 0) return { ok: false, error: "Select at least one identified return item." };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("consolidate_branch_product_returns", {
    p_org_id: context.orgId,
    p_actor_id: context.userId,
    p_return_item_ids: uniqueIds,
  });
  const created = data?.[0];
  if (error || !created) return { ok: false, error: error?.message ?? "Could not consolidate the selected items." };
  revalidateReturnViews();
  return { ok: true, id: created.consolidation_id, number: Number(created.consolidation_number) };
}

export async function createPurchaseReturnFromBranchConsolidation(consolidationId: string): Promise<ReturnActionResult> {
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "Your session expired. Please sign in again." };
  if (context.isBranchScoped || !await canPermission("purchases", "create")) {
    return { ok: false, error: "Only authorized central purchasing staff can create a supplier return." };
  }
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("create_branch_return_purchase_return", {
    p_org_id: context.orgId,
    p_actor_id: context.userId,
    p_consolidation_id: consolidationId,
  });
  const created = data?.[0];
  if (error || !created) return { ok: false, error: error?.message ?? "Could not create the supplier Purchase Return." };
  revalidateReturnViews();
  revalidatePath("/purchases/returns");
  revalidatePath("/inventory");
  return { ok: true, id: created.purchase_return_id, number: created.purchase_return_number };
}

export async function recordBranchReturnSupplierResponse(
  consolidationId: string,
  responses: { returnItemId: string; acceptedQuantity: number; rejectedQuantity: number }[],
  notes: string
): Promise<ReturnActionResult> {
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "Your session expired. Please sign in again." };
  if (context.isBranchScoped || !await canPermission("purchases", "approve")) {
    return { ok: false, error: "Only authorized central purchasing staff can record supplier outcomes." };
  }
  if (!responses.length || responses.some((row) =>
    !row.returnItemId || !Number.isInteger(row.acceptedQuantity) || !Number.isInteger(row.rejectedQuantity)
    || row.acceptedQuantity < 0 || row.rejectedQuantity < 0
  )) {
    return { ok: false, error: "Provide non-negative whole-number accepted and rejected quantities for each return item." };
  }
  if (new Set(responses.map((row) => row.returnItemId)).size !== responses.length) {
    return { ok: false, error: "Each return item can only have one supplier outcome." };
  }
  const admin = createAdminClient();
  const { error } = await admin.rpc("record_branch_product_supplier_response", {
    p_org_id: context.orgId,
    p_actor_id: context.userId,
    p_consolidation_id: consolidationId,
    p_responses: responses.map((row) => ({
      return_item_id: row.returnItemId,
      accepted_quantity: row.acceptedQuantity,
      rejected_quantity: row.rejectedQuantity,
    })),
    p_notes: notes.trim() || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidateReturnViews();
  revalidatePath("/purchases/returns");
  return { ok: true };
}
