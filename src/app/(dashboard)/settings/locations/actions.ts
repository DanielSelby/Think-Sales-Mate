"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { can } from "@/lib/rbac";

export async function createLocation(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const locationType = String(formData.get("location_type") ?? "branch").trim();
  const address = String(formData.get("address") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const region = String(formData.get("region") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const isPrimary = formData.get("is_primary") === "on";

  const context = await getCurrentOrgContext();
  if (!context) return { error: "Session expired." };
  if (!can(context.role, "locations.manage")) {
    return { error: "You don't have permission to add locations." };
  }
  if (!name) return { error: "Location name is required." };

  const supabase = createClient();

  // Only one branch can be primary — clear any existing one first so the
  // partial unique index on is_primary never trips.
  if (isPrimary) {
    await supabase.from("business_locations").update({ is_primary: false }).eq("org_id", context.orgId);
  }

  const { error } = await supabase.from("business_locations").insert({
    org_id: context.orgId,
    name,
    location_type: locationType as "warehouse" | "branch" | "store" | "distribution_center" | "mobile_van",
    address: address || null,
    city: city || null,
    region: region || null,
    country: country || null,
    phone: phone || null,
    is_primary: isPrimary,
    created_by: context.userId
  });

  if (error) return { error: error.message };

  revalidatePath("/settings/locations");
  return { success: true };
}

export async function updateLocation(
  locationId: string,
  fields: {
    name?: string;
    address?: string | null;
    city?: string | null;
    region?: string | null;
    country?: string | null;
    phone?: string | null;
    is_active?: boolean;
  }
) {
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "locations.manage")) {
    return { error: "You don't have permission to edit locations." };
  }

  const supabase = createClient();
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

  const supabase = createClient();

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

  const supabase = createClient();
  const { error } = await supabase
    .from("business_locations")
    .delete()
    .eq("id", locationId)
    .eq("org_id", context.orgId);

  if (error) return { error: error.message };

  revalidatePath("/settings/locations");
  return { success: true };
}