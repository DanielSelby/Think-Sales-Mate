"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

  // Same pattern as updateSale: writes here go through the admin
  // (service-role) client, since the regular client's UPDATE on `sales`
  // can silently match 0 rows under RLS with no error — the dialog would
  // close as if it worked while nothing actually changed.
  const admin = createAdminClient();

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
        const { error: insertError } = await admin.from("sale_return_items").insert({
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
      const lines = await getSaleReturnableItems(saleId);
      for (const line of lines.filter((l) => l.remaining > 0)) {
        const { error: insertError } = await admin.from("sale_return_items").insert({
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

      const { error: deleteError } = await admin.from("sale_return_items").delete().eq("sale_id", saleId);
      if (deleteError) throw new Error(deleteError.message);
    }

    const { error: updateError, count: updatedCount } = await admin
      .from("sales")
      .update({
        status,
        refunded_amount: nextRefundedAmount,
        status_note: note?.trim() || null,
        status_changed_by: user.id,
      }, { count: "exact" })
      .eq("id", saleId);
    if (updateError) throw new Error(updateError.message);
    if ((updatedCount ?? 0) === 0) {
      throw new Error("The status update didn't apply to any row — check the sales table's UPDATE policy.");
    }
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
  subtotal:        number;
  total:           number;
  lines?: {
    productId:        string;
    quantity:         number;
    unitPrice:        number;
    lineTotal:        number;
    discountAmount?:  number | null;
    taxAmount?:       number | null;
  }[];
  items?: {
    productId:          string;
    quantity:           number;
    unitPrice?:         number;
    unitPriceOverride?: number | null;
    discountPercent?:   number;
    discountAmount?:    number | null;
    taxPercent?:        number;
    taxAmount?:         number | null;
    lineTotal?:         number;
    notes?:             string | null;
  }[];
}

export interface RecordSaleResult {
  ok:         boolean;
  saleId?:    string;
  saleNumber?: number;
  error?:     string;
}

export async function recordSale(input: RecordSaleInput): Promise<RecordSaleResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  try {
    const { data: sale, error: saleError } = await supabase
      .from("sales")
      .insert({
        org_id:          input.orgId,
        customer_name:   input.customerName ?? null,
        customer_id:     input.customerId ?? null,
        location_id:     input.locationId ?? null,
        reference:       input.reference ?? null,
        sale_date:       input.saleDate ?? new Date().toISOString().slice(0, 10),
        subtotal:        input.subtotal,
        discount_amount: input.discountAmount ?? 0,
        tax_amount:      input.taxAmount ?? 0,
        shipping_amount: input.shippingAmount ?? 0,
        total:           input.total,
        payment_method:  input.paymentMethod ?? null,
        amount_paid:     input.amountPaid ?? null,
        sold_by:         user.id,
        status:          "completed",
      })
      .select("id, sale_number")
      .single();

    if (saleError || !sale) throw new Error(saleError?.message ?? "Failed to create sale.");

    const allLines = [
      ...(input.lines ?? []).map(l => ({
        sale_id:          sale.id,
        org_id:           input.orgId,
        product_id:       l.productId,
        quantity:         l.quantity,
        unit_price:       l.unitPrice ?? 0,
        discount_percent: 0,
        tax_percent:      0,
        line_total:       l.lineTotal ?? 0,
      })),
      ...(input.items ?? []).map(l => ({
        sale_id:          sale.id,
        org_id:           input.orgId,
        product_id:       l.productId,
        quantity:         l.quantity,
        unit_price:       l.unitPriceOverride ?? l.unitPrice ?? 0,
        discount_percent: l.discountPercent ?? 0,
        tax_percent:      l.taxPercent ?? 0,
        line_total:       l.lineTotal ?? 0,
      })),
    ];

    if (allLines.length > 0) {
      const { error: itemsError } = await supabase.from("sale_items").insert(allLines);
      if (itemsError) throw new Error(itemsError.message);
    }

    for (const l of [...(input.lines ?? []), ...(input.items ?? [])]) {
      await (supabase as any).rpc("adjust_product_stock", {
        p_product_id: l.productId,
        p_delta:      -l.quantity,
      });
    }

    revalidatePath("/sales");
    revalidatePath("/inventory");
    return { ok: true, saleId: sale.id, saleNumber: sale.sale_number };

  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

// ---------------------------------------------------------------------------
// Fetch line items for invoice display
// ---------------------------------------------------------------------------
// Edit an existing sale — load + save
// ---------------------------------------------------------------------------
export interface SaleEditData {
  id:            string;
  saleNumber:    number;
  customerId:    string | null;
  customerName:  string | null;
  locationId:    string | null;
  reference:     string | null;
  saleDate:      string;
  paymentMethod: string | null;
  amountPaid:    number | null;
  shippingAmount: number;
  discountAmount: number;
  taxAmount:      number;
  items: { productId: string; quantity: number; unitPrice: number; discountPercent: number; taxPercent: number }[];
}

export async function getSaleForEdit(saleId: string): Promise<SaleEditData | null> {
  const supabase = await createClient();

  const { data: sale } = await supabase
    .from("sales")
    .select("id, sale_number, customer_id, customer_name, location_id, reference, sale_date, payment_method, amount_paid, shipping_amount, discount_amount, tax_amount")
    .eq("id", saleId)
    .single();
  if (!sale) return null;

  const { data: items } = await supabase
    .from("sale_items")
    .select("product_id, quantity, unit_price, discount_percent, tax_percent")
    .eq("sale_id", saleId);

  return {
    id: sale.id,
    saleNumber: sale.sale_number,
    customerId: sale.customer_id,
    customerName: sale.customer_name,
    locationId: sale.location_id,
    reference: sale.reference,
    saleDate: sale.sale_date,
    paymentMethod: sale.payment_method,
    amountPaid: sale.amount_paid,
    shippingAmount: sale.shipping_amount ?? 0,
    discountAmount: sale.discount_amount ?? 0,
    taxAmount: sale.tax_amount ?? 0,
    items: (items ?? []).map((i) => ({
      productId: i.product_id,
      quantity: i.quantity,
      unitPrice: i.unit_price,
      discountPercent: i.discount_percent,
      taxPercent: i.tax_percent,
    })),
  };
}

export interface UpdateSaleInput {
  saleId:          string;
  customerId?:     string | null;
  customerName?:   string | null;
  locationId?:     string | null;
  reference?:      string | null;
  saleDate?:       string | null;
  paymentMethod?:  string | null;
  amountPaid?:     number | null;
  shippingAmount?: number | null;
  discountAmount?: number | null;
  taxAmount?:      number | null;
  subtotal:        number;
  total:           number;
  items: { productId: string; quantity: number; unitPrice: number; discountPercent?: number; taxPercent?: number; lineTotal: number }[];
}

export async function updateSale(input: UpdateSaleInput): Promise<RecordSaleResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // sale_items' RLS appears to cover select/insert but not delete — the
  // user's identity/authorization is already verified above via
  // getUser(), so the delete+reinsert step runs through the admin
  // (service-role) client to avoid it silently matching 0 rows.
  const admin = createAdminClient();

  try {
    const { data: existingSale } = await supabase.from("sales").select("org_id").eq("id", input.saleId).single();
    if (!existingSale) throw new Error("Sale not found.");

    const { data: existingItems } = await supabase.from("sale_items").select("product_id, quantity").eq("sale_id", input.saleId);
    for (const item of existingItems ?? []) {
      await (supabase as any).rpc("adjust_product_stock", { p_product_id: item.product_id, p_delta: item.quantity });
    }

    const { error: deleteError, count: deletedCount } = await admin
      .from("sale_items")
      .delete({ count: "exact" })
      .eq("sale_id", input.saleId)
      .eq("org_id", existingSale.org_id);
    if (deleteError) throw new Error(deleteError.message);
    if ((deletedCount ?? 0) !== (existingItems?.length ?? 0)) {
      throw new Error(
        `Expected to remove ${existingItems?.length ?? 0} old line item(s) but removed ${deletedCount ?? 0} — aborting to avoid duplicate rows.`
      );
    }

    const { error: updateError } = await supabase
      .from("sales")
      .update({
        customer_name:   input.customerName ?? null,
        customer_id:     input.customerId ?? null,
        location_id:     input.locationId ?? null,
        reference:       input.reference ?? null,
        sale_date:       input.saleDate ?? new Date().toISOString().slice(0, 10),
        subtotal:        input.subtotal,
        discount_amount: input.discountAmount ?? 0,
        tax_amount:      input.taxAmount ?? 0,
        shipping_amount: input.shippingAmount ?? 0,
        total:           input.total,
        payment_method:  input.paymentMethod ?? null,
        amount_paid:     input.amountPaid ?? null,
      })
      .eq("id", input.saleId);
    if (updateError) throw new Error(updateError.message);

    if (input.items.length > 0) {
      const rows = input.items.map((l) => ({
        sale_id:          input.saleId,
        org_id:           existingSale.org_id,
        product_id:       l.productId,
        quantity:         l.quantity,
        unit_price:       l.unitPrice,
        discount_percent: l.discountPercent ?? 0,
        tax_percent:      l.taxPercent ?? 0,
        line_total:       l.lineTotal,
      }));
      const { error: itemsError } = await admin.from("sale_items").insert(rows);
      if (itemsError) throw new Error(itemsError.message);
    }

    for (const l of input.items) {
      await (supabase as any).rpc("adjust_product_stock", { p_product_id: l.productId, p_delta: -l.quantity });
    }

    revalidatePath("/sales");
    revalidatePath(`/sales/${input.saleId}`);
    revalidatePath("/inventory");
    return { ok: true, saleId: input.saleId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

// ---------------------------------------------------------------------------
// Add a customer from the Add Sale screen
// ---------------------------------------------------------------------------
export interface AddCustomerInput {
  name: string;
  contactType: "individual" | "business";
  contactId: string | null;
  phone: string;
  alternatePhone: string | null;
  landline: string | null;
  email: string | null;
}

export interface AddCustomerResult {
  ok: boolean;
  customer?: { id: string; name: string; email: string | null; phone: string | null };
  error?: string;
}

export async function addCustomer(orgId: string, input: AddCustomerInput): Promise<AddCustomerResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  try {
    const { data, error } = await supabase
      .from("customers")
      .insert({
        org_id: orgId,
        name: input.name,
        phone: input.phone || null,
        alternate_phone: input.alternatePhone || null,
        landline: input.landline || null,
        email: input.email || null,
        contact_type: input.contactType,
        contact_id: input.contactId || null,
        created_by: user.id,
      })
      .select("id, name, email, phone")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Failed to add customer.");

    revalidatePath("/sales/new");
    return { ok: true, customer: { id: data.id, name: data.name, email: data.email, phone: data.phone } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

// ---------------------------------------------------------------------------
// Fetch line items for invoice display
// ---------------------------------------------------------------------------
export interface SaleInvoiceLine {
  productId:   string;
  productName: string;
  sku:         string;
  quantity:    number;
  unitPrice:   number;
  discount:    number;
  tax:         number;
  lineTotal:   number;
}

export async function getSaleInvoiceItems(saleId: string): Promise<SaleInvoiceLine[]> {
  const supabase = await createClient();
  const { data: items } = await supabase
    .from("sale_items")
    .select("id, product_id, quantity, unit_price, discount_percent, tax_percent, line_total, product:products(name, sku)")
    .eq("sale_id", saleId);

  if (!items || items.length === 0) return [];

  return items.map((item) => ({
    productId:   item.product_id,
    productName: (item.product as { name: string; sku: string } | null)?.name ?? "Unknown product",
    sku:         (item.product as { name: string; sku: string } | null)?.sku ?? "",
    quantity:    item.quantity,
    unitPrice:   item.unit_price,
    discount:    item.discount_percent,
    tax:         item.tax_percent,
    lineTotal:   item.line_total,
  }));
}
