"use server";

import { createClient } from "@/lib/supabase/server";
import { notifyNewCustomerOrder } from "@/lib/notifications";
import { isPortalActive } from "@/lib/customer-portal/schedule";

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
  allowCustomerLocationSelection: boolean;
  allowGuestOrders: boolean;
  requireCustomerAccount: boolean;
  sendEmailNotifications: boolean;
  sendWhatsAppNotifications: boolean;
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
    isEnabled: isPortalActive({
      isEnabled: settings?.is_enabled ?? false,
      scheduleEnabled: settings?.schedule_enabled ?? false,
      activeFrom: settings?.active_from?.slice(0, 5) ?? "00:00",
      activeUntil: settings?.active_until?.slice(0, 5) ?? "23:59",
      scheduleTimezone: settings?.schedule_timezone ?? "UTC",
    }),
    showPrices: settings?.show_prices_to_customers ?? true,
    accountRequirement: settings?.account_requirement ?? "optional",
    allowCustomerSelectDelivery: settings?.allow_customer_select_delivery ?? true,
    allowOrderNotes: settings?.allow_order_notes ?? true,
    allowViewOrderStatus: settings?.allow_view_order_status ?? true,
    allowCreateAccount: settings?.allow_create_account ?? true,
    allowCustomerLocationSelection: settings?.allow_customer_location_selection ?? true,
    allowGuestOrders: settings?.allow_guest_orders ?? true,
    requireCustomerAccount: settings?.require_customer_account ?? false,
    sendEmailNotifications: settings?.send_email_notifications ?? true,
    sendWhatsAppNotifications: settings?.send_whatsapp_notifications ?? false,
  };
}

export interface StorefrontLocation {
  id: string;
  name: string;
  city: string | null;
  region: string | null;
  address: string | null;
}

export async function getStorefrontLocations(orgId: string): Promise<StorefrontLocation[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("business_locations")
    .select("id, name, city, region, address")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("name");

  return (data ?? []).map((l) => ({
    id: l.id,
    name: l.name,
    city: l.city,
    region: l.region,
    address: l.address,
  }));
}

export interface CatalogProduct {
  id: string;
  name: string;
  category: string | null;
  brand: string | null;
  unitPrice: number;
  stockQuantity: number;
  imageUrl: string | null;
}

export async function getCatalog(orgId: string): Promise<CatalogProduct[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("public_product_catalog")
    .select("id, name, category, brand, unit_price, stock_quantity, image_urls")
    .eq("org_id", orgId)
    .order("name");

  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    brand: p.brand,
    unitPrice: p.unit_price,
    stockQuantity: p.stock_quantity,
    imageUrl: p.image_urls?.[0] ?? null,
  
  }));
}

export interface UploadVoiceNoteResult {
  ok: boolean;
  url?: string;
  error?: string;
}

const MAX_VOICE_NOTE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_VOICE_MIME_PREFIXES = ["audio/"];

