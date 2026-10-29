"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { canUseLocation } from "@/lib/organizations/location-access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEnabledOrganizationModules } from "@/lib/supabase/platform-admin";
import { assertRestaurantPackagedStockAvailable } from "@/lib/restaurant/packaged-stock";
import {
  sendRestaurantOrderEmail,
  sendRestaurantReservationEmail,
  type RestaurantEmailStatus,
  type RestaurantReservationEmailStatus,
} from "@/lib/restaurant/order-emails";
import type { Json } from "@/types/database";

type RestaurantTab = "orders" | "menu" | "tables" | "reservations" | "ingredients";
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

function validMoney(value: number, allowZero = false) {
  return Number.isFinite(value)
    && (allowZero ? value >= 0 : value > 0)
    && Math.abs(value * 100 - Math.round(value * 100)) < 0.000001;
}

function validQuantity(value: number, allowZero = false) {
  return Number.isFinite(value)
    && (allowZero ? value >= 0 : value > 0)
    && Math.abs(value * 1000 - Math.round(value * 1000)) < 0.000001;
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
  sku?: string | null;
  description: string;
  imageUrl?: string | null;
  price: number;
  itemType?: "prepared" | "packaged";
  prepStation: "kitchen" | "bar" | "dessert";
  sortOrder: number;
  isActive: boolean;
}) {
  const context = await restaurantContext("menu", input.id ? "edit" : "create");
  requireOrganizationWideAccess(context.isBranchScoped, "Menu items");
  const name = requiredText(input.name, "Menu item name", 120);
  if (input.sku !== undefined && input.sku !== null && typeof input.sku !== "string") {
    throw new Error("Enter a valid menu item SKU.");
  }
  const sku = input.sku?.trim() || null;
  if (sku && sku.length > 80) throw new Error("SKU must be no more than 80 characters.");
  if (!Number.isFinite(input.price) || input.price < 0 || !Number.isInteger(input.sortOrder)
    || !["kitchen", "bar", "dessert"].includes(input.prepStation)
    || (input.itemType !== undefined && !["prepared", "packaged"].includes(input.itemType))
    || typeof input.isActive !== "boolean") {
    throw new Error("Enter a valid non-negative price and item position.");
  }
  const admin = createAdminClient();
  if (input.imageUrl !== undefined && input.imageUrl !== null) {
    if (typeof input.imageUrl !== "string" || input.imageUrl.length > 2000) {
      throw new Error("Choose a valid restaurant menu image.");
    }
    const publicImagePrefix = admin.storage.from("restaurant-menu-images")
      .getPublicUrl(`${context.orgId}/`).data.publicUrl;
    if (!input.imageUrl.startsWith(publicImagePrefix)) {
      throw new Error("Menu images must be uploaded to this organization's restaurant image library.");
    }
  }
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
    ...(input.sku !== undefined ? { sku } : {}),
    description: input.description.trim() || null,
    ...(input.imageUrl !== undefined ? { image_url: input.imageUrl } : {}),
    price: input.price,
    ...(input.itemType !== undefined ? { item_type: input.itemType } : {}),
    prep_station: input.prepStation,
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
  revalidatePath("/restaurant/packaged-items");
  revalidatePath("/restaurant/pos");
  revalidatePath("/restaurant-order/[orgSlug]/branch/[branchSlug]", "page");
}

export async function adjustRestaurantPackagedItemStock(input: {
  locationId: string;
  menuItemId: string;
  quantityDelta: number;
  reason: string;
}) {
  const context = await restaurantContext("ingredients", "edit");
  if (!canUseLocation(context, input.locationId)) throw new Error("You cannot adjust packaged stock at that branch.");
  if (!Number.isFinite(input.quantityDelta) || input.quantityDelta === 0
    || Math.abs(input.quantityDelta * 1000 - Math.round(input.quantityDelta * 1000)) > 0.000001) {
    throw new Error("Enter a non-zero stock change with up to three decimal places.");
  }
  const reason = requiredText(input.reason, "Adjustment reason", 200);
  const admin = createAdminClient();
  const { data: item, error: itemError } = await admin.from("restaurant_menu_items")
    .select("id, item_type").eq("org_id", context.orgId).eq("id", input.menuItemId).maybeSingle();
  if (itemError) throw new Error(`Could not verify packaged item: ${itemError.message}`);
  if (!item || item.item_type !== "packaged") throw new Error("Choose a packaged restaurant menu item.");
  const { error } = await admin.rpc("adjust_restaurant_packaged_item_stock", {
    p_org_id: context.orgId,
    p_location_id: input.locationId,
    p_menu_item_id: input.menuItemId,
    p_quantity_delta: input.quantityDelta,
    p_reason: reason,
    p_created_by: context.userId,
  });
  if (error) throw new Error(`Could not adjust packaged item stock: ${error.message}`);
  revalidatePath("/restaurant/packaged-items");
  revalidatePath("/restaurant/dashboard");
  revalidatePath("/restaurant/pos");
}

export type RestaurantMenuImportRow = {
  name: string;
  sku: string;
  category: string;
  description: string;
  price: number;
  prepStation: "kitchen" | "bar" | "dessert";
  imageUrl: string;
};

