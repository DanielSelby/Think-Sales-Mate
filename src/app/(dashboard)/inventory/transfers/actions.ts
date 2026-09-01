"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { can } from "@/lib/rbac";
import type { TransferStatus } from "@/types/database";

export interface TransferItemInput {
  productId: string;
  quantity: number;
}

export interface CreateTransferPayload {
  fromLocationId: string;
  toLocationId: string;
  referenceNo?: string;
  reason?: string;
  transferDate?: string;
  notes?: string;
  shippingCharges?: number;
  items: TransferItemInput[];
}

export interface CreateTransferResult {
  error?: string;
  transferId?: string;
}

export async function createStockTransfer(payload: CreateTransferPayload): Promise<CreateTransferResult> {
  const context = await getCurrentOrgContext();
  if (!context) return { error: "Your session expired — please sign in again." };
  if (!can(context.role, "inventory.manage")) {
    return { error: "You don't have permission to create stock transfers." };
  }
  if (payload.fromLocationId === payload.toLocationId) {
    return { error: "Source and destination locations must be different." };
  }

  const items = payload.items.filter((item) => item.quantity > 0 && item.productId);
  if (items.length === 0) {
    return { error: "Add at least one product to the transfer." };
  }

  const supabase = await createClient();

  // Re-check real, current per-location stock server-side — never trust
  // whatever the browser last rendered, since it can be stale.
  const { data: levels, error: levelsError } = await supabase
    .from("product_stock_levels")
    .select("product_id, quantity, products(name, cost_price, unit_price)")
    .eq("location_id", payload.fromLocationId)
    .in(
      "product_id",
      items.map((i) => i.productId)
    );

  if (levelsError) return { error: levelsError.message };

  const availableByProduct = new Map((levels ?? []).map((l) => [l.product_id, l]));

  // Self-heal: If any products are missing product_stock_levels rows at the source location
  // but have org-wide stock associated with this branch, seed them now.
  const missingProductIds = items.filter((i) => !availableByProduct.has(i.productId)).map((i) => i.productId);
  if (missingProductIds.length > 0) {
    const { data: missingProducts } = await supabase
      .from("products")
      .select("id, name, location_id, stock_quantity, cost_price, unit_price")
      .in("id", missingProductIds);

    for (const prod of missingProducts ?? []) {
      const seedQty = (prod.location_id === payload.fromLocationId || !prod.location_id) ? (prod.stock_quantity ?? 0) : 0;
      if (seedQty > 0) {
        await supabase.from("product_stock_levels").upsert(
          {
            org_id: context.orgId,
            product_id: prod.id,
            location_id: payload.fromLocationId,
            quantity: seedQty,
          },
          { onConflict: "product_id,location_id", ignoreDuplicates: true }
        );
        availableByProduct.set(prod.id, {
          product_id: prod.id,
          quantity: seedQty,
          products: prod,
        } as any);
      }
    }
  }

  for (const item of items) {
    const level = availableByProduct.get(item.productId);
    const available = level?.quantity ?? 0;
    if (item.quantity > available) {
      const product = Array.isArray(level?.products) ? level?.products[0] : level?.products;
      return {
        error: `Not enough stock for "${product?.name ?? "one of the selected products"}" at the source location: ${available} available, ${item.quantity} requested.`
      };
    }
  }

  const { data: transfer, error: transferError } = await supabase
    .from("stock_transfers")
    .insert({
      org_id: context.orgId,
      from_location_id: payload.fromLocationId,
      to_location_id: payload.toLocationId,
      // Confirming a transfer here means the stock leaves the source
      // location immediately, so it starts life as "in transit," not
      // "pending" — see the trigger comments in the migration.
      status: "in_transit",
      reference_no: payload.referenceNo?.trim() || null,
      reason: payload.reason?.trim() || null,
      transfer_date: payload.transferDate || new Date().toISOString().slice(0, 10),
      notes: payload.notes?.trim() || null,
    
      created_by: context.userId
    })
    .select("id")
    .single();

  if (transferError || !transfer) {
    return { error: transferError?.message ?? "Could not create the transfer." };
  }

  const itemRows = items.map((item) => {
    const level = availableByProduct.get(item.productId);
    const product = Array.isArray(level?.products) ? level?.products[0] : level?.products;
    const unitCost = product?.cost_price ?? product?.unit_price ?? 0;
    return {
      transfer_id: transfer.id,
      org_id: context.orgId,
      product_id: item.productId,
      quantity: item.quantity,
      unit_cost: unitCost
    };
  });

  const { error: itemsError } = await supabase.from("stock_transfer_items").insert(itemRows);

  if (itemsError) {
    const message =
      itemsError.code === "23514"
        ? "One of these products doesn't have enough stock at the source location — someone may have just recorded another transfer or sale. Please refresh and try again."
        : itemsError.message;
    return { error: message };
  }

  revalidatePath("/inventory/transfers");
  revalidatePath("/inventory");
  return { transferId: transfer.id };
}

