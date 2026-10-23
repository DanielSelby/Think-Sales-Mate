"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyNewCustomerOrder } from "@/lib/notifications";
import { isPortalActive } from "@/lib/customer-portal/schedule";
import { getPlatformSystemLogo } from "@/lib/supabase/platform-admin";

export interface PortalContext {
  orgId: string;
  orgName: string;
  organizationPhone: string | null;
  whatsappBusinessNumber: string | null;
  customerPortalWhatsAppMessage: string | null;
  companyLogoUrl: string | null;
  customerPortalHeroUrl: string | null;
  systemLogoUrl: string | null;
  currency: string;
  isEnabled: boolean;
  portalTheme: "light" | "dark";
  portalColorTheme: "green" | "navy" | "teal" | "plum" | "fintech" | "royal" | "harvest" | "eclipse";
  showPrices: boolean;
  accountRequirement: "optional" | "required" | "guest_only";
  allowCustomerSelectDelivery: boolean;
  standardDeliveryFee: number;
  expressDeliveryFee: number;
  pickupDeliveryFee: number;
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
  const publicSupabase = createAdminClient();

  // Organization membership RLS must not prevent anonymous customers from
  // resolving the public storefront slug.
  const { data: org } = await publicSupabase
    .from("organizations")
    .select("id, name, currency")
    .eq("slug", orgSlug)
    .maybeSingle();
  if (!org) return null;
  const [{ data: companyProfile }, systemLogoUrl] = await Promise.all([
    publicSupabase.from("company_profile").select("business_phone, contact_phone, whatsapp_business_number, customer_portal_whatsapp_message, logo_url, customer_portal_hero_url").eq("org_id", org.id).maybeSingle(),
    getPlatformSystemLogo().catch(() => null),
  ]);

  const { data: settings } = await publicSupabase.from("customer_portal_settings").select("*").eq("org_id", org.id).maybeSingle();

