"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import type { HeldSaleKind } from "@/types/database";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
type AuthUser = { id: string; user_metadata?: { full_name?: string | null } | null };

// held_sales.created_by (and a handful of other created_by columns) has a
// foreign key to profiles(id), which is normally populated by a trigger the
// moment someone signs up. Any account that predates that trigger — or
// otherwise never got a profiles row — hits a FK violation on the very
// first insert that references it. This makes that self-healing instead of
// a hard failure: see the 20260816090000 migration for the permanent fix.
async function ensureProfile(supabase: SupabaseClient, user: AuthUser) {
  await supabase
    .from("profiles")
    .upsert({ id: user.id, full_name: user.user_metadata?.full_name ?? null }, { onConflict: "id", ignoreDuplicates: true });
}

export interface RecentSale {
  id: string;
  saleNumber: number;
  customerName: string | null;
  total: number;
  paymentMethod: string | null;
  createdAt: string;
  itemsSummary: string;
}

export async function getRecentPosSales(locationId: string | null, limit: number = 10): Promise<RecentSale[]> {
  const context = await getCurrentOrgContext();
  if (!context) return [];
  const supabase = await createClient();
  let q = supabase
    .from("sales")
    .select("id, sale_number, customer_name, total, payment_method, sale_date")
    .eq("org_id", context.orgId)
    .order("sale_date", { ascending: false })
    .limit(limit);
  if (locationId) q = q.eq("location_id", locationId);
  const { data } = await q;
  const sales = data ?? [];
  if (sales.length === 0) return [];

  const { data: itemRows } = await supabase
    .from("sale_items")
    .select("sale_id, quantity, products(name)")
    .in("sale_id", sales.map((s) => s.id));
  const namesBySale = new Map<string, string[]>();
  for (const row of itemRows ?? []) {
    const product = Array.isArray(row.products) ? row.products[0] : row.products;
    const list = namesBySale.get(row.sale_id) ?? [];
    list.push(product?.name ? `${product.name}${row.quantity > 1 ? ` ×${row.quantity}` : ""}` : "Unknown item");
    namesBySale.set(row.sale_id, list);
  }

  return sales.map((s) => {
    const names = namesBySale.get(s.id) ?? [];
    const itemsSummary = names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2} more` : names.join(", ") || "No items";
    return {
      id: s.id,
      saleNumber: s.sale_number,
      customerName: s.customer_name,
      total: s.total,
      paymentMethod: s.payment_method,
      createdAt: s.sale_date,
      itemsSummary
    };
  });
}

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
  const supabase = await createClient();
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

export interface NewContactInput {
  name: string;
  contactType: "individual" | "business";
  contactId: string | null;
  phone: string; // required — "Mobile*" in the form
  alternatePhone: string | null;
  landline: string | null;
  email: string | null;
}

export async function addCustomer(input: NewContactInput): Promise<{ ok: boolean; error?: string; customer?: CustomerOption }> {
  if (!input.name.trim()) return { ok: false, error: "Name is required." };
  if (!input.phone.trim()) return { ok: false, error: "Mobile number is required." };
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "No active organization." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { data, error } = await supabase
    .from("customers")
    .insert({
      org_id: context.orgId,
      name: input.name.trim(),
      phone: input.phone.trim(),
      email: input.email,
      contact_type: input.contactType,
      contact_id: input.contactId,
      alternate_phone: input.alternatePhone,
      landline: input.landline,
      created_by: user.id,
    })
    .select("id, name, phone, email")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Couldn't add customer." };
  return { ok: true, customer: data };
}

// Kept for anywhere still using the old 3-field quick-add.
export async function quickAddCustomer(name: string, phone: string | null, email: string | null): Promise<{ ok: boolean; error?: string; customer?: CustomerOption }> {
  if (!name.trim()) return { ok: false, error: "Name is required." };
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "No active organization." };
  const supabase = await createClient();
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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };
  await ensureProfile(supabase, user);

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
  const supabase = await createClient();
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
  const supabase = await createClient();
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
  const supabase = await createClient();
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
  shippingAmount: number;
  paymentMethod: string;
  saleDate: string; // 'YYYY-MM-DD' — sales.sale_date is a DATE column, no time component
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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  // Re-check stock at time of sale — the grid the cashier was looking at
  // may be a few seconds stale. IMPORTANT: this must check the SELECTED
  // BRANCH's stock, not products.stock_quantity (that's an org-wide total
  // across every branch now — see 20260805110000_product_stock_source_of_truth).
  // Checking the org-wide number let a sale go through when the org had
  // enough stock overall but not at this specific location, and the
  // location-scoped RPC below would then try to take that branch's row
  // negative and hit the DB's quantity >= 0 check constraint.
  //
  // A product with no product_stock_levels rows anywhere has never been
  // assigned to a branch (see the "untracked" note in that migration) — for
  // those only, fall back to the org-wide total rather than treating them
  // as zero-stock everywhere.
  const productIds = input.items.map((i) => i.productId);
  const [{ data: allStockRows }, { data: productRows }] = await Promise.all([
    supabase.from("product_stock_levels").select("product_id, location_id, quantity").in("product_id", productIds),
    supabase.from("products").select("id, stock_quantity").in("id", productIds)
  ]);
  const orgWideById = new Map((productRows ?? []).map((p) => [p.id, p.stock_quantity]));
  const rowsByProduct = new Map<string, { location_id: string; quantity: number }[]>();
  for (const row of allStockRows ?? []) {
    const list = rowsByProduct.get(row.product_id) ?? [];
    list.push(row);
    rowsByProduct.set(row.product_id, list);
  }

  for (const item of input.items) {
    const rows = rowsByProduct.get(item.productId);
    const available = rows
      ? (rows.find((r) => r.location_id === input.locationId)?.quantity ?? 0)
      : (orgWideById.get(item.productId) ?? 0);
    if (item.quantity > available) {
      return { ok: false, error: `Only ${available} unit(s) of "${item.name}" available at this branch.` };
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
  const shipping = Math.max(0, input.shippingAmount);
  const total = Math.max(0, subtotal - totalDiscount + tax + shipping);

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
      shipping_amount: shipping,
      total,
      payment_method: input.paymentMethod,
      amount_paid: total, // POS sales are paid in full at the point of sale
      sold_by: user.id,
      status: "completed",
      sale_date: input.saleDate || new Date().toISOString().slice(0, 10),
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

  // Untracked products (no product_stock_levels row anywhere) were validated
  // above against their org-wide total, but adjust_product_stock_at_location
  // does a plain upsert — for a product with zero rows, that would insert a
  // fresh row at exactly -quantity, hitting the same check constraint this
  // whole fix is for. Seed each untracked product at this location with its
  // org-wide total first, so the decrement below has something real to
  // subtract from. on conflict do nothing so a concurrent sale can't double-seed.
  const untrackedIds = productIds.filter((id) => !rowsByProduct.has(id));
  if (untrackedIds.length > 0) {
    const seedRows = untrackedIds.map((id) => ({
      org_id: context.orgId,
      product_id: id,
      location_id: input.locationId,
      quantity: orgWideById.get(id) ?? 0
    }));
    await supabase.from("product_stock_levels").upsert(seedRows, { onConflict: "product_id,location_id", ignoreDuplicates: true });
  }

  for (const item of input.items) {
    const { error: rpcError } = await supabase.rpc("adjust_product_stock_at_location", {
      p_product_id: item.productId,
      p_location_id: input.locationId,
      p_org_id: context.orgId,
      p_delta: -item.quantity,
    });
    if (rpcError) {
      // The RPC now locks the row and checks sufficiency itself (see the
      // 20260817090000 migration) — if this still fires, someone else's
      // sale took the remaining stock in the moment between this sale's
      // precheck above and this decrement. That's a real race, not a bug.
      const friendly = rpcError.message.includes("insufficient_stock")
        ? `Someone just sold the last unit(s) of "${item.name}" at this branch. Adjust the quantity and try again.`
        : `Sale saved, but stock update failed for one item: ${rpcError.message}`;
      return { ok: false, error: friendly, saleId: sale.id };
    }
  }

  revalidatePath("/pos");
  revalidatePath("/sales");
  revalidatePath("/inventory");
  return { ok: true, saleId: sale.id };
}

// ---------------------------------------------------------------------------
// Edit an existing sale from the Recent Transactions list — loads it back
// into the POS cart panel, and posts an update (reconciling stock) instead
// of creating a new sale.
// ---------------------------------------------------------------------------

export interface EditableSale {
  locationId: string | null;
  customerId: string | null;
  customerName: string | null;
  paymentMethod: string;
  discountAmount: number;
  shippingAmount: number;
  saleDate: string;
  items: CartItemInput[];
}

export async function getSaleForEdit(saleId: string): Promise<EditableSale | null> {
  const supabase = await createClient();
  const { data: sale } = await supabase
    .from("sales")
    .select("location_id, customer_id, customer_name, payment_method, discount_amount, shipping_amount, sale_date")
    .eq("id", saleId)
    .single();
  if (!sale) return null;

  const { data: items } = await supabase
    .from("sale_items")
    .select("product_id, quantity, unit_price, discount_percent, tax_percent, products(name, sku)")
    .eq("sale_id", saleId);

  return {
    locationId: sale.location_id,
    customerId: sale.customer_id,
    customerName: sale.customer_name,
    paymentMethod: sale.payment_method ?? "Cash",
    // The item-level discount/tax split from the original sale isn't
    // reconstructible from the stored total alone, so on edit the whole
    // discount_amount is treated as the cart's flat discount field — same
    // simplification the POS cart already uses for a fresh sale.
    discountAmount: sale.discount_amount ?? 0,
    shippingAmount: sale.shipping_amount ?? 0,
    saleDate: sale.sale_date,
    items: (items ?? []).map((i) => {
      const product = Array.isArray(i.products) ? i.products[0] : i.products;
      return {
        productId: i.product_id,
        name: product?.name ?? "Unknown product",
        sku: product?.sku ?? "",
        unitPrice: i.unit_price,
        quantity: i.quantity,
        discountPercent: i.discount_percent,
        taxPercent: i.tax_percent,
      };
    }),
  };
}

export async function updateSale(saleId: string, input: CompleteSaleInput): Promise<CompleteSaleResult> {
  if (input.items.length === 0) return { ok: false, error: "Cart is empty." };
  if (!input.locationId) return { ok: false, error: "Select a branch/location." };

  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "No active organization." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { data: oldSale } = await supabase.from("sales").select("location_id").eq("id", saleId).single();
  if (!oldSale) return { ok: false, error: "Sale not found." };
  const { data: oldItems } = await supabase.from("sale_items").select("product_id, quantity").eq("sale_id", saleId);

  // Same branch-aware precheck as a fresh sale, but the OLD quantities are
  // effectively "available again" first — someone editing a sale down
  // shouldn't be blocked by the very stock their own original sale used.
  const productIds = input.items.map((i) => i.productId);
  const [{ data: allStockRows }, { data: productRows }] = await Promise.all([
    supabase.from("product_stock_levels").select("product_id, location_id, quantity").in("product_id", productIds),
    supabase.from("products").select("id, stock_quantity").in("id", productIds)
  ]);
  const orgWideById = new Map((productRows ?? []).map((p) => [p.id, p.stock_quantity]));
  const rowsByProduct = new Map<string, { location_id: string; quantity: number }[]>();
  for (const row of allStockRows ?? []) {
    const list = rowsByProduct.get(row.product_id) ?? [];
    list.push(row);
    rowsByProduct.set(row.product_id, list);
  }
  const oldQtyByProduct = new Map((oldItems ?? []).map((i) => [i.product_id, i.quantity]));

  for (const item of input.items) {
    const rows = rowsByProduct.get(item.productId);
    const rawAvailable = rows
      ? (rows.find((r) => r.location_id === input.locationId)?.quantity ?? 0)
      : (orgWideById.get(item.productId) ?? 0);
    // Only add back the old quantity if it was reserved at the SAME
    // location this edit is now posting to — otherwise it'll be returned
    // to the old location separately below, not this one.
    const reclaimable = oldSale.location_id === input.locationId ? (oldQtyByProduct.get(item.productId) ?? 0) : 0;
    const available = rawAvailable + reclaimable;
    if (item.quantity > available) {
      return { ok: false, error: `Only ${available} unit(s) of "${item.name}" available at this branch.` };
    }
  }

  // Reverse the original deduction at wherever it was originally sold from.
  if (oldSale.location_id) {
    for (const oldItem of oldItems ?? []) {
      await supabase.rpc("adjust_product_stock_at_location", {
        p_product_id: oldItem.product_id,
        p_location_id: oldSale.location_id,
        p_org_id: context.orgId,
        p_delta: oldItem.quantity,
      });
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
  const shipping = Math.max(0, input.shippingAmount);
  const total = Math.max(0, subtotal - totalDiscount + tax + shipping);

  const { error: updateError } = await supabase
    .from("sales")
    .update({
      customer_name: input.customerName,
      customer_id: input.customerId,
      location_id: input.locationId,
      subtotal,
      discount_amount: totalDiscount,
      tax_amount: tax,
      shipping_amount: shipping,
      total,
      payment_method: input.paymentMethod,
      amount_paid: total,
      sale_date: input.saleDate || new Date().toISOString().slice(0, 10),
    })
    .eq("id", saleId);
  if (updateError) return { ok: false, error: updateError.message };

  await supabase.from("sale_items").delete().eq("sale_id", saleId);
  const { error: itemsError } = await supabase.from("sale_items").insert(
    lines.map((l) => ({
      sale_id: saleId,
      product_id: l.productId,
      org_id: context.orgId,
      quantity: l.quantity,
      unit_price: l.unitPrice,
      discount_percent: l.discountPercent,
      tax_percent: l.taxPercent,
      line_total: l.lineTotal,
    }))
  );
  if (itemsError) return { ok: false, error: itemsError.message };

  const untrackedIds = productIds.filter((id) => !rowsByProduct.has(id));
  if (untrackedIds.length > 0) {
    const seedRows = untrackedIds.map((id) => ({
      org_id: context.orgId,
      product_id: id,
      location_id: input.locationId,
      quantity: orgWideById.get(id) ?? 0
    }));
    await supabase.from("product_stock_levels").upsert(seedRows, { onConflict: "product_id,location_id", ignoreDuplicates: true });
  }

  for (const item of input.items) {
    const { error: rpcError } = await supabase.rpc("adjust_product_stock_at_location", {
      p_product_id: item.productId,
      p_location_id: input.locationId,
      p_org_id: context.orgId,
      p_delta: -item.quantity,
    });
    if (rpcError) {
      const friendly = rpcError.message.includes("insufficient_stock")
        ? `Someone just sold the last unit(s) of "${item.name}" at this branch. Adjust the quantity and try again.`
        : `Sale updated, but stock adjustment failed for one item: ${rpcError.message}`;
      return { ok: false, error: friendly, saleId };
    }
  }

  revalidatePath("/pos");
  revalidatePath("/sales");
  revalidatePath("/inventory");
  return { ok: true, saleId };
}