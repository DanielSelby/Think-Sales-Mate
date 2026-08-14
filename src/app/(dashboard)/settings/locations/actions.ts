"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { can } from "@/lib/rbac";
import type { LocationType } from "@/types/database";

export async function createLocation(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const locationType = String(formData.get("location_type") ?? "branch").trim() as LocationType;
  const managerName = String(formData.get("manager_name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const region = String(formData.get("region") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const isPrimary = formData.get("is_primary") === "on";

  const context = await getCurrentOrgContext();
  if (!context) return { error: "Session expired." };
  if (!can(context.role, "locations.manage")) {
    return { error: "You don't have permission to add locations." };
  }
  if (!name) return { error: "Location name is required." };

  const supabase = await createClient();

  if (isPrimary) {
    await supabase.from("business_locations").update({ is_primary: false }).eq("org_id", context.orgId);
  }

  const { error } = await supabase.from("business_locations").insert({
    org_id: context.orgId,
    name,
    code: code || null,
    location_type: locationType,
    manager_name: managerName || null,
    address: address || null,
    city: city || null,
    region: region || null,
    country: country || null,
    phone: phone || null,
    email: email || null,
    is_primary: isPrimary,
    created_by: context.userId
  });

  if (error) {
    return { error: error.code === "23505" ? `Location code "${code}" is already in use.` : error.message };
  }

  revalidatePath("/settings/locations");
  return { success: true };
}

export async function updateLocation(
  locationId: string,
  fields: {
    name?: string;
    code?: string | null;
    location_type?: LocationType;
    manager_name?: string | null;
    address?: string | null;
    city?: string | null;
    region?: string | null;
    country?: string | null;
    phone?: string | null;
    email?: string | null;
    is_active?: boolean;
  }
) {
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "locations.manage")) {
    return { error: "You don't have permission to edit locations." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("business_locations")
    .update(fields)
    .eq("id", locationId)
    .eq("org_id", context.orgId);

  if (error) return { error: error.message };

  revalidatePath("/settings/locations");
  return { success: true };
}

export async function setPrimaryLocation(locationId: string) {
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "locations.manage")) {
    return { error: "You don't have permission to change the primary location." };
  }

  const supabase = await createClient();
  await supabase.from("business_locations").update({ is_primary: false }).eq("org_id", context.orgId);
  const { error } = await supabase
    .from("business_locations")
    .update({ is_primary: true })
    .eq("id", locationId)
    .eq("org_id", context.orgId);

  if (error) return { error: error.message };

  revalidatePath("/settings/locations");
  return { success: true };
}

export async function deleteLocation(locationId: string) {
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "locations.manage")) {
    return { error: "You don't have permission to remove locations." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("business_locations")
    .delete()
    .eq("id", locationId)
    .eq("org_id", context.orgId);

  if (error) {
    return {
      error:
        error.code === "23503"
          ? "This location has products, stock, or transactions linked to it and can't be deleted — deactivate it instead."
          : error.message
    };
  }

  revalidatePath("/settings/locations");
  return { success: true };
}

export interface LocationStats {
  stockQuantity: number;
  inventoryValue: number;
}

export async function getLocationStats(locationId: string): Promise<LocationStats> {
  const context = await getCurrentOrgContext();
  if (!context) return { stockQuantity: 0, inventoryValue: 0 };

  const supabase = await createClient();
  const { data } = await supabase
    .from("product_stock_levels")
    .select("quantity, products(unit_price)")
    .eq("org_id", context.orgId)
    .eq("location_id", locationId);

  let stockQuantity = 0;
  let inventoryValue = 0;
  for (const row of data ?? []) {
    const product = Array.isArray(row.products) ? row.products[0] : row.products;
    stockQuantity += row.quantity;
    inventoryValue += row.quantity * (product?.unit_price ?? 0);
  }
  return { stockQuantity, inventoryValue };
}