export async function importRestaurantMenuItems(rows: RestaurantMenuImportRow[]) {
  const context = await restaurantContext("menu", "create");
  requireOrganizationWideAccess(context.isBranchScoped, "Menu items");
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 500) {
    throw new Error("Import between 1 and 500 menu items at a time.");
  }

  const normalizedRows = rows.map((row) => {
    if (!row || typeof row !== "object"
      || typeof row.name !== "string"
      || typeof row.sku !== "string"
      || typeof row.category !== "string"
      || typeof row.description !== "string"
      || typeof row.price !== "number"
      || typeof row.prepStation !== "string"
      || typeof row.imageUrl !== "string") {
      throw new Error("The import file contains an invalid row.");
    }
    const name = requiredText(row.name, "Menu item name", 120);
    const sku = row.sku.trim() || null;
    const category = row.category.trim();
    const description = row.description.trim();
    if (sku && sku.length > 80) throw new Error(`SKU for "${name}" must be no more than 80 characters.`);
    if (category.length > 100) throw new Error(`Category for "${name}" must be no more than 100 characters.`);
    if (description.length > 2000) throw new Error(`Description for "${name}" must be no more than 2,000 characters.`);
    if (!validMoney(row.price, true)) throw new Error(`Price for "${name}" must be a non-negative amount with up to 2 decimal places.`);
    if (!["kitchen", "bar", "dessert"].includes(row.prepStation)) {
      throw new Error(`Prep station for "${name}" must be kitchen, bar, or dessert.`);
    }
    const imageUrl = row.imageUrl.trim();
    if (imageUrl) {
      if (imageUrl.length > 2000) throw new Error(`Image URL for "${name}" is too long.`);
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(imageUrl);
      } catch {
        throw new Error(`Image URL for "${name}" must be a valid HTTPS URL.`);
      }
      if (parsedUrl.protocol !== "https:" || parsedUrl.username || parsedUrl.password) {
        throw new Error(`Image URL for "${name}" must be a valid HTTPS URL.`);
      }
    }
    return { name, sku, category, description: description || null, price: row.price, prepStation: row.prepStation as "kitchen" | "bar" | "dessert", imageUrl: imageUrl || null };
  });

  const skus = normalizedRows.flatMap((row) => row.sku ? [row.sku.toLowerCase()] : []);
  if (new Set(skus).size !== skus.length) throw new Error("The import contains duplicate SKUs. SKUs must be unique within the file.");

  const admin = createAdminClient();
  const [{ data: categories, error: categoryError }, { data: existingItems, error: itemsError }] = await Promise.all([
    admin.from("restaurant_menu_categories").select("id, name, is_active").eq("org_id", context.orgId),
    admin.from("restaurant_menu_items").select("sku, sort_order").eq("org_id", context.orgId),
  ]);
  if (categoryError) throw new Error(`Could not load restaurant menu categories: ${categoryError.message}`);
  if (itemsError) throw new Error(`Could not check existing restaurant menu items: ${itemsError.message}`);

  const categoryIds = new Map(
    (categories ?? []).filter((category) => category.is_active).map((category) => [category.name.trim().toLowerCase(), category.id]),
  );
  const unknownCategory = normalizedRows.find((row) => row.category && !categoryIds.has(row.category.toLowerCase()));
  if (unknownCategory) throw new Error(`Category "${unknownCategory.category}" does not exist or is unavailable. Create or activate it before importing.`);

  const existingSkus = new Set((existingItems ?? []).flatMap((item) => item.sku ? [item.sku.trim().toLowerCase()] : []));
  const existingSku = normalizedRows.find((row) => row.sku && existingSkus.has(row.sku.toLowerCase()));
  if (existingSku) throw new Error(`SKU "${existingSku.sku}" already exists in this restaurant menu.`);

  const nextSortOrder = Math.max(-1, ...(existingItems ?? []).map((item) => item.sort_order)) + 1;
  const timestamp = new Date().toISOString();
  const { error: insertError } = await admin.from("restaurant_menu_items").insert(normalizedRows.map((row, index) => ({
    org_id: context.orgId,
    category_id: row.category ? categoryIds.get(row.category.toLowerCase()) ?? null : null,
    name: row.name,
    sku: row.sku,
    description: row.description,
    image_url: row.imageUrl,
    price: row.price,
    prep_station: row.prepStation,
    sort_order: nextSortOrder + index,
    is_active: true,
    created_at: timestamp,
    updated_at: timestamp,
  })));
  if (insertError) {
    if (insertError.code === "23505") throw new Error("A menu item with one of these SKUs already exists. Refresh the menu and remove duplicates before importing.");
    throw new Error(`Could not import restaurant menu items: ${insertError.message}`);
  }

  revalidatePath("/restaurant");
  revalidatePath("/restaurant/pos");
  revalidatePath("/restaurant-order/[orgSlug]/branch/[branchSlug]", "page");
  return { imported: normalizedRows.length };
}

export async function uploadRestaurantMenuImage(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) throw new Error("Your session expired. Sign in again to continue.");
  if (!(await getEnabledOrganizationModules(context.orgId)).includes("Restaurant")) {
    throw new Error("Restaurant Management is not enabled for this organization.");
  }
  const canCreate = await canTabPermission("restaurant", "operations", "menu", "create");
  const canEdit = await canTabPermission("restaurant", "operations", "menu", "edit");
  if (context.isBranchScoped || (!canCreate && !canEdit)) {
    throw new Error("You do not have permission to upload restaurant menu images.");
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size < 1 || file.size > 5 * 1024 * 1024) {
    throw new Error("Choose an image no larger than 5 MB.");
  }
  const extensions: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  const extension = extensions[file.type];
  if (!extension) throw new Error("Choose a JPEG, PNG, or WebP image.");

  const admin = createAdminClient();
  const path = `${context.orgId}/${randomUUID()}.${extension}`;
  const { error: uploadError } = await admin.storage.from("restaurant-menu-images").upload(path, file, {
    contentType: file.type,
    cacheControl: "31536000",
    upsert: false,
  });
  if (uploadError) throw new Error(`Could not upload menu image: ${uploadError.message}`);
  return admin.storage.from("restaurant-menu-images").getPublicUrl(path).data.publicUrl;
}

