"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { can } from "@/lib/rbac";

function redirectWithError(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function parseProductForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const sku = String(formData.get("sku") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const brand = String(formData.get("brand") ?? "").trim();
  const supplier = String(formData.get("supplier") ?? "").trim();
  const barcode = String(formData.get("barcode") ?? "").trim();
  const locationId = String(formData.get("location_id") ?? "").trim();
  const unitPrice = Number(formData.get("unit_price"));
  const costPriceRaw = String(formData.get("cost_price") ?? "").trim();
  const stockQuantity = Number(formData.get("stock_quantity"));
  const lowStockThreshold = Number(formData.get("low_stock_threshold"));

  return {
    name,
    sku,
    description: description || null,
    category: category || null,
    brand: brand || null,
    supplier: supplier || null,
    barcode: barcode || null,
    location_id: locationId || null,
    unit_price: unitPrice,
    cost_price: costPriceRaw ? Number(costPriceRaw) : null,
    stock_quantity: stockQuantity,
    low_stock_threshold: lowStockThreshold
  };
}

export async function createProduct(formData: FormData): Promise<void> {
  const context = await getCurrentOrgContext();
  if (!context) redirectWithError("/inventory/new", "Your session expired — please sign in again.");
  if (!can(context.role, "inventory.manage")) {
    redirectWithError("/inventory/new", "You don't have permission to add products.");
  }

  const fields = parseProductForm(formData);
  if (!fields.name || !fields.sku) {
    redirectWithError("/inventory/new", "Name and SKU are required.");
  }
  if (Number.isNaN(fields.unit_price) || fields.unit_price < 0) {
    redirectWithError("/inventory/new", "Enter a valid selling price.");
  }

  const supabase = createClient();
  const { error } = await supabase.from("products").insert({
    org_id: context.orgId,
    ...fields
  });

  if (error) {
    const message = error.code === "23505" ? `SKU "${fields.sku}" is already in use.` : error.message;
    redirectWithError("/inventory/new", message);
  }

  revalidatePath("/inventory");
  redirect("/inventory");
}

export async function updateProduct(productId: string, formData: FormData): Promise<void> {
  const context = await getCurrentOrgContext();
  if (!context) redirectWithError(`/inventory/${productId}/edit`, "Your session expired — please sign in again.");
  if (!can(context.role, "inventory.manage")) {
    redirectWithError(`/inventory/${productId}/edit`, "You don't have permission to edit products.");
  }

  const fields = parseProductForm(formData);
  if (!fields.name || !fields.sku) {
    redirectWithError(`/inventory/${productId}/edit`, "Name and SKU are required.");
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("products")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", productId)
    .eq("org_id", context.orgId);

  if (error) {
    const message = error.code === "23505" ? `SKU "${fields.sku}" is already in use.` : error.message;
    redirectWithError(`/inventory/${productId}/edit`, message);
  }

  revalidatePath("/inventory");
  redirect("/inventory");
}

export async function deleteProduct(productId: string) {
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "inventory.manage")) {
    return { error: "You don't have permission to remove products." };
  }

  const supabase = createClient();
  const { error } = await supabase.from("products").delete().eq("id", productId).eq("org_id", context.orgId);
  if (error) return { error: error.message };

  revalidatePath("/inventory");
  return { success: true };
}

export async function toggleProductActive(productId: string, isActive: boolean) {
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "inventory.manage")) {
    return { error: "You don't have permission to update products." };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("products")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", productId)
    .eq("org_id", context.orgId);

  if (error) return { error: error.message };

  revalidatePath("/inventory");
  return { success: true };
}

export async function duplicateProduct(productId: string) {
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "inventory.manage")) {
    return { error: "You don't have permission to add products." };
  }

  const supabase = createClient();
  const { data: original, error: fetchError } = await supabase
    .from("products")
    .select("*")
    .eq("id", productId)
    .eq("org_id", context.orgId)
    .single();

  if (fetchError || !original) {
    return { error: fetchError?.message ?? "Could not find that product." };
  }

  // Find a free "Copy" SKU rather than colliding with the unique constraint.
  let newSku = `${original.sku}-COPY`;
  for (let attempt = 2; attempt <= 20; attempt++) {
    const { data: existing } = await supabase
      .from("products")
      .select("id")
      .eq("org_id", context.orgId)
      .eq("sku", newSku)
      .maybeSingle();
    if (!existing) break;
    newSku = `${original.sku}-COPY${attempt}`;
  }

  const { error: insertError } = await supabase.from("products").insert({
    org_id: context.orgId,
    sku: newSku,
    name: `${original.name} (Copy)`,
    description: original.description,
    category: original.category,
    brand: original.brand,
    supplier: original.supplier,
    barcode: null,
    location_id: original.location_id,
    unit_price: original.unit_price,
    cost_price: original.cost_price,
    stock_quantity: 0,
    low_stock_threshold: original.low_stock_threshold,
    is_active: original.is_active
  });

  if (insertError) return { error: insertError.message };

  revalidatePath("/inventory");
  return { success: true };
}

export interface BulkImportRow {
  name: string;
  sku: string;
  unitPrice: number;
  costPrice?: number;
  stockQuantity?: number;
  category?: string;
  brand?: string;
  supplier?: string;
  barcode?: string;
}

export interface BulkImportResult {
  imported: number;
  skipped: { row: number; reason: string }[];
}

export async function bulkImportProducts(rows: BulkImportRow[]): Promise<BulkImportResult> {
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "inventory.manage")) {
    return { imported: 0, skipped: rows.map((_, i) => ({ row: i + 1, reason: "Not permitted" })) };
  }

  const supabase = createClient();
  const skipped: { row: number; reason: string }[] = [];
  let imported = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.name || !row.sku || Number.isNaN(row.unitPrice)) {
      skipped.push({ row: i + 1, reason: "Missing name, SKU, or a valid price" });
      continue;
    }

    const { error } = await supabase.from("products").insert({
      org_id: context.orgId,
      name: row.name,
      sku: row.sku,
      unit_price: row.unitPrice,
      cost_price: row.costPrice ?? null,
      stock_quantity: row.stockQuantity ?? 0,
      category: row.category || null,
      brand: row.brand || null,
      supplier: row.supplier || null,
      barcode: row.barcode || null
    });

    if (error) {
      skipped.push({ row: i + 1, reason: error.code === "23505" ? `SKU "${row.sku}" already exists` : error.message });
    } else {
      imported++;
    }
  }

  revalidatePath("/inventory");
  return { imported, skipped };
}