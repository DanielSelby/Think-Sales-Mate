"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { can } from "@/lib/rbac";

export interface AdjustmentItemInput {
  productId: string;
  systemStock: number;
  countedStock: number;
  unitCost: number;
}

export interface CreateAdjustmentPayload {
  referenceNo?: string;
  adjustmentDate?: string;
  locationId?: string | null;
  reason?: string;
  note?: string;
  items: AdjustmentItemInput[];
}

export interface CreateAdjustmentResult {
  error?: string;
  adjustmentId?: string;
}

export async function createStockAdjustment(payload: CreateAdjustmentPayload): Promise<CreateAdjustmentResult> {
  const context = await getCurrentOrgContext();
  if (!context) return { error: "Your session expired — please sign in again." };
  if (!can(context.role, "inventory.manage")) {
    return { error: "You don't have permission to adjust stock." };
  }

  // Only lines whose counted quantity actually differs are worth recording
  // — a "0 change" row from the picker shouldn't write a no-op history row.
  const items = payload.items.filter((item) => item.productId && item.countedStock !== item.systemStock);
  if (items.length === 0) {
    return { error: "Adjust at least one product's counted stock before confirming." };
  }

  const supabase = await createClient();

  const { data: adjustment, error: adjustmentError } = await supabase
    .from("stock_adjustments")
    .insert({
      org_id: context.orgId,
      reference_no: payload.referenceNo?.trim() || null,
      adjustment_date: payload.adjustmentDate || new Date().toISOString().slice(0, 10),
      location_id: payload.locationId || null,
      reason: payload.reason?.trim() || null,
      note: payload.note?.trim() || null,
      created_by: context.userId
    })
    .select("id")
    .single();

  if (adjustmentError || !adjustment) {
    return { error: adjustmentError?.message ?? "Could not create the adjustment." };
  }

  const itemRows = items.map((item) => ({
    adjustment_id: adjustment.id,
    org_id: context.orgId,
    product_id: item.productId,
    system_stock: item.systemStock,
    counted_stock: item.countedStock,
    unit_cost: item.unitCost
  }));

  // Each inserted row triggers apply_stock_adjustment(), which writes the
  // counted quantity straight to products.stock_quantity.
  const { error: itemsError } = await supabase.from("stock_adjustment_items").insert(itemRows);

  if (itemsError) {
    return { error: itemsError.message };
  }

  revalidatePath("/inventory/adjustments");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");

  return { adjustmentId: adjustment.id };
}