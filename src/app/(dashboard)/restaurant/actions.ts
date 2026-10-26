"use server";

import { revalidatePath } from "next/cache";
import { canUseLocation } from "@/lib/organizations/location-access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEnabledOrganizationModules } from "@/lib/supabase/platform-admin";
import type { Json } from "@/types/database";

type RestaurantTab = "orders" | "menu" | "tables";
type OrderType = "dine_in" | "takeaway" | "delivery";
type PaymentMethod = "cash" | "card" | "mobile_money" | "other";

async function restaurantContext(tab: RestaurantTab, action: "view" | "create" | "edit" | "delete") {
  const context = await getCurrentOrgContext();
  if (!context) throw new Error("Your session expired. Sign in again to continue.");
  if (!(await getEnabledOrganizationModules(context.orgId)).includes("Restaurant")) {
    throw new Error("Restaurant Management is not enabled for this organization. Ask your Platform Admin to enable it.");
  }
  if (!(await canTabPermission("restaurant", "operations", tab, action))) {
    throw new Error(`You do not have permission to ${action} restaurant ${tab}.`);
  }
  return context;
}

function requireOrganizationWideAccess(isBranchScoped: boolean, entity: string) {
  if (isBranchScoped) throw new Error(`${entity} are shared across the organization. Only organization-wide users can manage them.`);
}

function requiredText(value: string, label: string, maxLength: number) {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new Error(`${label} is required and must be no more than ${maxLength} characters.`);
  }
  return normalized;
}

export async function saveRestaurantCategory(input: { id?: string; name: string; sortOrder: number; isActive: boolean }) {
  const context = await restaurantContext("menu", input.id ? "edit" : "create");
  requireOrganizationWideAccess(context.isBranchScoped, "Menu categories");
  const name = requiredText(input.name, "Category name", 100);
  if (!Number.isInteger(input.sortOrder) || typeof input.isActive !== "boolean") throw new Error("Invalid category settings.");
  const admin = createAdminClient();
  const payload = { name, sort_order: input.sortOrder, is_active: input.isActive, updated_at: new Date().toISOString() };
  if (input.id) {
    const { data: existing, error: loadError } = await admin.from("restaurant_menu_categories")
      .select("id").eq("org_id", context.orgId).eq("id", input.id).maybeSingle();
    if (loadError) throw new Error(`Could not load menu category: ${loadError.message}`);
    if (!existing) throw new Error("Menu category not found.");
  }
  const query = input.id
    ? admin.from("restaurant_menu_categories").update(payload).eq("org_id", context.orgId).eq("id", input.id)
    : admin.from("restaurant_menu_categories").insert({ ...payload, org_id: context.orgId });
  const { error } = await query;
  if (error) throw new Error(`Could not save menu category: ${error.message}`);
  revalidatePath("/restaurant");
}

export async function saveRestaurantMenuItem(input: {
  id?: string;
  categoryId: string | null;
  name: string;
  description: string;
  price: number;
  sortOrder: number;
  isActive: boolean;
}) {
  const context = await restaurantContext("menu", input.id ? "edit" : "create");
  requireOrganizationWideAccess(context.isBranchScoped, "Menu items");
  const name = requiredText(input.name, "Menu item name", 120);
  if (!Number.isFinite(input.price) || input.price < 0 || !Number.isInteger(input.sortOrder) || typeof input.isActive !== "boolean") {
    throw new Error("Enter a valid non-negative price and item position.");
  }
  const admin = createAdminClient();
  if (input.categoryId) {
    const { data: category, error } = await admin.from("restaurant_menu_categories")
      .select("id").eq("org_id", context.orgId).eq("id", input.categoryId).maybeSingle();
    if (error) throw new Error(`Could not verify menu category: ${error.message}`);
    if (!category) throw new Error("Choose a menu category from this organization.");
  }
  if (input.id) {
    const { data: existing, error: loadError } = await admin.from("restaurant_menu_items")
      .select("id").eq("org_id", context.orgId).eq("id", input.id).maybeSingle();
    if (loadError) throw new Error(`Could not load menu item: ${loadError.message}`);
    if (!existing) throw new Error("Menu item not found.");
  }
  const payload = {
    category_id: input.categoryId,
    name,
    description: input.description.trim() || null,
    price: input.price,
    sort_order: input.sortOrder,
    is_active: input.isActive,
    updated_at: new Date().toISOString(),
  };
  const query = input.id
    ? admin.from("restaurant_menu_items").update(payload).eq("org_id", context.orgId).eq("id", input.id)
    : admin.from("restaurant_menu_items").insert({ ...payload, org_id: context.orgId });
  const { error } = await query;
  if (error) throw new Error(`Could not save menu item: ${error.message}`);
  revalidatePath("/restaurant");
}

