"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { getRegistrationIpHash } from "@/lib/organizations/registration-rate-limit";
import { getEnabledOrganizationModules } from "@/lib/supabase/platform-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertRestaurantPackagedStockAvailable } from "@/lib/restaurant/packaged-stock";
import { getRestaurantOnlineBaseUrl, isRestaurantPaystackAvailable } from "@/lib/restaurant/online-ordering";
import { sendRestaurantOrderEmail } from "@/lib/restaurant/order-emails";
import type { Json } from "@/types/database";

type OnlineOrderInput = {
  fulfillment: "pickup" | "delivery";
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  deliveryAddress: string;
  notes: string;
  paymentOption: "pay_at_fulfillment" | "paystack";
  items: Array<{ menuItemId: string; quantity: number; modifierOptionIds: string[]; notes: string }>;
  companyWebsite?: string;
};

function requiredText(value: string, label: string, maximumLength: number) {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximumLength) {
    throw new Error(`${label} is required and must be no more than ${maximumLength} characters.`);
  }
  return normalized;
}

function getClientIp(requestHeaders: Headers) {
  const realIp = requestHeaders.get("x-real-ip")?.trim();
  if (realIp) return realIp.slice(0, 128);
  const forwardedIp = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwardedIp) return forwardedIp.slice(0, 128);
  return "unknown";
}