export async function saveRestaurantOnlineSettings(input: {
  locationId: string;
  isEnabled: boolean;
  deliveryFee: number;
  sendOrderEmails: boolean;
  acceptsOnlineReservations: boolean;
  reservationTimezone: string;
  reservationHours: Array<{ closed: boolean; open: string; close: string }>;
  reservationDurationMinutes: number;
  reservationSlotIntervalMinutes: number;
}) {
  const context = await restaurantContext("menu", "edit");
  requireOrganizationWideAccess(context.isBranchScoped, "Restaurant online ordering settings");
  if (typeof input.isEnabled !== "boolean" || typeof input.sendOrderEmails !== "boolean"
    || typeof input.acceptsOnlineReservations !== "boolean"
    || typeof input.reservationTimezone !== "string"
    || !Array.isArray(input.reservationHours) || input.reservationHours.length !== 7
    || !Number.isInteger(input.reservationDurationMinutes) || input.reservationDurationMinutes < 30 || input.reservationDurationMinutes > 240
    || !Number.isInteger(input.reservationSlotIntervalMinutes) || input.reservationSlotIntervalMinutes < 15 || input.reservationSlotIntervalMinutes > 120
    || !validMoney(input.deliveryFee, true)) {
    throw new Error("Enter a valid online ordering status and delivery fee.");
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone: input.reservationTimezone }).format(new Date(0));
  } catch {
    throw new Error("Enter a valid IANA timezone, such as Africa/Accra.");
  }
  const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  for (const day of input.reservationHours) {
    if (!day || typeof day.closed !== "boolean"
      || typeof day.open !== "string" || typeof day.close !== "string"
      || (!day.closed && (!timePattern.test(day.open) || !timePattern.test(day.close) || day.close <= day.open))) {
      throw new Error("Set valid opening and closing times for each day, or mark the day closed.");
    }
  }
  const admin = createAdminClient();
  const { data: location, error: locationError } = await admin.from("business_locations")
    .select("id").eq("org_id", context.orgId).eq("id", input.locationId).eq("is_active", true).maybeSingle();
  if (locationError) throw new Error(`Could not load restaurant branch: ${locationError.message}`);
  if (!location || !canUseLocation(context, location.id)) throw new Error("Restaurant branch not found or not accessible.");
  const { error } = await admin.from("restaurant_online_settings").upsert({
    org_id: context.orgId,
    location_id: location.id,
    is_enabled: input.isEnabled,
    accepts_pickup: true,
    accepts_delivery: true,
    delivery_fee: input.deliveryFee,
    send_order_emails: input.sendOrderEmails,
    accepts_online_reservations: input.acceptsOnlineReservations,
    reservation_timezone: input.reservationTimezone,
    reservation_hours: input.reservationHours,
    reservation_duration_minutes: input.reservationDurationMinutes,
    reservation_slot_interval_minutes: input.reservationSlotIntervalMinutes,
    updated_by: context.userId,
    updated_at: new Date().toISOString(),
  }, { onConflict: "org_id,location_id" });
  if (error) throw new Error(`Could not save restaurant online ordering settings: ${error.message}`);
  revalidatePath("/restaurant");
}

export async function saveRestaurantModifierGroup(input: {
  id?: string;
  menuItemId: string;
  name: string;
  minSelections: number;
  maxSelections: number;
  isActive: boolean;
}) {
  const context = await restaurantContext("menu", input.id ? "edit" : "create");
  requireOrganizationWideAccess(context.isBranchScoped, "Menu modifiers");
  const name = requiredText(input.name, "Modifier group name", 80);
  if (!Number.isInteger(input.minSelections) || !Number.isInteger(input.maxSelections)
    || input.minSelections < 0 || input.maxSelections < 1 || input.maxSelections > 20
    || input.minSelections > input.maxSelections || typeof input.isActive !== "boolean") {
    throw new Error("Modifier selections must be between 0 and 20, with the minimum no greater than the maximum.");
  }
  const admin = createAdminClient();
  const { data: menuItem, error: menuError } = await admin.from("restaurant_menu_items")
    .select("id").eq("org_id", context.orgId).eq("id", input.menuItemId).maybeSingle();
  if (menuError) throw new Error(`Could not verify menu item: ${menuError.message}`);
  if (!menuItem) throw new Error("Choose a menu item from this organization.");
  if (input.id) {
    const { data: existing, error } = await admin.from("restaurant_modifier_groups")
      .select("id, menu_item_id").eq("org_id", context.orgId).eq("id", input.id).maybeSingle();
    if (error) throw new Error(`Could not load modifier group: ${error.message}`);
    if (!existing || existing.menu_item_id !== input.menuItemId) throw new Error("Modifier group not found for this menu item.");
  }
  if (input.isActive && input.id) {
    const { count, error } = await admin.from("restaurant_modifier_options")
      .select("id", { count: "exact", head: true })
      .eq("org_id", context.orgId).eq("group_id", input.id).eq("is_active", true);
    if (error) throw new Error(`Could not verify modifier options: ${error.message}`);
    if ((count ?? 0) < input.minSelections) {
      throw new Error("Add enough active options to satisfy the required minimum before activating this group.");
    }
  }
  const payload = {
    menu_item_id: input.menuItemId,
    name,
    min_selections: input.minSelections,
    max_selections: input.maxSelections,
    is_active: input.isActive,
    updated_at: new Date().toISOString(),
  };
  const query = input.id
    ? admin.from("restaurant_modifier_groups").update(payload).eq("org_id", context.orgId).eq("id", input.id)
    : admin.from("restaurant_modifier_groups").insert({ ...payload, org_id: context.orgId });
  const { error } = await query;
  if (error) throw new Error(`Could not save modifier group: ${error.message}`);
  revalidatePath("/restaurant");
}