export async function saveRestaurantTable(input: {
  id?: string;
  locationId: string;
  tableName: string;
  seats: number;
  isActive: boolean;
}) {
  const context = await restaurantContext("tables", input.id ? "edit" : "create");
  const tableName = requiredText(input.tableName, "Table name", 40);
  if (!Number.isInteger(input.seats) || input.seats < 1 || input.seats > 100) throw new Error("Table seating must be between 1 and 100.");
  if (!canUseLocation(context, input.locationId)) throw new Error("You cannot manage tables at that branch.");
  const admin = createAdminClient();
  if (input.id) {
    const { data: existing, error: loadError } = await admin.from("restaurant_tables")
      .select("id, location_id").eq("org_id", context.orgId).eq("id", input.id).maybeSingle();
    if (loadError) throw new Error(`Could not load dining table: ${loadError.message}`);
    if (!existing || !canUseLocation(context, existing.location_id)) throw new Error("Dining table not found or not accessible.");
    if (existing.location_id !== input.locationId) throw new Error("A dining table cannot be moved to another branch after it is created.");
    if (!input.isActive) {
      const { data: openOrders, error: ordersError } = await admin.from("restaurant_orders")
        .select("id").eq("org_id", context.orgId).eq("table_id", input.id)
        .not("status", "in", "(completed,cancelled)").limit(1);
      if (ordersError) throw new Error(`Could not check dining table occupancy: ${ordersError.message}`);
      if (openOrders?.length) throw new Error("A dining table with an open order cannot be marked unavailable.");
    }
  }
  const { data: location, error: locationError } = await admin.from("business_locations")
    .select("id").eq("org_id", context.orgId).eq("id", input.locationId).eq("is_active", true).maybeSingle();
  if (locationError) throw new Error(`Could not verify restaurant branch: ${locationError.message}`);
  if (!location) throw new Error("Choose an active branch belonging to this organization.");
  const payload = {
    location_id: input.locationId,
    table_name: tableName,
    seats: input.seats,
    is_active: input.isActive,
    updated_at: new Date().toISOString(),
  };
  const query = input.id
    ? admin.from("restaurant_tables").update(payload).eq("org_id", context.orgId).eq("id", input.id)
    : admin.from("restaurant_tables").insert({ ...payload, org_id: context.orgId });
  const { error } = await query;
  if (error) throw new Error(`Could not save dining table: ${error.message}`);
  revalidatePath("/restaurant");
}

export async function createRestaurantOrder(input: {
  locationId: string;
  orderType: OrderType;
  tableId: string | null;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  notes: string;
  items: Array<{ menuItemId: string; quantity: number; notes: string }>;
}) {
  const context = await restaurantContext("orders", "create");
  if (!canUseLocation(context, input.locationId)) throw new Error("You cannot take restaurant orders at that branch.");
  if (!["dine_in", "takeaway", "delivery"].includes(input.orderType)) throw new Error("Choose a valid order type.");
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 100) {
    throw new Error("Add between 1 and 100 items to the order.");
  }
  if ((input.orderType === "dine_in") !== Boolean(input.tableId)) {
    throw new Error("Select a table for dine-in orders only.");
  }
  const items: Json[] = input.items.map((item) => {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > 999) {
      throw new Error("Order quantities must be whole numbers between 1 and 999.");
    }
    return { menu_item_id: item.menuItemId, quantity: item.quantity, notes: item.notes.trim() };
  });
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("create_restaurant_order", {
    p_org_id: context.orgId,
    p_location_id: input.locationId,
    p_order_type: input.orderType,
    p_table_id: input.tableId,
    p_customer_name: input.customerName.trim() || null,
    p_customer_phone: input.customerPhone.trim() || null,
    p_delivery_address: input.deliveryAddress.trim() || null,
    p_notes: input.notes.trim() || null,
    p_items: items,
    p_created_by: context.userId,
  });
  if (error) throw new Error(`Could not create restaurant order: ${error.message}`);
  revalidatePath("/restaurant");
  return { orderNumber: data.order_number };
}