export async function uploadVoiceNote(formData: FormData): Promise<UploadVoiceNoteResult> {
  const orgId = String(formData.get("org_id") ?? "");
  const file = formData.get("voice_note") as File | null;

  if (!orgId) return { ok: false, error: "Missing organization." };
  if (!file || file.size === 0) return { ok: false, error: "No recording found." };
  if (file.size > MAX_VOICE_NOTE_BYTES) return { ok: false, error: "Voice note must be under 5MB." };
  if (!ALLOWED_VOICE_MIME_PREFIXES.some((prefix) => file.type.startsWith(prefix))) {
    return { ok: false, error: "That file doesn't look like an audio recording." };
  }

  const supabase = await createClient();
  const ext = file.type.includes("webm") ? "webm" : file.type.includes("mp4") ? "m4a" : "ogg";
  const path = `${orgId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error: uploadError } = await supabase.storage.from("customer-order-attachments").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) return { ok: false, error: uploadError.message };

  const { data: publicUrl } = supabase.storage.from("customer-order-attachments").getPublicUrl(path);
  return { ok: true, url: publicUrl.publicUrl };
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
  voiceNoteUrl?: string | null;
  locationId?: string | null;
  items: CartLineInput[];
}

export interface PlaceOrderResult {
  ok: boolean;
  error?: string;
  orderNumber?: string;
  accessToken?: string;
}

export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  if (!input.guestName.trim() || !input.guestPhone.trim()) return { ok: false, error: "Customer name and phone number are required." };
  if (!input.deliveryAddress.trim()) return { ok: false, error: "Delivery address is required." };
  if (input.items.length === 0) return { ok: false, error: "Your cart is empty." };

  const supabase = await createClient();

  const [{ data: settings }, { data: org }] = await Promise.all([
    supabase.from("customer_portal_settings").select("*").eq("org_id", input.orgId).maybeSingle(),
    supabase.from("organizations").select("currency").eq("id", input.orgId).maybeSingle(),
  ]);

  if (!settings || !isPortalActive({
    isEnabled: settings.is_enabled,
    scheduleEnabled: settings.schedule_enabled ?? false,
    activeFrom: settings.active_from?.slice(0, 5) ?? "00:00",
    activeUntil: settings.active_until?.slice(0, 5) ?? "23:59",
    scheduleTimezone: settings.schedule_timezone ?? "UTC",
  })) return { ok: false, error: "Ordering is currently unavailable." };

  // If customer location selection is enabled and required, validate location
  let assignedLocationId: string | null = null;
  let branchName: string | null = null;
  if (settings.allow_customer_location_selection && input.locationId) {
    assignedLocationId = input.locationId;
    const { data: loc } = await supabase.from("business_locations").select("name").eq("id", input.locationId).maybeSingle();
    branchName = loc?.name ?? null;
  }

  // Stock pre-validation check
  const productIds = input.items.map((i) => i.productId);
  const { data: products } = await supabase.from("products").select("id, name, stock_quantity").in("id", productIds);
  const stockMap = new Map((products ?? []).map((p) => [p.id, p.stock_quantity]));

  for (const item of input.items) {
    const available = stockMap.get(item.productId) ?? 0;
    if (available < item.quantity) {
      return {
        ok: false,
        error: `Insufficient stock for "${item.productName}". Requested: ${item.quantity}, Available: ${available}. Please adjust your quantity.`,
      };
    }
  }

  // Try to match an existing customer record by phone
  const { data: existingCustomer } = await supabase
    .from("customers")
    .select("id")
    .eq("org_id", input.orgId)
    .eq("phone", input.guestPhone.trim())
    .maybeSingle();

  const subtotal = input.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  const total = subtotal + Math.max(0, input.deliveryFee);

  // Generate formatted order number
  const today = new Date();
  const dateStr = `${today.getFullYear().toString().slice(-2)}${(today.getMonth() + 1).toString().padStart(2, "0")}${today.getDate().toString().padStart(2, "0")}`;
  const randomSuffix = Math.floor(100 + Math.random() * 900);
  const orderNumber = `ORD-${dateStr}-${randomSuffix}`;

  const { data: order, error: orderError } = await supabase
    .from("customer_orders")
    .insert({
      org_id: input.orgId,
      order_number: orderNumber,
      customer_id: existingCustomer?.id ?? null,
      guest_name: input.guestName.trim(),
      guest_phone: input.guestPhone.trim(),
      guest_email: input.guestEmail?.trim() || null,
      delivery_address: input.deliveryAddress.trim(),
      delivery_option: input.deliveryOption,
      delivery_fee: Math.max(0, input.deliveryFee),
      notes: input.notes?.trim() || null,
      voice_note_url: input.voiceNoteUrl || null,
      subtotal,
      total,
      status: "new",
      payment_status: "unpaid",
      delivery_status: "not_shipped",
      location_id: assignedLocationId,
    })
    .select("id, order_number, access_token")
    .single();

  if (orderError || !order) return { ok: false, error: orderError?.message ?? "Couldn't create order." };

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

  // Create initial timeline event
  await supabase.from("customer_order_timeline").insert({
    order_id: order.id,
    org_id: input.orgId,
    title: "Order Created",
    actor_name: input.guestName.trim(),
    status: "completed",
    notes: assignedLocationId ? `Submitted with branch selection: ${branchName}` : "Submitted to Admin review queue",
  });

  // Trigger notifications
  await notifyNewCustomerOrder({
    orgId: input.orgId,
    orderId: order.id,
    orderNumber: order.order_number,
    customerName: input.guestName.trim(),
    total,
    currency: org?.currency ?? "GHS",
    locationId: assignedLocationId,
    branchName,
    customerPhone: input.guestPhone.trim(),
    customerEmail: input.guestEmail?.trim() || null,
    sendEmail: settings?.send_email_notifications,
    sendWhatsApp: settings?.send_whatsapp_notifications,
  });

  return { ok: true, orderNumber: order.order_number, accessToken: order.access_token };
}