export async function saveRestaurantModifierOption(input: {
  id?: string;
  groupId: string;
  name: string;
  priceDelta: number;
  isActive: boolean;
}) {
  const context = await restaurantContext("menu", input.id ? "edit" : "create");
  requireOrganizationWideAccess(context.isBranchScoped, "Menu modifiers");
  const name = requiredText(input.name, "Modifier option name", 80);
  if (!Number.isFinite(input.priceDelta) || input.priceDelta < 0 || typeof input.isActive !== "boolean") {
    throw new Error("Modifier price adjustment must be a non-negative amount.");
  }
  const admin = createAdminClient();
  const { data: group, error: groupError } = await admin.from("restaurant_modifier_groups")
    .select("id").eq("org_id", context.orgId).eq("id", input.groupId).maybeSingle();
  if (groupError) throw new Error(`Could not verify modifier group: ${groupError.message}`);
  if (!group) throw new Error("Choose a modifier group from this organization.");
  if (input.id) {
    const { data: existing, error } = await admin.from("restaurant_modifier_options")
      .select("id, group_id, is_active").eq("org_id", context.orgId).eq("id", input.id).maybeSingle();
    if (error) throw new Error(`Could not load modifier option: ${error.message}`);
    if (!existing || existing.group_id !== input.groupId) throw new Error("Modifier option not found in this group.");
    if (existing.is_active && !input.isActive) {
      const { data: modifierGroup, error: modifierGroupError } = await admin.from("restaurant_modifier_groups")
        .select("min_selections, is_active").eq("org_id", context.orgId).eq("id", input.groupId).maybeSingle();
      if (modifierGroupError) throw new Error(`Could not verify modifier group: ${modifierGroupError.message}`);
      if (modifierGroup?.is_active) {
        const { count, error: countError } = await admin.from("restaurant_modifier_options")
          .select("id", { count: "exact", head: true })
          .eq("org_id", context.orgId).eq("group_id", input.groupId).eq("is_active", true);
        if (countError) throw new Error(`Could not count active modifier options: ${countError.message}`);
        if ((count ?? 0) - 1 < modifierGroup.min_selections) {
          throw new Error("This option is required by the active group minimum. Deactivate the group or add another active option first.");
        }
      }
    }
  }
  const payload = {
    group_id: input.groupId,
    name,
    price_delta: input.priceDelta,
    is_active: input.isActive,
    updated_at: new Date().toISOString(),
  };
  const query = input.id
    ? admin.from("restaurant_modifier_options").update(payload).eq("org_id", context.orgId).eq("id", input.id)
    : admin.from("restaurant_modifier_options").insert({ ...payload, org_id: context.orgId });
  const { error } = await query;
  if (error) throw new Error(`Could not save modifier option: ${error.message}`);
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

export async function createRestaurantReservation(input: {
  locationId: string;
  tableId: string | null;
  guestName: string;
  guestPhone: string;
  partySize: number;
  startsAt: string;
  durationMinutes: number;
  notes: string;
  waitlist: boolean;
}) {
  const context = await restaurantContext("reservations", "create");
  if (!canUseLocation(context, input.locationId)) throw new Error("You cannot manage reservations at that branch.");
  const guestName = requiredText(input.guestName, "Guest name", 120);
  const guestPhone = requiredText(input.guestPhone, "Guest phone", 40);
  const startsAt = new Date(input.startsAt);
  if (!Number.isInteger(input.partySize) || input.partySize < 1 || input.partySize > 100) {
    throw new Error("Party size must be between 1 and 100.");
  }
  if (!Number.isFinite(startsAt.getTime()) || startsAt.getTime() < Date.now() - 5 * 60 * 1000) {
    throw new Error("Choose a valid future reservation time.");
  }
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 30 || input.durationMinutes > 240) {
    throw new Error("Reservation duration must be between 30 and 240 minutes.");
  }
  if (typeof input.waitlist !== "boolean" || (input.waitlist && input.tableId)) {
    throw new Error("Waitlist entries cannot be assigned a table.");
  }
  if (!input.waitlist && !input.tableId) {
    throw new Error("Choose a table for the reservation or add the guest to the waitlist.");
  }
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("create_restaurant_reservation", {
    p_org_id: context.orgId,
    p_location_id: input.locationId,
    p_table_id: input.waitlist ? null : input.tableId,
    p_guest_name: guestName,
    p_guest_phone: guestPhone,
    p_party_size: input.partySize,
    p_starts_at: startsAt.toISOString(),
    p_duration_minutes: input.durationMinutes,
    p_notes: input.notes.trim() || null,
    p_created_by: context.userId,
    p_waitlist: input.waitlist,
  });
  if (error) throw new Error(`Could not create reservation: ${error.message}`);
  revalidatePath("/restaurant");
  return { id: data.id };
}

