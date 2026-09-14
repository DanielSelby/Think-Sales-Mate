"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { can } from "@/lib/rbac";

function redirectWithError(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function parseAssetForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const purchaseDate = String(formData.get("purchase_date") ?? "").trim();
  const purchaseCost = Number(formData.get("purchase_cost"));
  const currentValue = Number(formData.get("current_value"));
  const status = String(formData.get("status") ?? "in_use").trim() as "in_use" | "under_repair" | "disposed";
  const location = String(formData.get("location") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  return {
    name,
    category: category || null,
    purchase_date: purchaseDate || new Date().toISOString().slice(0, 10),
    purchase_cost: purchaseCost,
    current_value: currentValue,
    status,
    location: location || null,
    notes: notes || null
  };
}

export async function createAsset(formData: FormData): Promise<void> {
  const context = await getCurrentOrgContext();
  if (!context) redirectWithError("/assets/new", "Your session expired — please sign in again.");
  if (!can(context.role, "assets.manage")) {
    redirectWithError("/assets/new", "You don't have permission to add assets.");
  }

  const fields = parseAssetForm(formData);
  if (!fields.name) redirectWithError("/assets/new", "Name is required.");
  if (Number.isNaN(fields.purchase_cost) || fields.purchase_cost < 0) {
    redirectWithError("/assets/new", "Enter a valid purchase cost.");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("assets").insert({
    org_id: context.orgId,
    created_by: context.userId,
    ...fields
  });

  if (error) redirectWithError("/assets/new", error.message);

  revalidatePath("/assets");
  redirect("/assets");
}

export async function importAssets(records: Array<{
  name: string;
  category?: string | null;
  purchase_date?: string | null;
  purchase_cost?: number;
  current_value?: number;
  status?: "in_use" | "under_repair" | "disposed";
  location?: string | null;
}>): Promise<{ success?: boolean; error?: string; count?: number }> {
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "assets.manage")) return { error: "You don't have permission to import assets." };
  const valid = records.filter((record) => record.name.trim()).map((record) => ({
    org_id: context.orgId,
    created_by: context.userId,
    name: record.name.trim(),
    category: record.category?.trim() || null,
    purchase_date: record.purchase_date || new Date().toISOString().slice(0, 10),
    purchase_cost: Number(record.purchase_cost ?? 0),
    current_value: Number(record.current_value ?? record.purchase_cost ?? 0),
    status: record.status ?? "in_use",
    location: record.location?.trim() || null,
  }));
  if (!valid.length || valid.some((record) => !Number.isFinite(record.purchase_cost) || record.purchase_cost < 0 || !Number.isFinite(record.current_value) || record.current_value < 0)) {
    return { error: "The CSV must contain valid asset names and non-negative values." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("assets").insert(valid);
  if (error) return { error: error.message };
  revalidatePath("/assets");
  return { success: true, count: valid.length };
}

export async function updateAsset(assetId: string, formData: FormData): Promise<void> {
  const context = await getCurrentOrgContext();
  if (!context) redirectWithError(`/assets/${assetId}/edit`, "Your session expired — please sign in again.");
  if (!can(context.role, "assets.manage")) {
    redirectWithError(`/assets/${assetId}/edit`, "You don't have permission to edit assets.");
  }

  const fields = parseAssetForm(formData);
  if (!fields.name) redirectWithError(`/assets/${assetId}/edit`, "Name is required.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("assets")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", assetId)
    .eq("org_id", context.orgId);

  if (error) redirectWithError(`/assets/${assetId}/edit`, error.message);

  revalidatePath("/assets");
  redirect("/assets");
}

export async function deleteAsset(assetId: string) {
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "assets.manage")) {
    return { error: "You don't have permission to remove assets." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("assets").delete().eq("id", assetId).eq("org_id", context.orgId);
  if (error) return { error: error.message };

  revalidatePath("/assets");
  return { success: true };
}