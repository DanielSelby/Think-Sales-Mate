"use server";

import { createClient } from "@/lib/supabase/server";

export interface PortalContext {
  orgId: string;
  orgName: string;
  currency: string;
  isEnabled: boolean;
  showPrices: boolean;
  accountRequirement: "optional" | "required" | "guest_only";
  allowCustomerSelectDelivery: boolean;
  allowOrderNotes: boolean;
  allowViewOrderStatus: boolean;
  allowCreateAccount: boolean;
}

export async function getPortalContext(orgSlug: string): Promise<PortalContext | null> {
  const supabase = await createClient();

  const { data: org } = await supabase.from("organizations").select("id, name, currency").eq("slug", orgSlug).maybeSingle();
  if (!org) return null;

  const { data: settings } = await supabase.from("customer_portal_settings").select("*").eq("org_id", org.id).maybeSingle();

  return {
    orgId: org.id,
    orgName: org.name,
    currency: org.currency,
    isEnabled: settings?.is_enabled ?? false,
    showPrices: settings?.show_prices_to_customers ?? true,
    accountRequirement: settings?.account_requirement ?? "optional",
    allowCustomerSelectDelivery: settings?.allow_customer_select_delivery ?? true,
    allowOrderNotes: settings?.allow_order_notes ?? true,
    allowViewOrderStatus: settings?.allow_view_order_status ?? true,
    allowCreateAccount: settings?.allow_create_account ?? true,
  };
}

export interface CatalogProduct {
  id: string;
  name: string;
  category: string | null;
  brand: string | null;
  unitPrice: number;
  stockQuantity: number;
}

export async function getCatalog(orgId: string): Promise<CatalogProduct[]> {
  const supabase = await createClient();
  // Reads the safe public view — never the raw products table — so
  // cost_price/supplier never reach an anonymous visitor.
  const { data } = await supabase
    .from("public_product_catalog")
    .select("id, name, category, brand, unit_price, stock_quantity")
    .eq("org_id", orgId)
    .order("name");

  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    brand: p.brand,
    unitPrice: p.unit_price,
    stockQuantity: p.stock_quantity,
  }));
}

export interface CartLineInput {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

export interface PlaceOrderInput {
  orgId: string;
  guestName: string;
  guestPhone: string;
  guestEmail: string | null;
  deliveryAddress: string;
  deliveryOption: string | null;
  deliveryFee: number;
  notes: string | null;
  items: CartLineInput[];
}

export interface PlaceOrderResult {
  ok: boolean;
  error?: string;
  orderNumber?: string;
  accessToken?: string;
}

export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  if (!input.guestName.trim() || !input.guestPhone.trim()) return { ok: false, error: "Name and phone are required." };
  if (!input.deliveryAddress.trim()) return { ok: false, error: "Delivery address is required." };
  if (input.items.length === 0) return { ok: false, error: "Your cart is empty." };

  const supabase = await createClient();

  const { data: settings } = await supabase.from("customer_portal_settings").select("is_enabled").eq("org_id", input.orgId).maybeSingle();
  if (!settings?.is_enabled) return { ok: false, error: "Ordering is currently unavailable." };

  // Try to match an existing customer by phone within this org (lightweight
  // convenience, not real authentication — see the accounts note elsewhere).
  const { data: existingCustomer } = await supabase
    .from("customers")
    .select("id")
    .eq("org_id", input.orgId)
    .eq("phone", input.guestPhone.trim())
    .maybeSingle();

  const subtotal = input.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  const total = subtotal + Math.max(0, input.deliveryFee);

  const { data: order, error: orderError } = await supabase
    .from("customer_orders")
    .insert({
      org_id: input.orgId,
      customer_id: existingCustomer?.id ?? null,
      guest_name: input.guestName.trim(),
      guest_phone: input.guestPhone.trim(),
      guest_email: input.guestEmail,
      delivery_address: input.deliveryAddress.trim(),
      delivery_option: input.deliveryOption,
      delivery_fee: Math.max(0, input.deliveryFee),
      notes: input.notes,
      subtotal,
      total,
      status: "new",
    })
    .select("id, order_number, access_token")
    .single();

  if (orderError || !order) return { ok: false, error: orderError?.message ?? "Couldn't place the order." };

  const { error: itemsError } = await supabase.from("customer_order_items").insert(
    input.items.map((i) => ({
      order_id: order.id,
      org_id: input.orgId,
      product_id: i.productId,
      product_name: i.productName,
      quantity: i.quantity,
      unit_price: i.unitPrice,
      line_total: i.quantity * i.unitPrice,
    }))
  );
  if (itemsError) {
    await supabase.from("customer_orders").delete().eq("id", order.id);
    return { ok: false, error: itemsError.message };
  }

  return { ok: true, orderNumber: order.order_number, accessToken: order.access_token };
}