export async function updateRestaurantReservationStatus(
  reservationId: string,
  status: "confirmed" | "seated" | "completed" | "cancelled" | "no_show",
) {
  const context = await restaurantContext("reservations", "edit");
  const admin = createAdminClient();
  const { data: reservation, error: loadError } = await admin.from("restaurant_reservations")
    .select("id, location_id, status, reservation_source, customer_email, guest_name, party_size, starts_at, customer_confirmation_token")
    .eq("org_id", context.orgId).eq("id", reservationId).maybeSingle();
  if (loadError) throw new Error(`Could not load reservation: ${loadError.message}`);
  if (!reservation || !canUseLocation(context, reservation.location_id)) throw new Error("Reservation not found or not accessible.");
  const allowedNext: Partial<Record<typeof reservation.status, string[]>> = {
    waitlisted: ["confirmed", "cancelled"],
    confirmed: ["seated", "cancelled", "no_show"],
    seated: ["completed", "cancelled"],
  };
  if (!allowedNext[reservation.status]?.includes(status)) {
    throw new Error("This reservation cannot move to the selected status.");
  }
  const { data: updatedReservation, error } = await admin.from("restaurant_reservations")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("org_id", context.orgId).eq("id", reservationId).eq("status", reservation.status).select("id").maybeSingle();
  if (error) throw new Error(`Could not update reservation: ${error.message}`);
  if (!updatedReservation) throw new Error("This reservation was updated by someone else. Refresh and try again.");
  let emailNotification: { sent: boolean; reason?: string } | null = null;
  if (reservation.reservation_source === "online" && reservation.customer_email) {
    const [{ data: settings, error: settingsError }, { data: location, error: locationError }] = await Promise.all([
      admin.from("restaurant_online_settings").select("send_order_emails")
        .eq("org_id", context.orgId).eq("location_id", reservation.location_id).maybeSingle(),
      admin.from("business_locations").select("name")
        .eq("org_id", context.orgId).eq("id", reservation.location_id).maybeSingle(),
    ]);
    if (settingsError || locationError) {
      console.error("[restaurant-reservation-email] Could not load status email settings:", settingsError?.message ?? locationError?.message);
      emailNotification = { sent: false, reason: "Could not load email settings." };
    } else if (settings?.send_order_emails !== false && location) {
      const emailResult = await sendRestaurantReservationEmail({
        email: reservation.customer_email,
        guestName: reservation.guest_name,
        partySize: reservation.party_size,
        startsAt: reservation.starts_at,
        branchName: location.name,
        confirmationToken: reservation.customer_confirmation_token,
        status: status as RestaurantReservationEmailStatus,
      });
      emailNotification = { sent: emailResult.sent, reason: emailResult.reason };
    }
  }
  revalidatePath("/restaurant");
  return { emailNotification };
}

export async function assignRestaurantReservationTable(reservationId: string, tableId: string) {
  const context = await restaurantContext("reservations", "edit");
  if (!tableId) throw new Error("Choose a table to assign.");
  const admin = createAdminClient();
  const { data: reservation, error: loadError } = await admin.from("restaurant_reservations")
    .select("location_id").eq("org_id", context.orgId).eq("id", reservationId).maybeSingle();
  if (loadError) throw new Error(`Could not load reservation: ${loadError.message}`);
  if (!reservation || !canUseLocation(context, reservation.location_id)) throw new Error("Reservation not found or not accessible.");
  const { data, error } = await admin.rpc("assign_restaurant_reservation_table", {
    p_org_id: context.orgId,
    p_reservation_id: reservationId,
    p_table_id: tableId,
  });
  if (error) throw new Error(`Could not assign reservation table: ${error.message}`);
  revalidatePath("/restaurant");
  return data;
}

export async function createRestaurantOrder(input: {
  locationId: string;
  orderType: OrderType;
  tableId: string | null;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  notes: string;
  items: Array<{ menuItemId: string; quantity: number; notes: string; modifierOptionIds: string[] }>;
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
    if (!Array.isArray(item.modifierOptionIds) || item.modifierOptionIds.length > 100
      || item.modifierOptionIds.some((id) => typeof id !== "string")) {
      throw new Error("Invalid menu modifier selections.");
    }
    return {
      menu_item_id: item.menuItemId,
      quantity: item.quantity,
      notes: item.notes.trim(),
      modifier_option_ids: item.modifierOptionIds,
    };
  });
  const admin = createAdminClient();
  await assertRestaurantPackagedStockAvailable(admin, context.orgId, input.locationId, input.items);
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
    .select("id, location_id, status, order_type, order_number, order_source, customer_email, customer_tracking_token")
    .eq("org_id", context.orgId).eq("id", orderId).maybeSingle();
  if (loadError) throw new Error(`Could not load restaurant order: ${loadError.message}`);
  if (!order || !canUseLocation(context, order.location_id)) throw new Error("Restaurant order not found or not accessible.");
  if (order.status === "pending_payment") throw new Error("This order is waiting for online payment confirmation.");
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
  const { data: updatedOrder, error } = await admin.from("restaurant_orders")
    .update({ status: status as "confirmed" | "preparing" | "ready" | "served" | "completed" | "cancelled", updated_at: new Date().toISOString() })
    .eq("org_id", context.orgId).eq("id", orderId).eq("status", order.status).select("id").maybeSingle();
  if (error) throw new Error(`Could not update restaurant order: ${error.message}`);
  if (!updatedOrder) throw new Error("This order was updated by someone else. Refresh and try again.");
  let emailNotification: { sent: boolean; reason?: string } | null = null;
  if (order.order_source === "online" && order.customer_email) {
    const [{ data: settings, error: settingsError }, { data: location, error: locationError }] = await Promise.all([
      admin.from("restaurant_online_settings").select("send_order_emails")
        .eq("org_id", context.orgId).eq("location_id", order.location_id).maybeSingle(),
      admin.from("business_locations").select("name")
        .eq("org_id", context.orgId).eq("id", order.location_id).maybeSingle(),
    ]);
    if (settingsError || locationError) {
      console.error("[restaurant-order-email] Could not load notification settings:", settingsError?.message ?? locationError?.message);
      emailNotification = { sent: false, reason: "Could not load email settings." };
    } else if (settings?.send_order_emails !== false && location) {
      const emailResult = await sendRestaurantOrderEmail({
        email: order.customer_email,
        orderNumber: order.order_number,
        branchName: location.name,
        status: status as RestaurantEmailStatus,
        trackingToken: order.customer_tracking_token,
      });
      emailNotification = { sent: emailResult.sent, reason: emailResult.reason };
    }
  }
  revalidatePath("/restaurant");
  return { emailNotification };
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
  if (order.status === "pending_payment") throw new Error("Kitchen work cannot start until the online payment is confirmed.");
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