export async function updateTransferStatus(transferId: string, status: TransferStatus) {
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "inventory.manage")) {
    return { error: "You don't have permission to update transfers." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("stock_transfers")
    .update({
      status,
      completed_at: status === "completed" ? new Date().toISOString() : null
    })
    .eq("id", transferId)
    .eq("org_id", context.orgId);

  if (error) return { error: error.message };

  revalidatePath("/inventory/transfers");
  revalidatePath(`/inventory/transfers/${transferId}`);
  revalidatePath("/inventory");
  return { success: true };
}

export interface TransferItemDetail {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitCost: number;
}

export async function getTransferItems(transferId: string): Promise<TransferItemDetail[]> {
  const context = await getCurrentOrgContext();
  if (!context) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("stock_transfer_items")
    .select("product_id, quantity, unit_cost, products(name, sku)")
    .eq("transfer_id", transferId)
    .eq("org_id", context.orgId);

  return (data ?? []).map((row) => {
    const product = Array.isArray(row.products) ? row.products[0] : row.products;
    return {
      productId: row.product_id,
      productName: product?.name ?? "Deleted product",
      sku: product?.sku ?? "",
      quantity: row.quantity,
      unitCost: row.unit_cost
    };
  });
}

export async function deleteTransfer(transferId: string) {
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "inventory.manage")) {
    return { error: "You don't have permission to delete transfers." };
  }

  const supabase = await createClient();

  const { data: transfer, error: fetchError } = await supabase
    .from("stock_transfers")
    .select("status, from_location_id, to_location_id")
    .eq("id", transferId)
    .eq("org_id", context.orgId)
    .single();

  if (fetchError || !transfer) {
    return { error: fetchError?.message ?? "Transfer not found." };
  }

  // Deleting must never silently corrupt real inventory — first reverse
  // whatever stock movement this transfer already caused, exactly like
  // cancelling would, then remove the record.
  if (transfer.status === "pending" || transfer.status === "in_transit") {
    // Stock already left the source; restore it there (same effect as
    // the "cancelled" trigger, reused by going through that path).
    const { error: cancelError } = await supabase
      .from("stock_transfers")
      .update({ status: "cancelled" })
      .eq("id", transferId)
      .eq("org_id", context.orgId);
    if (cancelError) return { error: cancelError.message };
  } else if (transfer.status === "completed") {
    // Stock already arrived at the destination; take it back out before
    // deleting the record so company-wide inventory stays correct.
    const { data: items } = await supabase
      .from("stock_transfer_items")
      .select("product_id, quantity")
      .eq("transfer_id", transferId);

    for (const item of items ?? []) {
      const { data: level } = await supabase
        .from("product_stock_levels")
        .select("quantity")
        .eq("product_id", item.product_id)
        .eq("location_id", transfer.to_location_id)
        .maybeSingle();

      const newQuantity = Math.max((level?.quantity ?? 0) - item.quantity, 0);
      const { error: updateError } = await supabase
        .from("product_stock_levels")
        .update({ quantity: newQuantity, updated_at: new Date().toISOString() })
        .eq("product_id", item.product_id)
        .eq("location_id", transfer.to_location_id);
      if (updateError) return { error: updateError.message };
    }
  }
  // If already 'cancelled', stock was already restored — nothing more to reverse.

  const { error: deleteError } = await supabase
    .from("stock_transfers")
    .delete()
    .eq("id", transferId)
    .eq("org_id", context.orgId);

  if (deleteError) return { error: deleteError.message };

  revalidatePath("/inventory/transfers");
  revalidatePath("/inventory");
  return { success: true };
}