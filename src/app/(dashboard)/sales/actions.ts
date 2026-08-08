"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SaleStatus } from "@/types/database";

type SupabaseClient = ReturnType<typeof createClient>;

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
  const supabase = createClient();

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
// Fetch line items for the printable invoice
// ---------------------------------------------------------------------------

export interface InvoiceItemRow {
  productName: string;
  sku: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export async function getSaleInvoiceItems(saleId: string): Promise<InvoiceItemRow[]> {
  const supabase = createClient();

  const { data: items } = await supabase
    .from("sale_items")
    .select("quantity, unit_price, line_total, product:products ( name, sku )")
    .eq("sale_id", saleId);

  return (items ?? []).map((item) => {
    const product = item.product as { name: string; sku: string } | null;
    return {
      productName: product?.name ?? "Deleted product",
      sku: product?.sku ?? null,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      lineTotal: item.line_total
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
  const supabase = createClient();

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
      // Restoring to Completed reverses any stock this sale previously put h
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


// ---------------------------------------------------------------------------
// Record a new sale
// ---------------------------------------------------------------------------
export interface RecordSaleInput {
  orgId:           string;
  customerId?:     string | null;
  customerName?:   string | null;
  locationId?:     string | null;
  reference?:      string | null;
  note?:           string | null;
  notes?:          string | null;
  saleDate?:       string | null;
  paymentMethod?:  string | null;
  amountPaid?:     number | null;
  shippingAmount?: number | null;
  discountAmount?: number | null;
  taxAmount?:      number | null;
  lines?: {
    productId:        string;
    quantity:         number;
    unitPrice:        number;
    lineTotal:        number;
    discountAmount?:  number | null;
    taxAmount?:       number | null;
  }[];
  items?: {
    productId:        string;
    quantity:         number;
    unitPrice?:       number;
    unitPriceOverride?: number | null;
    discountPercent?: number;
    discountAmount?:  number | null;
    taxPercent?:      number;
    taxAmount?:       number | null;
    lineTotal?:       number;
    notes?:           string | null;
  }[];
  subtotal:        number;
  total:           number;
}

export interface RecordSaleResult {
  ok:      boolean;
  saleId?: string;
  error?:  string;
}

export async function recordSale(input: RecordSaleInput): Promise<RecordSaleResult> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  try {
    // Insert sale header
    const { data: sale, error: saleError } = await supabase
      .from("sales")
      .insert({
        org_id:        input.orgId,
        customer_name: input.customerName ?? null,
        subtotal:      input.subtotal,
        total:         input.total,
        status:        "completed",
        sold_by:       user.id,
      })
      .select("id")
      .single();

    if (saleError || !sale) throw new Error(saleError?.message ?? "Failed to create sale.");

    // Insert line items — support both `lines` and `items` field names
    const allLines = [
      ...(input.lines ?? []).map(l => ({
        sale_id:    sale.id,
        org_id:     input.orgId,
        product_id: l.productId,
        quantity:   l.quantity,
        unit_price: l.unitPrice ?? 0,
        line_total: l.lineTotal ?? 0,
      })),
      ...(input.items ?? []).map(l => ({
        sale_id:    sale.id,
        org_id:     input.orgId,
        product_id: l.productId,
        quantity:   l.quantity,
        unit_price: l.unitPriceOverride ?? l.unitPrice ?? 0,
        line_total: l.lineTotal ?? 0,
      })),
    ];

    if (allLines.length > 0) {
      const { error: itemsError } = await supabase.from("sale_items").insert(allLines);
      if (itemsError) throw new Error(itemsError.message);
    }

    // Deduct stock for each line
    for (const l of [...(input.lines ?? []), ...(input.items ?? [])]) {
      await (supabase as any).rpc("adjust_product_stock", {
        p_product_id: l.productId,
        p_delta:      -l.quantity,
      });
    }

    revalidatePath("/sales");
    revalidatePath("/inventory");
    return { ok: true, saleId: sale.id };

  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}