export async function splitRestaurantBillByItems(input: {
  orderId: string;
  bills: Array<{ name: string; items: Array<{ orderItemId: string; quantity: number }> }>;
}) {
  const context = await restaurantContext("orders", "edit");
  if (!Array.isArray(input.bills) || input.bills.length < 2 || input.bills.length > 20) {
    throw new Error("Create between 2 and 20 guest checks.");
  }
  const bills: Json[] = input.bills.map((bill) => {
    const name = requiredText(bill.name, "Guest check name", 80);
    if (!Array.isArray(bill.items) || bill.items.length > 100) {
      throw new Error("Each guest check must contain valid item assignments.");
    }
    return {
      name,
      items: bill.items.map((item) => {
        if (typeof item.orderItemId !== "string" || !validMoney(item.quantity)) {
          throw new Error("Assigned item quantities must be positive, with no more than two decimal places.");
        }
        return { order_item_id: item.orderItemId, quantity: item.quantity };
      }),
    };
  });
  const admin = createAdminClient();
  const { data: order, error: orderError } = await admin.from("restaurant_orders")
    .select("location_id, delivery_fee, status").eq("org_id", context.orgId).eq("id", input.orderId).maybeSingle();
  if (orderError) throw new Error(`Could not verify restaurant order: ${orderError.message}`);
  if (!order || !canUseLocation(context, order.location_id)) throw new Error("Restaurant order not found or not accessible.");
  if (order.status === "pending_payment") throw new Error("This order is waiting for online payment confirmation.");
  if (Number(order.delivery_fee) > 0) throw new Error("Delivery orders with a delivery fee can only be split into equal shares.");
  const { error } = await admin.rpc("split_restaurant_bill_by_items", {
    p_org_id: context.orgId,
    p_order_id: input.orderId,
    p_bills: bills,
  });
  if (error) throw new Error(`Could not split restaurant bill: ${error.message}`);
  revalidatePath("/restaurant");
}

export async function splitRestaurantBillEqually(input: { orderId: string; shareCount: number }) {
  const context = await restaurantContext("orders", "edit");
  if (!Number.isInteger(input.shareCount) || input.shareCount < 2 || input.shareCount > 20) {
    throw new Error("Choose between 2 and 20 equal shares.");
  }
  const admin = createAdminClient();
  const { data: order, error: orderError } = await admin.from("restaurant_orders")
    .select("location_id, status").eq("org_id", context.orgId).eq("id", input.orderId).maybeSingle();
  if (orderError) throw new Error(`Could not verify restaurant order: ${orderError.message}`);
  if (!order || !canUseLocation(context, order.location_id)) throw new Error("Restaurant order not found or not accessible.");
  if (order.status === "pending_payment") throw new Error("This order is waiting for online payment confirmation.");
  const { error } = await admin.rpc("split_restaurant_bill_equally", {
    p_org_id: context.orgId,
    p_order_id: input.orderId,
    p_share_count: input.shareCount,
  });
  if (error) throw new Error(`Could not split restaurant bill: ${error.message}`);
  revalidatePath("/restaurant");
}

export async function recordRestaurantPayment(input: {
  orderId: string;
  billId: string;
  amount: number;
  tipAmount: number;
  method: PaymentMethod;
}) {
  const context = await restaurantContext("orders", "create");
  if (!validMoney(input.amount, true) || !validMoney(input.tipAmount, true)
    || input.amount + input.tipAmount <= 0
    || !["cash", "card", "mobile_money", "other"].includes(input.method)) {
    throw new Error("Enter a valid payment amount, tip, and method.");
  }
  const admin = createAdminClient();
  const { data: order, error: orderError } = await admin.from("restaurant_orders")
    .select("location_id, status").eq("org_id", context.orgId).eq("id", input.orderId).maybeSingle();
  if (orderError) throw new Error(`Could not verify restaurant order: ${orderError.message}`);
  if (!order || !canUseLocation(context, order.location_id)) throw new Error("Restaurant order not found or not accessible.");
  if (order.status === "pending_payment") throw new Error("This order is waiting for online payment confirmation.");
  const { error } = await admin.rpc("record_restaurant_bill_payment", {
    p_org_id: context.orgId,
    p_order_id: input.orderId,
    p_bill_id: input.billId,
    p_amount: input.amount,
    p_tip_amount: input.tipAmount,
    p_payment_method: input.method,
    p_received_by: context.userId,
  });
  if (error) throw new Error(`Could not record restaurant payment: ${error.message}`);
  revalidatePath("/restaurant");
}

export async function refundRestaurantPayment(input: {
  orderId: string;
  paymentId: string;
  amount: number;
  tipAmount: number;
  method: PaymentMethod;
}) {
  const context = await restaurantContext("orders", "edit");
  if (!validMoney(input.amount, true) || !validMoney(input.tipAmount, true)
    || input.amount + input.tipAmount <= 0
    || !["cash", "card", "mobile_money", "other"].includes(input.method)) {
    throw new Error("Enter a valid refund amount, tip refund, and method.");
  }
  const admin = createAdminClient();
  const { data: order, error: orderError } = await admin.from("restaurant_orders")
    .select("location_id, status").eq("org_id", context.orgId).eq("id", input.orderId).maybeSingle();
  if (orderError) throw new Error(`Could not verify restaurant order: ${orderError.message}`);
  if (!order || !canUseLocation(context, order.location_id)) throw new Error("Restaurant order not found or not accessible.");
  if (order.status === "pending_payment") throw new Error("A pending online payment cannot be refunded.");
  const { data: payment, error: paymentError } = await admin.from("restaurant_order_payments")
    .select("payment_provider").eq("org_id", context.orgId).eq("order_id", input.orderId)
    .eq("id", input.paymentId).eq("payment_type", "payment").maybeSingle();
  if (paymentError) throw new Error(`Could not load original restaurant payment: ${paymentError.message}`);
  if (!payment) throw new Error("Original restaurant payment not found.");
  if (payment.payment_provider === "paystack") {
    throw new Error("Refund this Paystack transaction in the Paystack dashboard. This app does not submit provider refunds.");
  }
  const { error } = await admin.rpc("refund_restaurant_payment", {
    p_org_id: context.orgId,
    p_order_id: input.orderId,
    p_payment_id: input.paymentId,
    p_amount: input.amount,
    p_tip_amount: input.tipAmount,
    p_payment_method: input.method,
    p_received_by: context.userId,
  });
  if (error) throw new Error(`Could not refund restaurant payment: ${error.message}`);
  revalidatePath("/restaurant");
}

