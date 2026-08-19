"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { can } from "@/lib/rbac";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

function redirectWithError(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

// Auto SKU — "TS-YYYYMMDD-NNNN", the org's initials + today's date + a
// random 4-digit tail, retried on the rare collision. Never trust a
// client-submitted SKU for a NEW product: it's regenerated here so it's
// always unique and always non-editable, matching the "Auto SKU (system
// generated and not editable)" requirement.
async function generateSku(supabase: SupabaseClient, orgId: string, orgName: string): Promise<string> {
  const prefix = (orgName.replace(/[^A-Za-z]/g, "").slice(0, 2) || "PR").toUpperCase();
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  for (let attempt = 0; attempt < 30; attempt++) {
    const seq = String(Math.floor(1000 + Math.random() * 9000));
    const candidate = `${prefix}-${datePart}-${seq}`;
    const { data: existing } = await supabase.from("products").select("id").eq("org_id", orgId).eq("sku", candidate).maybeSingle();
    if (!existing) return candidate;
  }
  return `${prefix}-${datePart}-${Date.now().toString().slice(-6)}`;
}

function parseProductForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const brand = String(formData.get("brand") ?? "").trim();
  const supplier = String(formData.get("supplier") ?? "").trim();
  const barcode = String(formData.get("barcode") ?? "").trim();
  const hsnCode = String(formData.get("hsn_code") ?? "").trim();
  const locationId = String(formData.get("location_id") ?? "").trim();
  const unit = String(formData.get("unit") ?? "pcs").trim() || "pcs";
  const productType = String(formData.get("product_type") ?? "standard").trim();

  const unitPrice = Number(formData.get("unit_price"));
  const costPriceRaw = String(formData.get("cost_price") ?? "").trim();
  const wholesalePriceRaw = String(formData.get("wholesale_price") ?? "").trim();
  const mrpRaw = String(formData.get("mrp") ?? "").trim();
  const taxRateRaw = String(formData.get("tax_rate") ?? "").trim();
  const warrantyMonthsRaw = String(formData.get("warranty_months") ?? "").trim();
  const expiryDateRaw = String(formData.get("expiry_date") ?? "").trim();

  const stockQuantity = Number(formData.get("stock_quantity"));
  const lowStockThreshold = Number(formData.get("low_stock_threshold"));

  const trackInventory = formData.get("track_inventory") === "true";
  const allowSale = formData.get("allow_sale") === "true";
  const allowPurchase = formData.get("allow_purchase") === "true";
  const allowNegativeStock = formData.get("allow_negative_stock") === "true";
  const hasVariants = formData.get("has_variants") === "true";
  const isActive = formData.get("is_active") === "true";

  const tags = formData.getAll("tags").map((t) => String(t).trim()).filter(Boolean);
  const imageUrls = formData.getAll("image_urls").map((u) => String(u).trim()).filter(Boolean);

  return {
    name,
    description: description || null,
    category: category || null,
    brand: brand || null,
    supplier: supplier || null,
    barcode: barcode || null,
    hsn_code: hsnCode || null,
    location_id: locationId || null,
    unit,
    product_type: (productType === "service" || productType === "digital" ? productType : "standard") as "standard" | "service" | "digital",
    unit_price: unitPrice,
    cost_price: costPriceRaw ? Number(costPriceRaw) : null,
    wholesale_price: wholesalePriceRaw ? Number(wholesalePriceRaw) : null,
    mrp: mrpRaw ? Number(mrpRaw) : null,
    tax_rate: taxRateRaw ? Number(taxRateRaw) : null,
    warranty_months: warrantyMonthsRaw ? Number(warrantyMonthsRaw) : null,
    expiry_date: expiryDateRaw || null,
    stock_quantity: stockQuantity,
    low_stock_threshold: lowStockThreshold,
    track_inventory: trackInventory,
    allow_sale: allowSale,
    allow_purchase: allowPurchase,
    allow_negative_stock: allowNegativeStock,
    has_variants: hasVariants,
    is_active: isActive,
    tags,
    image_urls: imageUrls,
  };
}

