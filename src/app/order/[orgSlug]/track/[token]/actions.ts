"use server";

import { createClient } from "@/lib/supabase/server";

export interface TrackedOrderItem {
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface TrackedTimelineItem {
  title: string;
  actorName: string;
  status: string;
  notes: string | null;
  createdAt: string;
}

export interface TrackedOrder {
  orderNumber: string;
  status: string;
  paymentStatus: string;
  deliveryStatus: string;
  branchName: string | null;
  guestName: string;
  guestPhone: string;
  deliveryAddress: string;
  deliveryOption: string | null;
  deliveryFee: number;
  subtotal: number;
  total: number;
  notes: string | null;
  createdAt: string;
  items: TrackedOrderItem[];
  timeline: TrackedTimelineItem[];
  showPrices: boolean;
  currency: string;
}

export async function trackOrder(token: string): Promise<TrackedOrder | null> {
  const supabase = await createClient();

  const { data: order } = await supabase
    .from("customer_orders")
    .select("id, org_id, order_number, status, payment_status, delivery_status, location_id, guest_name, guest_phone, delivery_address, delivery_option, delivery_fee, subtotal, total, notes, created_at")
    .eq("access_token", token)
    .maybeSingle();
  if (!order) return null;

  const [{ data: items }, { data: settings }, { data: org }, { data: loc }, { data: timeline }] = await Promise.all([
    supabase.from("customer_order_items").select("product_name, quantity, unit_price, line_total").eq("order_id", order.id),
    supabase.from("customer_portal_settings").select("show_prices_to_customers, allow_view_order_status").eq("org_id", order.org_id).maybeSingle(),
    supabase.from("organizations").select("currency").eq("id", order.org_id).single(),
    order.location_id ? supabase.from("business_locations").select("name").eq("id", order.location_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("customer_order_timeline").select("title, actor_name, status, notes, created_at").eq("order_id", order.id).order("created_at", { ascending: true }),
  ]);

  if (settings && !settings.allow_view_order_status) return null;

  return {
    orderNumber: order.order_number,
    status: order.status,
    paymentStatus: order.payment_status ?? "unpaid",
    deliveryStatus: order.delivery_status ?? "not_shipped",
    branchName: loc?.name ?? null,
    guestName: order.guest_name,
    guestPhone: order.guest_phone,
    deliveryAddress: order.delivery_address,
    deliveryOption: order.delivery_option,
    deliveryFee: order.delivery_fee,
    subtotal: order.subtotal,
    total: order.total,
    notes: order.notes,
    createdAt: order.created_at,
    items: (items ?? []).map((i) => ({ productName: i.product_name, quantity: i.quantity, unitPrice: i.unit_price, lineTotal: i.line_total })),
    timeline: (timeline ?? []).map((t) => ({
      title: t.title,
      actorName: t.actor_name,
      status: t.status,
      notes: t.notes,
      createdAt: t.created_at,
    })),
    showPrices: settings?.show_prices_to_customers ?? true,
    currency: org?.currency ?? "GHS",
  };
}