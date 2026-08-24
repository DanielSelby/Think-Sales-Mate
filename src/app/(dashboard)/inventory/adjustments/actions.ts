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
  reason?: string;
  notes?: string;
}

export interface CreateAdjustmentPayload {
  referenceNo?: string;
  adjustmentDate?: string;
  locationId?: string | null;
  countType?: "stock_taking" | "adjustment_only";
  status?: "in_progress" | "draft" | "completed";
  responsiblePersonId?: string | null;
  adjustmentAccount?: string | null;
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
    return { error: "You don't have permission to adjust stock." };
  }

  // Only lines whose counted quantity actually differs are worth recording
  const items = payload.items.filter((item) => item.productId && item.countedStock !== item.systemStock);
  if (items.length === 0 && payload.status === "completed") {
    return { error: "Adjust at least one product's counted stock before finalizing." };
  }

  const supabase = await createClient();

  const { data: adjustment, error: adjustmentError } = await supabase
    .from("stock_adjustments")
    .insert({
      org_id: context.orgId,
      reference_no: payload.referenceNo?.trim() || null,
      adjustment_date: payload.adjustmentDate || new Date().toISOString().slice(0, 10),
      location_id: payload.locationId || null,
      reason: payload.reason?.trim() || (payload.countType === "stock_taking" ? "Stock Taking Count" : "Inventory Adjustment"),
      note: payload.note?.trim() || null,
      created_by: payload.responsiblePersonId || context.userId,
    })
    .select("id")
    .single();

  if (adjustmentError || !adjustment) {
    return { error: adjustmentError?.message ?? "Could not create the adjustment." };
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

    // If a specific location was targeted, also update product_stock_levels
    if (payload.locationId) {
      for (const item of items) {
        await supabase
          .from("product_stock_levels")
          .upsert(
            {
              org_id: context.orgId,
              product_id: item.productId,
              location_id: payload.locationId,
              quantity: item.countedStock,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "product_id,location_id" }
          );
      }
    }
  }

  revalidatePath("/inventory/adjustments");
  revalidatePath("/inventory/stock-taking");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");

  return { adjustmentId: adjustment.id, success: true };
}