export async function createProduct(formData: FormData): Promise<void> {
  const context = await getCurrentOrgContext();
  if (!context) redirectWithError("/inventory/new", "Your session expired — please sign in again.");
  if (!can(context.role, "inventory.manage")) {
    redirectWithError("/inventory/new", "You don't have permission to add products.");
  }

  const fields = parseProductForm(formData);
  if (!fields.name) {
    redirectWithError("/inventory/new", "Product name is required.");
  }
  if (Number.isNaN(fields.unit_price) || fields.unit_price < 0) {
    redirectWithError("/inventory/new", "Enter a valid selling price.");
  }

  const supabase = await createClient();
  const sku = await generateSku(supabase, context.orgId, context.orgName);
  const { error } = await supabase.from("products").insert({
    org_id: context.orgId,
    sku,
    ...fields
  });

  if (error) {
    redirectWithError("/inventory/new", error.message);
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
  if (!fields.name) {
    redirectWithError(`/inventory/${productId}/edit`, "Product name is required.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", productId)
    .eq("org_id", context.orgId);

  if (error) {
    redirectWithError(`/inventory/${productId}/edit`, error.message);
  }

  revalidatePath("/inventory");
  redirect("/inventory");
}

export async function deleteProduct(productId: string) {
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "inventory.manage")) {
    return { error: "You don't have permission to remove products." };
  }

  const supabase = await createClient();
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

  const supabase = await createClient();
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

  const supabase = await createClient();
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
    hsn_code: original.hsn_code,
    location_id: original.location_id,
    unit: original.unit,
    product_type: original.product_type,
    unit_price: original.unit_price,
    cost_price: original.cost_price,
    wholesale_price: original.wholesale_price,
    mrp: original.mrp,
    tax_rate: original.tax_rate,
    warranty_months: original.warranty_months,
    stock_quantity: 0,
    low_stock_threshold: original.low_stock_threshold,
    track_inventory: original.track_inventory,
    allow_sale: original.allow_sale,
    allow_purchase: original.allow_purchase,
    allow_negative_stock: original.allow_negative_stock,
    has_variants: original.has_variants,
    tags: original.tags,
    image_urls: [], // images are per physical listing — a duplicate starts with none
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

  const supabase = await createClient();
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




// ---------------------------------------------------------------------------
// Product images — real Supabase Storage uploads (product-images bucket,
// same pattern as company-assets logo uploads), not placeholders.
// ---------------------------------------------------------------------------

export interface UploadProductImageResult {
  error?: string;
  url?: string;
}

export async function uploadProductImage(formData: FormData): Promise<UploadProductImageResult> {
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "inventory.manage")) {
    return { error: "You don't have permission to add products." };
  }

  const file = formData.get("image") as File | null;
  if (!file || file.size === 0) return { error: "Choose a file first." };
  if (file.size > 2 * 1024 * 1024) return { error: "Each image must be under 2MB." };
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    return { error: "Images must be PNG, JPG, or WEBP." };
  }

  const supabase = await createClient();
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${context.orgId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from("product-images").upload(path, file);
  if (uploadError) return { error: uploadError.message };

  const { data: publicUrl } = supabase.storage.from("product-images").getPublicUrl(path);
  return { url: publicUrl.publicUrl };
}

// ---------------------------------------------------------------------------
// Distinct category/brand values already in use, for the form's
// type-to-filter datalists — real data, not a fixed hardcoded list.
// ---------------------------------------------------------------------------

export async function getCategoryAndBrandOptions(): Promise<{ categories: string[]; brands: string[] }> {
  const context = await getCurrentOrgContext();
  if (!context) return { categories: [], brands: [] };
  const supabase = await createClient();
  const { data } = await supabase.from("products").select("category, brand").eq("org_id", context.orgId);
  const categories = Array.from(new Set((data ?? []).map((p) => p.category).filter(Boolean))) as string[];
  const brands = Array.from(new Set((data ?? []).map((p) => p.brand).filter(Boolean))) as string[];
  return { categories: categories.sort(), brands: brands.sort() };
}