  return {
    orgId: org.id,
    orgName: org.name,
    organizationPhone: companyProfile?.contact_phone || companyProfile?.business_phone || null,
    whatsappBusinessNumber: companyProfile?.whatsapp_business_number ?? null,
    customerPortalWhatsAppMessage: companyProfile?.customer_portal_whatsapp_message ?? null,
    companyLogoUrl: companyProfile?.logo_url ?? null,
    customerPortalHeroUrl: companyProfile?.customer_portal_hero_url ?? null,
    systemLogoUrl,
    currency: org.currency,
    isEnabled: isPortalActive({
      isEnabled: settings?.is_enabled ?? false,
      scheduleEnabled: settings?.schedule_enabled ?? false,
      activeFrom: settings?.active_from?.slice(0, 5) ?? "00:00",
      activeUntil: settings?.active_until?.slice(0, 5) ?? "23:59",
      scheduleTimezone: settings?.schedule_timezone ?? "UTC",
    }),
    portalTheme: settings?.portal_theme === "dark" ? "dark" : "light",
    portalColorTheme: ["green", "navy", "teal", "plum", "fintech", "royal", "harvest", "eclipse"].includes(settings?.portal_color_theme ?? "")
      ? settings?.portal_color_theme as PortalContext["portalColorTheme"]
      : "fintech",
    showPrices: settings?.show_prices_to_customers ?? true,
    accountRequirement: settings?.account_requirement ?? "optional",
    allowCustomerSelectDelivery: settings?.allow_customer_select_delivery ?? true,
    standardDeliveryFee: settings?.standard_delivery_fee ?? 5,
    expressDeliveryFee: settings?.express_delivery_fee ?? 15,
    pickupDeliveryFee: settings?.pickup_delivery_fee ?? 0,
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
  const supabase = createAdminClient();
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
const VOICE_NOTE_BUCKET = "customer-order-attachments";

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

  const { error: uploadError } = await supabase.storage.from(VOICE_NOTE_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) {
    if (/bucket not found/i.test(uploadError.message)) {
      return { ok: false, error: "Voice notes aren't set up yet on this store — continuing without the recording." };
    }
    return { ok: false, error: uploadError.message };
  }

  const { data: publicUrl } = supabase.storage.from(VOICE_NOTE_BUCKET).getPublicUrl(path);
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
  if (!input || !/^[0-9a-f-]{36}$/i.test(input.orgId)) return { ok: false, error: "This store is unavailable." };
  if (typeof input.guestName !== "string" || !input.guestName.trim() || input.guestName.trim().length > 160) return { ok: false, error: "Enter a valid customer name." };
  if (typeof input.guestPhone !== "string" || !input.guestPhone.trim() || input.guestPhone.trim().length > 40) return { ok: false, error: "Enter a valid phone number." };
  if (typeof input.deliveryAddress !== "string" || !input.deliveryAddress.trim() || input.deliveryAddress.trim().length > 1000) return { ok: false, error: "Enter a valid delivery or contact address." };
  if (input.guestEmail != null && (typeof input.guestEmail !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.guestEmail.trim()) || input.guestEmail.trim().length > 254)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (!Array.isArray(input.items) || input.items.length === 0) return { ok: false, error: "Your cart is empty." };
  if (input.items.length > 100) return { ok: false, error: "Your order contains too many items." };
  if (input.items.some((item) => !item || typeof item.productId !== "string" || !/^[0-9a-f-]{36}$/i.test(item.productId) || !Number.isFinite(item.quantity) || item.quantity <= 0 || item.quantity > 1_000_000)) {
    return { ok: false, error: "One or more item quantities are invalid." };
  }
  if (input.items.some((item, index) => input.items.findIndex((candidate) => candidate.productId === item.productId) !== index)) {
    return { ok: false, error: "Your cart contains duplicate items. Please refresh and try again." };
  }
  if (input.locationId != null && (typeof input.locationId !== "string" || !/^[0-9a-f-]{36}$/i.test(input.locationId))) {
    return { ok: false, error: "Choose a valid branch location." };
  }
  if (input.deliveryOption != null && typeof input.deliveryOption !== "string") {
    return { ok: false, error: "Choose a valid delivery method." };
  }
  if (input.notes != null && (typeof input.notes !== "string" || input.notes.length > 2000)) return { ok: false, error: "Order notes are too long." };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  const voiceNotePrefix = supabaseUrl ? `${supabaseUrl}/storage/v1/object/public/customer-order-attachments/${input.orgId}/` : null;
  if (input.voiceNoteUrl != null && (typeof input.voiceNoteUrl !== "string" || !voiceNotePrefix || !input.voiceNoteUrl.startsWith(voiceNotePrefix))) {
    return { ok: false, error: "The voice note attachment is invalid. Please record it again." };
  }

  const supabase = createAdminClient();
  const [{ data: settings }, { data: org }] = await Promise.all([
    supabase.from("customer_portal_settings").select("*").eq("org_id", input.orgId).maybeSingle(),
    supabase.from("organizations").select("currency").eq("id", input.orgId).maybeSingle(),
  ]);

  if (!settings || !org || !isPortalActive({
    isEnabled: settings.is_enabled,
    scheduleEnabled: settings.schedule_enabled ?? false,
    activeFrom: settings.active_from?.slice(0, 5) ?? "00:00",
    activeUntil: settings.active_until?.slice(0, 5) ?? "23:59",
    scheduleTimezone: settings.schedule_timezone ?? "UTC",
  })) return { ok: false, error: "Ordering is currently unavailable." };

  const { data: orders, error } = await supabase.rpc("place_customer_portal_order", {
    p_org_id: input.orgId,
    p_guest_name: input.guestName.trim(),
    p_guest_phone: input.guestPhone.trim(),
    p_guest_email: input.guestEmail?.trim() || null,
    p_delivery_address: input.deliveryAddress.trim(),
    p_delivery_option: settings.allow_customer_select_delivery ? input.deliveryOption : null,
    p_location_id: settings.allow_customer_location_selection ? input.locationId || null : null,
    p_notes: input.notes?.trim() || null,
    p_voice_note_url: input.voiceNoteUrl || null,
    p_items: input.items.map(({ productId, quantity }) => ({ product_id: productId, quantity })),
  });

  const order = orders?.[0];
  if (error || !order) return { ok: false, error: error?.message ?? "Couldn't create order." };

  await notifyNewCustomerOrder({
    orgId: input.orgId,
    orderId: order.order_id,
    orderNumber: order.order_number,
    customerName: input.guestName.trim(),
    total: order.total,
    currency: org?.currency ?? "GHS",
    locationId: settings.allow_customer_location_selection ? input.locationId || null : null,
    branchName: order.branch_name,
    customerPhone: input.guestPhone.trim(),
    customerEmail: input.guestEmail?.trim() || null,
    sendEmail: settings.send_email_notifications,
    sendWhatsApp: settings.send_whatsapp_notifications,
  });

  return { ok: true, orderNumber: order.order_number, accessToken: order.access_token };
}