export async function submitRestaurantOnlineOrder(
  orgSlug: string,
  branchSlug: string,
  input: OnlineOrderInput,
) {
  if (typeof orgSlug !== "string" || typeof branchSlug !== "string"
    || !input || typeof input !== "object") {
    throw new Error("The restaurant order request is invalid.");
  }
  if ((input.companyWebsite !== undefined && typeof input.companyWebsite !== "string")
    || orgSlug.length > 120 || branchSlug.length > 120) {
    throw new Error("The restaurant order request is invalid.");
  }
  if (typeof input.customerName !== "string" || typeof input.customerPhone !== "string"
    || typeof input.customerEmail !== "string" || typeof input.deliveryAddress !== "string"
    || typeof input.notes !== "string") {
    throw new Error("Enter valid customer and order details.");
  }
  if (input.companyWebsite?.trim()) throw new Error("Unable to submit this order.");
  if (!["pickup", "delivery"].includes(input.fulfillment)
    || !["pay_at_fulfillment", "paystack"].includes(input.paymentOption)) {
    throw new Error("Choose a valid fulfillment and payment option.");
  }
  const customerName = requiredText(input.customerName, "Name", 120);
  const customerPhone = requiredText(input.customerPhone, "Phone number", 40);
  const customerEmail = requiredText(input.customerEmail, "Email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) throw new Error("Enter a valid email address.");
  const deliveryAddress = input.fulfillment === "delivery"
    ? requiredText(input.deliveryAddress, "Delivery address", 300)
    : "";
  const notes = input.notes.trim();
  if (notes.length > 500) throw new Error("Order notes cannot exceed 500 characters.");
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 50) {
    throw new Error("Add between 1 and 50 menu items.");
  }
  const items: Json[] = input.items.map((item) => {
    if (!item || typeof item !== "object"
      || typeof item.menuItemId !== "string"
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.menuItemId)
      || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 999
      || !Array.isArray(item.modifierOptionIds) || item.modifierOptionIds.length > 100
      || item.modifierOptionIds.some((id) => typeof id !== "string"
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
      || typeof item.notes !== "string" || item.notes.length > 180) {
      throw new Error("One or more menu selections are invalid.");
    }
    return {
      menu_item_id: item.menuItemId,
      quantity: item.quantity,
      modifier_option_ids: item.modifierOptionIds,
      notes: item.notes.trim(),
    };
  });

  const admin = createAdminClient();
  const { data: organization, error: organizationError } = await admin.from("organizations")
    .select("id, currency").eq("slug", orgSlug).maybeSingle();
  if (organizationError) throw new Error(`Could not load restaurant: ${organizationError.message}`);
  if (!organization || !(await getEnabledOrganizationModules(organization.id)).includes("Restaurant")) {
    throw new Error("This restaurant storefront is unavailable.");
  }
  if (input.paymentOption === "paystack" && !isRestaurantPaystackAvailable(organization.currency)) {
    throw new Error("Online payment is temporarily unavailable. Choose pay at pickup/delivery instead.");
  }
  const { data: location, error: locationError } = await admin.from("business_locations")
    .select("id, name").eq("org_id", organization.id).eq("customer_portal_slug", branchSlug)
    .eq("is_active", true).maybeSingle();
  if (locationError) throw new Error(`Could not load restaurant branch: ${locationError.message}`);
  if (!location) throw new Error("This restaurant branch is unavailable.");
  const { data: settings, error: settingsError } = await admin.from("restaurant_online_settings")
    .select("is_enabled, accepts_pickup, accepts_delivery, send_order_emails")
    .eq("org_id", organization.id).eq("location_id", location.id).maybeSingle();
  if (settingsError) throw new Error(`Could not verify restaurant online ordering: ${settingsError.message}`);
  if (!settings?.is_enabled
    || (input.fulfillment === "pickup" && !settings.accepts_pickup)
    || (input.fulfillment === "delivery" && !settings.accepts_delivery)) {
    throw new Error("This restaurant is not accepting that type of online order.");
  }

  const requestHeaders = await headers();
  const ipHash = getRegistrationIpHash(getClientIp(requestHeaders));
  const { data: withinLimit, error: limitError } = await admin.rpc("consume_restaurant_online_order_rate_limit", {
    p_location_id: location.id,
    p_ip_hash: ipHash,
  });
  if (limitError) throw new Error(`Could not verify online order limit: ${limitError.message}`);
  if (!withinLimit) throw new Error("Too many order attempts. Please wait before trying again.");

  const reference = input.paymentOption === "paystack" ? randomUUID() : null;
  await assertRestaurantPackagedStockAvailable(admin, organization.id, location.id, input.items);
  const { data: result, error: orderError } = await admin.rpc("create_restaurant_online_order", {
    p_org_id: organization.id,
    p_branch_slug: branchSlug,
    p_fulfillment: input.fulfillment,
    p_customer_name: customerName,
    p_customer_phone: customerPhone,
    p_customer_email: customerEmail,
    p_delivery_address: deliveryAddress || null,
    p_notes: notes || null,
    p_payment_option: input.paymentOption,
    p_payment_reference: reference,
    p_currency: input.paymentOption === "paystack" ? organization.currency : null,
    p_items: items,
  });
  if (orderError) throw new Error(`Could not place restaurant order: ${orderError.message}`);
  const order = result?.[0];
  if (!order) throw new Error("Restaurant order creation returned no order.");
  const { data: trackingOrder, error: trackingError } = await admin.from("restaurant_orders")
    .select("customer_tracking_token").eq("org_id", organization.id).eq("id", order.order_id).maybeSingle();
  if (trackingError) throw new Error(`Could not prepare restaurant order tracking: ${trackingError.message}`);
  if (!trackingOrder?.customer_tracking_token) throw new Error("Restaurant order tracking could not be created.");

  if (input.paymentOption === "pay_at_fulfillment") {
    let emailNotification: { sent: boolean; reason?: string } | null = null;
    if (settings.send_order_emails) {
      const emailResult = await sendRestaurantOrderEmail({
        email: customerEmail,
        orderNumber: order.order_number,
        branchName: location.name,
        status: "received",
        trackingToken: trackingOrder.customer_tracking_token,
      });
      emailNotification = { sent: emailResult.sent, reason: emailResult.reason };
    }
    return {
      orderNumber: order.order_number,
      total: order.total,
      checkoutUrl: null,
      trackingToken: trackingOrder.customer_tracking_token,
      emailNotification,
    };
  }

  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  const baseUrl = getRestaurantOnlineBaseUrl();
  if (!secretKey || !baseUrl || !reference) {
    const { error: cancelError } = await admin.rpc("cancel_restaurant_online_payment_attempt", { p_reference: reference ?? "" });
    if (cancelError) throw new Error(`Online payment is not configured and the pending order could not be cancelled: ${cancelError.message}`);
    throw new Error("Online payment is not configured. Choose pay at pickup/delivery instead.");
  }
  let response: Response;
  try {
    response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: customerEmail,
        amount: order.amount_minor,
        currency: organization.currency,
        reference,
        callback_url: `${baseUrl}/api/restaurant-order/paystack/callback`,
      }),
      cache: "no-store",
    });
  } catch (error) {
    throw new Error(`Payment setup could not be confirmed for order #${order.order_number}. Contact the restaurant before retrying. ${error instanceof Error ? error.message : "Paystack could not be reached."}`);
  }
  let paystackResult: {
    status?: unknown;
    message?: unknown;
    data?: { authorization_url?: unknown; reference?: unknown };
  };
  try {
    paystackResult = await response.json() as typeof paystackResult;
  } catch {
    throw new Error(`Payment setup could not be confirmed for order #${order.order_number}. Contact the restaurant before retrying.`);
  }
  const checkoutUrl = paystackResult.data?.authorization_url;
  let validCheckoutUrl: string | null = null;
  if (typeof checkoutUrl === "string" && paystackResult.data?.reference === reference) {
    try {
      if (new URL(checkoutUrl).hostname === "checkout.paystack.com") validCheckoutUrl = checkoutUrl;
    } catch {
      validCheckoutUrl = null;
    }
  }
  if (!response.ok || paystackResult.status !== true || !validCheckoutUrl) {
    if (response.status < 500) {
      const { error: cancelError } = await admin.rpc("cancel_restaurant_online_payment_attempt", { p_reference: reference });
      if (cancelError) throw new Error(`Paystack declined checkout and the pending order could not be cancelled: ${cancelError.message}`);
    } else {
      throw new Error(`Payment setup could not be confirmed for order #${order.order_number}. Contact the restaurant before retrying.`);
    }
    const providerMessage = typeof paystackResult.message === "string" ? paystackResult.message : "Paystack could not initialize checkout.";
    throw new Error(providerMessage);
  }
  return {
    orderNumber: order.order_number,
    total: order.total,
    checkoutUrl: validCheckoutUrl,
    trackingToken: trackingOrder.customer_tracking_token,
  };
}
