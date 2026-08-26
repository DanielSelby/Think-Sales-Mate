"use server";
// Target path in your repo: app/(dashboard)/inventory/adjustments/actions.ts

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { can } from "@/lib/rbac";

export type AdjustmentStatus = "draft" | "in_progress" | "completed";
export type AdjustmentCountType = "stock_taking" | "adjustment_only";

export interface AdjustmentItemInput {
  productId: string;
  systemStock: number;
  countedStock: number;
  unitCost: number;
  reason?: string | null;
}

export interface CreateAdjustmentPayload {
  referenceNo?: string;
  adjustmentDate?: string;
  locationId: string | null;
  countType: AdjustmentCountType;
  status: AdjustmentStatus;
  responsiblePersonId?: string | null;
  adjustmentAccount?: string;
  /** Optional explicit override — falls back to an auto-generated reason by countType if omitted. */
  reason?: string;
  note?: string;
  items: AdjustmentItemInput[];
}

export interface CreateAdjustmentResult {
  error?: string;
  adjustmentId?: string;
  success?: boolean;
}

export async function createStockAdjustment(payload: CreateAdjustmentPayload): Promise<CreateAdjustmentResult> {
  const context = await getCurrentOrgContext();
  if (!context) return { error: "Your session expired — please sign in again." };
  if (!can(context.role, "inventory.manage")) {
    return { error: "You don't have permission to record stock adjustments." };
  }
  if (!payload.locationId) {
    return { error: "Choose a warehouse/location for this count." };
  }
  const locationId = payload.locationId;

  // Only lines with a real variance carry information worth keeping — an
  // item left at its system quantity wasn't actually adjusted.
  const items = (payload.items ?? []).filter(
    (item) => item.productId && item.countedStock !== item.systemStock
  );

  if (payload.status === "completed" && items.length === 0) {
    return { error: "No variances to apply — nothing has been counted differently from system stock yet." };
  }

  const supabase = await createClient();

  const { data: adjustment, error: adjustmentError } = await supabase
    .from("stock_adjustments")
    .insert({
      org_id: context.orgId,
      reference_no: payload.referenceNo?.trim() || null,
      adjustment_date: payload.adjustmentDate || new Date().toISOString().slice(0, 10),
      location_id: locationId,
      count_type: payload.countType,
      status: payload.status,
      resposible_person_id: payload.responsiblePersonId || "",
      adjustment_account: payload.adjustmentAccount || "General",

      reason:
        payload.reason?.trim() ||
        (payload.countType === "stock_taking" ? "Stock Taking Final Count" : "Inventory Adjustment"),
      note: payload.note?.trim() || null,
      created_by: context.userId
    })
    .select("id")
    .single();

  if (adjustmentError || !adjustment) {
    return { error: adjustmentError?.message ?? "Could not save the stock adjustment." };
  }

  if (items.length > 0) {
    const itemRows = items.map((item) => ({
      adjustment_id: adjustment.id,
      org_id: context.orgId,
      product_id: item.productId,
      system_stock: item.systemStock,
      counted_stock: item.countedStock,
      unit_cost: item.unitCost,
    }));

    const { error: itemsError } = await supabase.from("stock_adjustment_items").insert(itemRows);
    if (itemsError) {
      return { error: itemsError.message };
    }
  }

  // Only a finalized count is allowed to touch real stock — a draft or
  // in-progress count is just a saved worksheet.
  //
  // This calls adjust_product_stock_at_location once per line from
  // application code rather than assuming a trigger does it (unlike
  // stock_transfers, whose status changes are handled by a DB trigger —
  // see that migration's comments). stock_adjustments had no status
  // column before this change, so there's nothing an equivalent trigger
  // could have been keyed off yet. If you later add one for this table,
  // remove this loop so stock isn't adjusted twice.
  if (payload.status === "completed") {
    for (const item of items) {
      const delta = item.countedStock - item.systemStock;
      if (delta === 0) continue;
      const { error: rpcError } = await supabase.rpc("adjust_product_stock_at_location", {
        p_product_id: item.productId,
        p_location_id: locationId,
        p_org_id: context.orgId,
        p_delta: delta
      });
      if (rpcError) {
        return {
          error: `Saved the count, but couldn't apply it to stock levels (${rpcError.message}). Please check inventory manually before relying on it.`
        };
      }
    }
  }

  revalidatePath("/inventory/adjustments");
  revalidatePath("/inventory/stock-taking");
  revalidatePath("/inventory/history");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  return { adjustmentId: adjustment.id, success: true };
}