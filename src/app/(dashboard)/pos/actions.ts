"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import type { HeldSaleKind } from "@/types/database";

export interface CartItemInput {
  productId: string;
  name: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  discountPercent: number;
  taxPercent: number;
}

export interface SimpleResult {
  ok: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Customer search / quick add
// ---------------------------------------------------------------------------

export interface CustomerOption {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

export async function searchCustomers(query: string): Promise<CustomerOption[]> {
  const context = await getCurrentOrgContext();
  if (!context) return [];
  const supabase = createClient();
  const q = query.trim();
  if (!q) {
    const { data } = await supabase.from("customers").select("id, name, phone, email").eq("org_id", context.orgId).order("name").limit(8);
    return data ?? [];
  }
  const { data } = await supabase
    .from("customers")
    .select("id, name, phone, email")
    .eq("org_id", context.orgId)
    .or(`name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`)
    .limit(8);
  return data ?? [];
}

export async function quickAddCustomer(name: string, phone: string | null, email: string | null): Promise<{ ok: boolean; error?: string; customer?: CustomerOption }> {
  if (!name.trim()) return { ok: false, error: "Name is required." };
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "No active organization." };
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { data, error } = await supabase
    .from("customers")
    .insert({ org_id: context.orgId, name: name.trim(), phone, email, created_by: user.id })
    .select("id, name, phone, email")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Couldn't add customer." };
  return { ok: true, customer: data };
}

// ---------------------------------------------------------------------------
// Hold / Draft — park a cart before it's a real sale
// ---------------------------------------------------------------------------

export interface HeldSaleInput {
  locationId: string | null;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  orderNote: string | null;
  items: CartItemInput[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  kind: HeldSaleKind;
}

export async function parkSale(input: HeldSaleInput): Promise<SimpleResult> {
  if (input.items.length === 0) return { ok: false, error: "Cart is empty." };
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "No active organization." };
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { error } = await supabase.from("held_sales").insert({
    org_id: context.orgId,
    location_id: input.locationId,
    kind: input.kind,
    customer_id: input.customerId,
    customer_name: input.customerName,
    customer_phone: input.customerPhone,
    order_note: input.orderNote,
    items: input.items,
    subtotal: input.subtotal,
    discount_amount: input.discountAmount,
    tax_amount: input.taxAmount,
    total: input.total,
    created_by: user.id,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/pos");
  return { ok: true };
}

export interface HeldSaleSummary {
  id: string;
  customerName: string | null;
  itemCount: number;
  total: number;
  createdAt: string;
}

export async function listHeldSales(kind: HeldSaleKind): Promise<HeldSaleSummary[]> {
  const context = await getCurrentOrgContext();
  if (!context) return [];
  const supabase = createClient();
  const { data } = await supabase
    .from("held_sales")
    .select("id, customer_name, items, total, created_at")
    .eq("org_id", context.orgId)
    .eq("kind", kind)
    .order("created_at", { ascending: false });

  return (data ?? []).map((h) => ({
    id: h.id,
    customerName: h.customer_name,
    itemCount: Array.isArray(h.items) ? h.items.length : 0,
    total: h.total,
    createdAt: h.created_at,
  }));
}

export interface ResumedSale {
  locationId: string | null;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  orderNote: string | null;
  items: CartItemInput[];
}

export async function resumeHeldSale(id: string): Promise<ResumedSale | null> {
  const supabase = createClient();
  const { data } = await supabase.from("held_sales").select("*").eq("id", id).single();
  if (!data) return null;
  await supabase.from("held_sales").delete().eq("id", id);
  revalidatePath("/pos");
  return {
    locationId: data.location_id,
    customerId: data.customer_id,
    customerName: data.customer_name,
    customerPhone: data.customer_phone,
    orderNote: data.order_note,
    items: (data.items as CartItemInput[]) ?? [],
  };
}

export async function deleteHeldSale(id: string): Promise<SimpleResult> {
  const supabase = createClient();
  const { error } = await supabase.from("held_sales").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/pos");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Complete Sale — the real thing: creates sales + sale_items and posts
// real stock deductions via the same location-aware RPC used everywhere
// else in the app.
// ---------------------------------------------------------------------------

export interface CompleteSaleInput {
  locationId: string;
  customerId: string | null;
  customerName: string | null;
  orderNote: string | null;
  items: CartItemInput[];
  discountAmount: number;
  paymentMethod: string;
}

export interface CompleteSaleResult {
  ok: boolean;
  error?: string;
  saleId?: string;
}

export async function completeSale(input: CompleteSaleInput): Promise<CompleteSaleResult> {
  if (input.items.length === 0) return { ok: false, error: "Cart is empty." };
  if (!input.locationId) return { ok: false, error: "Select a branch/location." };

  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "No active organization." };
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  // Re-check stock at time of sale — the grid the cashier was looking at
  // may be a few seconds stale.
  const { data: stockRows } = await supabase
    .from("products")
    .select("id, name, stock_quantity")
    .in("id", input.items.map((i) => i.productId));
  const stockById = new Map((stockRows ?? []).map((p) => [p.id, p.stock_quantity]));
  for (const item of input.items) {
    const available = stockById.get(item.productId) ?? 0;
    if (item.quantity > available) {
      return { ok: false, error: `Only ${available} unit(s) of "${item.name}" left in stock.` };
    }
  }

  const lines = input.items.map((item) => {
    const gross = item.quantity * item.unitPrice;
    const lineDiscount = gross * (item.discountPercent / 100);
    const taxable = gross - lineDiscount;
    const lineTax = taxable * (item.taxPercent / 100);
    return { ...item, gross, lineTax, lineTotal: taxable + lineTax };
  });

  const subtotal = lines.reduce((sum, l) => sum + l.gross, 0);
  const itemsDiscount = lines.reduce((sum, l) => sum + (l.gross * l.discountPercent) / 100, 0);
  const tax = lines.reduce((sum, l) => sum + l.lineTax, 0);
  const totalDiscount = itemsDiscount + Math.max(0, input.discountAmount);
  const total = Math.max(0, subtotal - totalDiscount + tax);

  const { data: sale, error: saleError } = await supabase
    .from("sales")
    .insert({
      org_id: context.orgId,
      customer_name: input.customerName,
      customer_id: input.customerId,
      location_id: input.locationId,
      reference: input.orderNote,
      subtotal,
      discount_amount: totalDiscount,
      tax_amount: tax,
      shipping_amount: 0,
      total,
      payment_method: input.paymentMethod,
      amount_paid: total, // POS sales are paid in full at the point of sale
      sold_by: user.id,
      status: "completed",
    })
    .select("id, sale_number")
    .single();

  if (saleError || !sale) return { ok: false, error: saleError?.message ?? "Couldn't create the sale." };

  const { error: itemsError } = await supabase.from("sale_items").insert(
    lines.map((l) => ({
      sale_id: sale.id,
      product_id: l.productId,
      org_id: context.orgId,
      quantity: l.quantity,
      unit_price: l.unitPrice,
      discount_percent: l.discountPercent,
      tax_percent: l.taxPercent,
      line_total: l.lineTotal,
    }))
  );
  if (itemsError) {
    await supabase.from("sales").delete().eq("id", sale.id);
    return { ok: false, error: itemsError.message };
  }

  for (const item of input.items) {
    const { error: rpcError } = await supabase.rpc("adjust_product_stock_at_location", {
      p_product_id: item.productId,
      p_location_id: input.locationId,
      p_org_id: context.orgId,
      p_delta: -item.quantity,
    });
    if (rpcError) {
      return { ok: false, error: `Sale saved, but stock update failed for one item: ${rpcError.message}`, saleId: sale.id };
    }
  }

  revalidatePath("/pos");
  revalidatePath("/sales");
  revalidatePath("/inventory");
  return { ok: true, saleId: sale.id };
}