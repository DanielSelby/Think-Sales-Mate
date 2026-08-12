"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SaleStatus } from "@/types/database";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function getPrimaryLocationId(supabase: SupabaseClient, orgId: string): Promise<string | null> {
  const { data } = await supabase
    .from("business_locations")
    .select("id")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

// ---------------------------------------------------------------------------
// Fetch line items for the "Mark as Returned" picker
// ---------------------------------------------------------------------------

export interface ReturnableLine {
  saleItemId: string;
  productId: string;
  productName: string;
  quantitySold: number;
  alreadyReturned: number;
  remaining: number;
  unitPrice: number;
}

export async function getSaleReturnableItems(saleId: string): Promise<ReturnableLine[]> {
  const supabase = await createClient();

  const { data: items } = await supabase
    .from("sale_items")
    .select("id, product_id, quantity, unit_price, product:products ( name )")
    .eq("sale_id", saleId);

  if (!items || items.length === 0) return [];

  const { data: returns } = await supabase
    .from("sale_return_items")
    .select("sale_item_id, quantity")
    .eq("sale_id", saleId);

  const returnedByLine = new Map<string, number>();
  for (const r of returns ?? []) {
    returnedByLine.set(r.sale_item_id, (returnedByLine.get(r.sale_item_id) ?? 0) + r.quantity);
  }

  return items.map((item) => {
    const alreadyReturned = returnedByLine.get(item.id) ?? 0;
    return {
      saleItemId: item.id,
      productId: item.product_id,
      productName: (item.product as { name: string } | null)?.name ?? "Unknown product",
      quantitySold: item.quantity,
      alreadyReturned,
      remaining: Math.max(0, item.quantity - alreadyReturned),
      unitPrice: item.unit_price,
    };
  });
}

// ---------------------------------------------------------------------------
// Update sale status (+ restock / reverse restock as needed)
// ---------------------------------------------------------------------------

export interface UpdateSaleStatusInput {
  saleId: string;
  status: SaleStatus;
  refundedAmount?: number;
  note?: string;
  /** Only used when status === "returned": quantity being returned per line, > 0 only. */
  returnLines?: { saleItemId: string; productId: string; quantity: number }[];
}

export interface UpdateSaleStatusResult {
  ok: boolean;
  error?: string;
}

export async function updateSaleStatus({
  saleId,
  status,
  refundedAmount,
  note,
  returnLines,
}: UpdateSaleStatusInput): Promise<UpdateSaleStatusResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in to change a sale's status." };

  const { data: sale, error: fetchError } = await supabase
    .from("sales")
    .select("id, org_id, total, status, location_id")
    .eq("id", saleId)
    .single();
  if (fetchError || !sale) return { ok: false, error: "Sale not found." };

  const restockLocationId = sale.location_id ?? (await getPrimaryLocationId(supabase, sale.org_id));
  if (!restockLocationId) {
    return { ok: false, error: "This sale has no location and the org has no active location to restock to." };
  }

  const nextRefundedAmount = status === "returned" ? Math.max(0, refundedAmount ?? 0) : 0;
  if (nextRefundedAmount > sale.total) {
    return { ok: false, error: "Refund amount can't exceed the sale total." };
  }

  try {
    if (status === "returned") {
      const lines = (returnLines ?? []).filter((l) => l.quantity > 0);
      for (const line of lines) {
        const { error: insertError } = await supabase.from("sale_return_items").insert({
          org_id: sale.org_id,
          sale_id: saleId,
          sale_item_id: line.saleItemId,
          product_id: line.productId,
          quantity: line.quantity,
          location_id: restockLocationId,
          created_by: user.id,
        });
        if (insertError) throw new Error(insertError.message);

        const { error: rpcError } = await supabase.rpc("adjust_product_stock_at_location", {
          p_product_id: line.productId,
          p_location_id: restockLocationId,
          p_org_id: sale.org_id,
          p_delta: line.quantity,
        });
        if (rpcError) throw new Error(rpcError.message);
      }
    }

    if (status === "cancelled") {
      // Cancelling voids the sale outright — restock whatever hasn't
      // already been returned across every line.
      const lines = await getSaleReturnableItems(saleId);
      for (const line of lines.filter((l) => l.remaining > 0)) {
        const { error: insertError } = await supabase.from("sale_return_items").insert({
          org_id: sale.org_id,
          sale_id: saleId,
          sale_item_id: line.saleItemId,
          product_id: line.productId,
          quantity: line.remaining,
          location_id: restockLocationId,
          created_by: user.id,
        });
        if (insertError) throw new Error(insertError.message);

        const { error: rpcError } = await supabase.rpc("adjust_product_stock_at_location", {
          p_product_id: line.productId,
          p_location_id: restockLocationId,
          p_org_id: sale.org_id,
          p_delta: line.remaining,
        });
        if (rpcError) throw new Error(rpcError.message);
      }
    }

    if (status === "completed" && sale.status !== "completed") {
      // Restoring to Completed reverses any stock this sale previously put
      // back, then clears the return trail.
      const { data: existingReturns } = await supabase
        .from("sale_return_items")
        .select("product_id, quantity, location_id")
        .eq("sale_id", saleId);

      for (const r of existingReturns ?? []) {
        const reversalLocationId = r.location_id ?? restockLocationId;
        const { error: rpcError } = await supabase.rpc("adjust_product_stock_at_location", {
          p_product_id: r.product_id,
          p_location_id: reversalLocationId,
          p_org_id: sale.org_id,
          p_delta: -r.quantity,
        });
        if (rpcError) throw new Error(rpcError.message);
      }

      const { error: deleteError } = await supabase.from("sale_return_items").delete().eq("sale_id", saleId);
      if (deleteError) throw new Error(deleteError.message);
    }

    const { error: updateError } = await supabase
      .from("sales")
      .update({
        status,
        refunded_amount: nextRefundedAmount,
        status_note: note?.trim() || null,
        status_changed_by: user.id,
      })
      .eq("id", saleId);
    if (updateError) throw new Error(updateError.message);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong. Try again." };
  }

  revalidatePath("/sales");
  revalidatePath("/inventory");
  return { ok: true };
}