export async function updateRestaurantOrderStatus(orderId: string, status: string) {
  const context = await restaurantContext("orders", "edit");
  const allowed = ["confirmed", "preparing", "ready", "served", "completed", "cancelled"];
  if (!allowed.includes(status)) throw new Error("Choose a valid restaurant order status.");
  const admin = createAdminClient();
  const { data: order, error: loadError } = await admin.from("restaurant_orders")
    .select("id, location_id, status, order_type").eq("org_id", context.orgId).eq("id", orderId).maybeSingle();
  if (loadError) throw new Error(`Could not load restaurant order: ${loadError.message}`);
  if (!order || !canUseLocation(context, order.location_id)) throw new Error("Restaurant order not found or not accessible.");
  if (order.status === "completed" || order.status === "cancelled") throw new Error("This restaurant order is already closed.");
  const nextStatus: Partial<Record<typeof order.status, string>> = {
    new: "confirmed",
    confirmed: "preparing",
    preparing: "ready",
    ready: order.order_type === "dine_in" ? "served" : "completed",
    served: "completed",
  };
  if (status !== "cancelled" && nextStatus[order.status] !== status) {
    throw new Error("Restaurant orders must move through the service steps in order.");
  }
  if (status === "ready" || status === "served") {
    const { data: items, error: itemsError } = await admin.from("restaurant_order_items")
      .select("kitchen_status").eq("org_id", context.orgId).eq("order_id", orderId);
    if (itemsError) throw new Error(`Could not verify kitchen progress: ${itemsError.message}`);
    const requiredStatuses = status === "ready" ? ["ready", "served", "cancelled"] : ["served", "cancelled"];
    if (!items?.length || items.some((item) => !requiredStatuses.includes(item.kitchen_status))) {
      throw new Error(status === "ready"
        ? "Mark every kitchen item ready before advancing the order."
        : "Mark every kitchen item served before completing dine-in service.");
    }
  }
  if (status === "completed") {
    const { data: payment, error: paymentError } = await admin.from("restaurant_orders")
      .select("payment_status").eq("org_id", context.orgId).eq("id", orderId).single();
    if (paymentError) throw new Error(`Could not verify order payment: ${paymentError.message}`);
    if (payment.payment_status !== "paid") throw new Error("Record full payment before completing an order.");
  }
  const { error } = await admin.from("restaurant_orders")
    .update({ status: status as "confirmed" | "preparing" | "ready" | "served" | "completed" | "cancelled", updated_at: new Date().toISOString() })
    .eq("org_id", context.orgId).eq("id", orderId);
  if (error) throw new Error(`Could not update restaurant order: ${error.message}`);
  revalidatePath("/restaurant");
}

export async function updateRestaurantKitchenStatus(itemId: string, status: string) {
  const context = await restaurantContext("orders", "edit");
  if (!["preparing", "ready", "served", "cancelled"].includes(status)) throw new Error("Choose a valid kitchen status.");
  const admin = createAdminClient();
  const { data: item, error: loadError } = await admin.from("restaurant_order_items")
    .select("id, order_id, kitchen_status").eq("org_id", context.orgId).eq("id", itemId).maybeSingle();
  if (loadError) throw new Error(`Could not load kitchen item: ${loadError.message}`);
  if (!item) throw new Error("Kitchen item not found.");
  const nextStatus: Partial<Record<typeof item.kitchen_status, string>> = {
    new: "preparing",
    preparing: "ready",
    ready: "served",
  };
  if (status !== "cancelled" && nextStatus[item.kitchen_status] !== status) {
    throw new Error("Kitchen items must move through the preparation steps in order.");
  }
  const { data: order, error: orderError } = await admin.from("restaurant_orders")
    .select("location_id, status").eq("org_id", context.orgId).eq("id", item.order_id).maybeSingle();
  if (orderError) throw new Error(`Could not load kitchen order: ${orderError.message}`);
  if (!order || !canUseLocation(context, order.location_id)) throw new Error("Kitchen order not found or not accessible.");
  if (order.status === "completed" || order.status === "cancelled") throw new Error("Closed orders cannot be changed in the kitchen.");
  if (status === "served" && !["ready", "served"].includes(order.status)) {
    throw new Error("Kitchen items can only be marked served after the order is ready.");
  }
  const { error } = await admin.from("restaurant_order_items")
    .update({ kitchen_status: status as "preparing" | "ready" | "served" | "cancelled" })
    .eq("org_id", context.orgId).eq("id", itemId);
  if (error) throw new Error(`Could not update kitchen item: ${error.message}`);
  revalidatePath("/restaurant");
}

export async function recordRestaurantPayment(input: { orderId: string; amount: number; method: PaymentMethod }) {
  const context = await restaurantContext("orders", "create");
  if (!Number.isFinite(input.amount) || input.amount <= 0 || !["cash", "card", "mobile_money", "other"].includes(input.method)) {
    throw new Error("Enter a valid payment amount and method.");
  }
  const admin = createAdminClient();
  const { data: order, error: orderError } = await admin.from("restaurant_orders")
    .select("location_id").eq("org_id", context.orgId).eq("id", input.orderId).maybeSingle();
  if (orderError) throw new Error(`Could not verify restaurant order: ${orderError.message}`);
  if (!order || !canUseLocation(context, order.location_id)) throw new Error("Restaurant order not found or not accessible.");
  const { error } = await admin.rpc("record_restaurant_payment", {
    p_org_id: context.orgId,
    p_order_id: input.orderId,
    p_amount: input.amount,
    p_payment_method: input.method,
    p_received_by: context.userId,
  });
  if (error) throw new Error(`Could not record restaurant payment: ${error.message}`);
  revalidatePath("/restaurant");
}