export async function saveRestaurantIngredient(input: {
  id?: string;
  name: string;
  unit: string;
  costPerUnit: number;
  isActive: boolean;
}) {
  const context = await restaurantContext("ingredients", input.id ? "edit" : "create");
  requireOrganizationWideAccess(context.isBranchScoped, "Restaurant ingredients");
  const name = requiredText(input.name, "Ingredient name", 120);
  const unit = requiredText(input.unit, "Ingredient unit", 20);
  if (!Number.isFinite(input.costPerUnit) || input.costPerUnit < 0
    || Math.abs(input.costPerUnit * 10000 - Math.round(input.costPerUnit * 10000)) > 0.000001
    || typeof input.isActive !== "boolean") {
    throw new Error("Enter a non-negative ingredient cost to four decimal places.");
  }
  const admin = createAdminClient();
  const payload = {
    name,
    unit,
    cost_per_unit: input.costPerUnit,
    is_active: input.isActive,
    updated_at: new Date().toISOString(),
  };
  if (input.id) {
    const { data: existing, error: loadError } = await admin.from("restaurant_ingredients")
      .select("id, unit").eq("org_id", context.orgId).eq("id", input.id).maybeSingle();
    if (loadError) throw new Error(`Could not load restaurant ingredient: ${loadError.message}`);
    if (!existing) throw new Error("Restaurant ingredient not found.");
    if (existing.unit !== unit) {
      const [
        { data: stock, error: stockError },
        { data: recipe, error: recipeError },
        { data: movements, error: movementsError },
      ] = await Promise.all([
        admin.from("restaurant_ingredient_stock").select("ingredient_id").eq("org_id", context.orgId).eq("ingredient_id", input.id).limit(1),
        admin.from("restaurant_recipe_ingredients").select("ingredient_id").eq("org_id", context.orgId).eq("ingredient_id", input.id).limit(1),
        admin.from("restaurant_ingredient_movements").select("ingredient_id").eq("org_id", context.orgId).eq("ingredient_id", input.id).limit(1),
      ]);
      const referenceError = stockError ?? recipeError ?? movementsError;
      if (referenceError) throw new Error(`Could not verify ingredient usage: ${referenceError.message}`);
      if (stock?.length || recipe?.length || movements?.length) {
        throw new Error("The stock unit cannot be changed after this ingredient has stock, recipes, or movement history. Create a new ingredient instead.");
      }
    }
  }
  const query = input.id
    ? admin.from("restaurant_ingredients").update(payload).eq("org_id", context.orgId).eq("id", input.id)
    : admin.from("restaurant_ingredients").insert({ ...payload, org_id: context.orgId });
  const { error } = await query;
  if (error) throw new Error(`Could not save restaurant ingredient: ${error.message}`);
  revalidatePath("/restaurant");
}

export async function createRestaurantIngredientPurchaseOrder(input: {
  locationId: string;
  supplierId: string;
  reference: string;
  items: Array<{ ingredientId: string; quantity: number; unitCost: number }>;
}) {
  const context = await restaurantContext("ingredients", "create");
  if (!canUseLocation(context, input.locationId)) {
    throw new Error("You cannot create a Restaurant purchase order for that branch.");
  }
  const reference = requiredText(input.reference, "Purchase reference", 80);
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 100) {
    throw new Error("A purchase order must contain between 1 and 100 ingredient lines.");
  }
  const seen = new Set<string>();
  for (const item of input.items) {
    if (typeof item.ingredientId !== "string" || seen.has(item.ingredientId)
      || !validQuantity(item.quantity) || !validMoney(item.unitCost, true)
      || Math.abs(item.unitCost * 10000 - Math.round(item.unitCost * 10000)) > 0.000001) {
      throw new Error("Check that each purchase line has a unique ingredient, valid quantity, and non-negative unit cost.");
    }
    seen.add(item.ingredientId);
  }

  const admin = createAdminClient();
  const [{ data: supplier, error: supplierError }, { data: ingredients, error: ingredientsError }] = await Promise.all([
    admin.from("suppliers").select("id").eq("org_id", context.orgId).eq("id", input.supplierId).eq("is_active", true).maybeSingle(),
    admin.from("restaurant_ingredients").select("id").eq("org_id", context.orgId).in("id", [...seen]).eq("is_active", true),
  ]);
  if (supplierError) throw new Error(`Could not verify purchase supplier: ${supplierError.message}`);
  if (ingredientsError) throw new Error(`Could not verify purchase ingredients: ${ingredientsError.message}`);
  if (!supplier) throw new Error("Choose an active supplier from this organization.");
  if (ingredients?.length !== seen.size) throw new Error("Choose active ingredients from this organization.");

  const { data: purchaseOrder, error: orderError } = await admin.from("restaurant_ingredient_purchase_orders")
    .insert({
      org_id: context.orgId,
      location_id: input.locationId,
      supplier_id: input.supplierId,
      reference,
      created_by: context.userId,
    })
    .select("id")
    .single();
  if (orderError || !purchaseOrder) {
    throw new Error(`Could not create Restaurant purchase order: ${orderError?.message ?? "No purchase order was returned."}`);
  }
  const { error: itemsError } = await admin.from("restaurant_ingredient_purchase_items").insert(
    input.items.map((item) => ({
      org_id: context.orgId,
      purchase_order_id: purchaseOrder.id,
      ingredient_id: item.ingredientId,
      ordered_quantity: item.quantity,
      unit_cost: item.unitCost,
    })),
  );
  if (itemsError) {
    const { error: rollbackError } = await admin.from("restaurant_ingredient_purchase_orders")
      .delete().eq("org_id", context.orgId).eq("id", purchaseOrder.id);
    if (rollbackError) throw new Error(`Could not save purchase lines (${itemsError.message}); cleanup failed (${rollbackError.message}).`);
    throw new Error(`Could not save Restaurant purchase lines: ${itemsError.message}`);
  }
  revalidatePath("/restaurant");
}

