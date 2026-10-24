"use server";

import { createAdminClient } from "@/lib/supabase/admin";

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
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  deliveryStatus: string;
  stockReserved: boolean;
  branchName: string | null;
  branchPhone: string | null;
  branchEmail: string | null;
  guestName: string;
  guestPhone: string;
  deliveryAddress: string;
  deliveryOption: string | null;
  deliveryFee: number;
  subtotal: number;
  total: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  items: TrackedOrderItem[];
  timeline: TrackedTimelineItem[];
  showPrices: boolean;
  currency: string;
  customerReceivedAt: string | null;
  allowInvoiceDownload: boolean;
  companyName: string | null;
  companyLogoUrl: string | null;
  organizationPhone: string | null;
  organizationEmail: string | null;
  organizationWebsite: string | null;
  showOrganizationContact: boolean;
}

export async function trackOrder(token: string, orgSlug?: string): Promise<TrackedOrder | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) return null;
  const supabase = createAdminClient();

  const { data: order } = await supabase
    .from("customer_orders")
    .select("id, org_id, order_number, status, payment_status, delivery_status, stock_reserved, location_id, guest_name, guest_phone, delivery_address, delivery_option, delivery_fee, subtotal, total, notes, created_at, updated_at, customer_received_at")
    .eq("access_token", token)
    .maybeSingle();
  if (!order) return null;

  const [{ data: items }, { data: settings }, { data: org }, { data: loc }, { data: timeline }, { data: company }] = await Promise.all([
    supabase.from("customer_order_items").select("product_name, quantity, unit_price, line_total").eq("order_id", order.id),
    supabase.from("customer_portal_settings").select("show_prices_to_customers, allow_view_order_status, allow_customer_invoice_download").eq("org_id", order.org_id).maybeSingle(),
    supabase.from("organizations").select("currency, slug").eq("id", order.org_id).single(),
    order.location_id ? supabase.from("business_locations").select("name, phone, email").eq("id", order.location_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("customer_order_timeline").select("title, actor_name, status, notes, created_at").eq("order_id", order.id).order("created_at", { ascending: true }),
    supabase.from("company_profile").select("company_name, logo_url, show_contact_on_invoices, business_phone, business_email, contact_phone, contact_email, website").eq("org_id", order.org_id).maybeSingle(),
  ]);

  if (orgSlug && org?.slug !== orgSlug) return null;
  if (settings && !settings.allow_view_order_status) return null;

  return {
    id: order.id,
    orderNumber: order.order_number,
    status: order.status,
    paymentStatus: order.payment_status ?? "unpaid",
    deliveryStatus: order.delivery_status ?? "not_shipped",
    stockReserved: order.stock_reserved ?? false,
    branchName: loc?.name ?? null,
    branchPhone: loc?.phone ?? null,
    branchEmail: loc?.email ?? null,
    guestName: order.guest_name,
    guestPhone: order.guest_phone,
    deliveryAddress: order.delivery_address,
    deliveryOption: order.delivery_option,
    deliveryFee: order.delivery_fee,
    subtotal: order.subtotal,
    total: order.total,
    notes: order.notes,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
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
    customerReceivedAt: order.customer_received_at,
    allowInvoiceDownload: settings?.allow_customer_invoice_download ?? true,
    companyName: company?.company_name ?? null,
    companyLogoUrl: company?.logo_url ?? null,
    organizationPhone: company?.contact_phone || company?.business_phone || null,
    organizationEmail: company?.contact_email || company?.business_email || null,
    organizationWebsite: company?.website ?? null,
    showOrganizationContact: company?.show_contact_on_invoices ?? true,
  };
}

export async function confirmOrderReceived(token: string, feedback: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) {
    return { error: "This tracking link is invalid or expired." };
  }
  const supabase = createAdminClient();
  const { data: result, error } = await supabase.rpc("confirm_customer_portal_order_received", {
    p_access_token: token,
    p_feedback: feedback.trim().slice(0, 1000) || null,
  });
  if (error) return { error: "We couldn't confirm receipt right now. Please try again." };
  if (result === "invalid") return { error: "This tracking link is invalid or expired." };
  if (result === "already_received") return { error: "This order has already been marked as received." };
  if (result === "not_completed") return { error: "The order can only be confirmed after delivery." };
  if (result !== "success") return { error: "We couldn't confirm receipt right now. Please try again." };
  return { success: true };
}