export async function receiveRestaurantIngredientPurchase(input: {
  purchaseOrderId: string;
  items: Array<{ itemId: string; quantity: number }>;
}) {
  const context = await restaurantContext("ingredients", "edit");
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 100) {
    throw new Error("Choose one or more valid purchase lines to receive.");
  }
  const seen = new Set<string>();
  const lines: Json[] = input.items.map((item) => {
    if (typeof item.itemId !== "string" || seen.has(item.itemId) || !validQuantity(item.quantity)) {
      throw new Error("Each received line must have a unique item and positive quantity to three decimal places.");
    }
    seen.add(item.itemId);
    return { item_id: item.itemId, quantity: item.quantity };
  });
  const admin = createAdminClient();
  const { data: purchaseOrder, error: orderError } = await admin.from("restaurant_ingredient_purchase_orders")
    .select("id, location_id").eq("org_id", context.orgId).eq("id", input.purchaseOrderId).maybeSingle();
  if (orderError) throw new Error(`Could not verify Restaurant purchase order: ${orderError.message}`);
  if (!purchaseOrder || !canUseLocation(context, purchaseOrder.location_id)) {
    throw new Error("Restaurant purchase order not found or not accessible.");
  }
  const { error } = await admin.rpc("receive_restaurant_ingredient_purchase", {
    p_org_id: context.orgId,
    p_purchase_order_id: input.purchaseOrderId,
    p_lines: lines,
    p_received_by: context.userId,
  });
  if (error) throw new Error(`Could not receive Restaurant ingredient purchase: ${error.message}`);
  revalidatePath("/restaurant");
}

export async function saveRestaurantRecipe(input: {
  menuItemId: string;
  ingredients: Array<{ ingredientId: string; quantity: number }>;
}) {
  const context = await restaurantContext("ingredients", "edit");
  requireOrganizationWideAccess(context.isBranchScoped, "Restaurant recipes");
  if (!Array.isArray(input.ingredients) || input.ingredients.length > 100) {
    throw new Error("A recipe can contain no more than 100 ingredients.");
  }
  const seen = new Set<string>();
  const ingredients: Json[] = input.ingredients.map((line) => {
    if (typeof line.ingredientId !== "string" || !validQuantity(line.quantity)) {
      throw new Error("Recipe quantities must be positive and no more than three decimal places.");
    }
    if (seen.has(line.ingredientId)) throw new Error("Each ingredient can appear only once in a recipe.");
    seen.add(line.ingredientId);
    return { ingredient_id: line.ingredientId, quantity: line.quantity };
  });
  const admin = createAdminClient();
  const { data: menuItem, error: menuError } = await admin.from("restaurant_menu_items")
    .select("id").eq("org_id", context.orgId).eq("id", input.menuItemId).maybeSingle();
  if (menuError) throw new Error(`Could not verify menu item: ${menuError.message}`);
  if (!menuItem) throw new Error("Choose a menu item from this organization.");
  const { error } = await admin.rpc("replace_restaurant_recipe", {
    p_org_id: context.orgId,
    p_menu_item_id: input.menuItemId,
    p_ingredients: ingredients,
  });
  if (error) throw new Error(`Could not save restaurant recipe: ${error.message}`);
  revalidatePath("/restaurant");
}

export async function adjustRestaurantIngredientStock(input: {
  locationId: string;
  ingredientId: string;
  quantityDelta: number;
  reason: string;
}) {
  const context = await restaurantContext("ingredients", "edit");
  if (!canUseLocation(context, input.locationId)) {
    throw new Error("You cannot adjust restaurant ingredient stock at that branch.");
  }
  if (!validQuantity(Math.abs(input.quantityDelta)) || input.quantityDelta === 0) {
    throw new Error("Enter a non-zero stock change to three decimal places.");
  }
  const reason = requiredText(input.reason, "Adjustment reason", 200);
  const admin = createAdminClient();
  const { error } = await admin.rpc("adjust_restaurant_ingredient_stock", {
    p_org_id: context.orgId,
    p_location_id: input.locationId,
    p_ingredient_id: input.ingredientId,
    p_quantity_delta: input.quantityDelta,
    p_reason: reason,
    p_created_by: context.userId,
  });
  if (error) throw new Error(`Could not adjust restaurant ingredient stock: ${error.message}`);
  revalidatePath("/restaurant");
}

export async function saveRestaurantIngredientMinimumStock(input: {
  locationId: string;
  ingredientId: string;
  minimumQuantity: number;
}) {
  const context = await restaurantContext("ingredients", "edit");
  if (!canUseLocation(context, input.locationId)) {
    throw new Error("You cannot manage restaurant ingredient stock at that branch.");
  }
  if (!validQuantity(input.minimumQuantity, true) || input.minimumQuantity > 99_999_999_999.999) {
    throw new Error("The low-stock threshold must be a non-negative quantity within the supported range, with up to three decimal places.");
  }
  const admin = createAdminClient();
  const { error } = await admin.from("restaurant_ingredient_stock").upsert({
    org_id: context.orgId,
    location_id: input.locationId,
    ingredient_id: input.ingredientId,
    minimum_quantity: input.minimumQuantity,
    updated_at: new Date().toISOString(),
  }, { onConflict: "org_id,location_id,ingredient_id" });
  if (error) throw new Error(`Could not save ingredient low-stock threshold: ${error.message}`);
  revalidatePath("/restaurant");
}
