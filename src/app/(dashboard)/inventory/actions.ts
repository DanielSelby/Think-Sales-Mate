"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { can } from "@/lib/rbac";
import { findProductDuplicates, getDuplicateSettings } from "@/app/(dashboard)/inventory/duplicate-actions";

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
  const duplicateOverride = formData.get("duplicate_override") === "true";
  const [duplicateSettings, duplicateMatches] = await Promise.all([
    getDuplicateSettings(),
    findProductDuplicates(fields.name, fields.barcode),
  ]);
  const exactMatch = duplicateMatches.matches.some((match) => match.exact);
  const similarMatch = duplicateMatches.matches.some((match) => match.score >= duplicateSettings.similarityThreshold);
  const shouldBlock = duplicateSettings.controlMode === "block_exact"
    ? exactMatch
    : duplicateSettings.controlMode === "block_exact_similar" && (exactMatch || similarMatch);
  const barcodeBlocked = Boolean(duplicateMatches.barcodeMatch) && duplicateSettings.barcodeValidation === "block";
  if (!duplicateOverride && (shouldBlock || barcodeBlocked)) {
    redirectWithError("/inventory/new", barcodeBlocked ? "This barcode already belongs to an existing product." : "A duplicate or highly similar product already exists. Review it before continuing.");
  }
  const sku = await generateSku(supabase, context.orgId, context.orgName);

  // Resolve target location (user selected location, or org primary location)
  let targetLocationId = fields.location_id;
  if (!targetLocationId) {
    const { data: primaryLoc } = await supabase
      .from("business_locations")
      .select("id")
      .eq("org_id", context.orgId)
      .eq("is_primary", true)
      .maybeSingle();
    targetLocationId = primaryLoc?.id ?? null;
  }

  const { data: createdProduct, error } = await supabase
    .from("products")
    .insert({
      org_id: context.orgId,
      sku,
      ...fields,
      location_id: targetLocationId ?? fields.location_id,
    })
    .select("id, stock_quantity")
    .single();

  if (error || !createdProduct) {
    redirectWithError("/inventory/new", error?.message ?? "Failed to save product.");
  }

  // Seed product_stock_levels so location-aware inventory and transfers recognize the initial stock
  if (createdProduct.stock_quantity > 0 && targetLocationId) {
    await supabase.from("product_stock_levels").upsert(
      {
        org_id: context.orgId,
        product_id: createdProduct.id,
        location_id: targetLocationId,
        quantity: createdProduct.stock_quantity,
      },
      { onConflict: "product_id,location_id" }
    );
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
  const { data: primaryLoc } = await supabase
    .from("business_locations")
    .select("id")
    .eq("org_id", context.orgId)
    .eq("is_primary", true)
    .maybeSingle();
  const primaryLocationId = primaryLoc?.id;

  const skipped: { row: number; reason: string }[] = [];
  let imported = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.name || !row.sku || Number.isNaN(row.unitPrice)) {
      skipped.push({ row: i + 1, reason: "Missing name, SKU, or a valid price" });
      continue;
    }

    const { data: createdProd, error } = await supabase
      .from("products")
      .insert({
        org_id: context.orgId,
        name: row.name,
        sku: row.sku,
        unit_price: row.unitPrice,
        cost_price: row.costPrice ?? null,
        stock_quantity: row.stockQuantity ?? 0,
        location_id: primaryLocationId ?? null,
        category: row.category || null,
        brand: row.brand || null,
        supplier: row.supplier || null,
        barcode: row.barcode || null,
      })
      .select("id, stock_quantity")
      .single();

    if (error || !createdProd) {
      skipped.push({ row: i + 1, reason: error?.code === "23505" ? `SKU "${row.sku}" already exists` : error?.message ?? "Error" });
    } else {
      imported++;
      if (createdProd.stock_quantity > 0 && primaryLocationId) {
        await supabase.from("product_stock_levels").upsert(
          {
            org_id: context.orgId,
            product_id: createdProd.id,
            location_id: primaryLocationId,
            quantity: createdProd.stock_quantity,
          },
          { onConflict: "product_id,location_id" }
        );
      }
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

// ---------------------------------------------------------------------------
// Product Location Management (Add to Locations & Remove from Location)
// ---------------------------------------------------------------------------

export interface BulkAddLocationResult {
  ok: boolean;
  error?: string;
  locationName?: string;
  importedCount: number;
  skippedCount: number;
  skippedProducts: { id: string; name: string; sku: string; reason: string }[];
  importedProducts: { id: string; name: string; sku: string }[];
}

export async function bulkAddProductsToLocation(
  productIds: string[],
  locationId: string
): Promise<BulkAddLocationResult> {
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "inventory.manage")) {
    return { ok: false, error: "You don't have permission to manage product locations.", importedCount: 0, skippedCount: 0, skippedProducts: [], importedProducts: [] };
  }

  if (!productIds || productIds.length === 0) {
    return { ok: false, error: "No products selected.", importedCount: 0, skippedCount: 0, skippedProducts: [], importedProducts: [] };
  }

  if (!locationId) {
    return { ok: false, error: "Please select a target location.", importedCount: 0, skippedCount: 0, skippedProducts: [], importedProducts: [] };
  }

  const supabase = await createClient();

  // 1. Fetch location details
  const { data: location, error: locError } = await supabase
    .from("business_locations")
    .select("id, name")
    .eq("id", locationId)
    .eq("org_id", context.orgId)
    .single();

  if (locError || !location) {
    return { ok: false, error: "Target location not found.", importedCount: 0, skippedCount: 0, skippedProducts: [], importedProducts: [] };
  }

  // 2. Fetch selected products
  const { data: selectedProducts, error: prodError } = await supabase
    .from("products")
    .select("id, name, sku, stock_quantity, location_id")
    .in("id", productIds)
    .eq("org_id", context.orgId);

  if (prodError || !selectedProducts || selectedProducts.length === 0) {
    return { ok: false, error: "Selected products could not be retrieved.", importedCount: 0, skippedCount: 0, skippedProducts: [], importedProducts: [] };
  }

  // 3. Find existing stock levels at target location to check for duplicate SKUs
  const { data: existingStockLevels } = await supabase
    .from("product_stock_levels")
    .select("product_id, products(sku)")
    .eq("location_id", locationId)
    .eq("org_id", context.orgId);

  const existingProductIds = new Set((existingStockLevels ?? []).map((s) => s.product_id));
  const existingSkus = new Set(
    (existingStockLevels ?? []).map((s) => {
      const prod = Array.isArray(s.products) ? s.products[0] : s.products;
      return prod?.sku;
    }).filter(Boolean)
  );

  const importedProducts: { id: string; name: string; sku: string }[] = [];
  const skippedProducts: { id: string; name: string; sku: string; reason: string }[] = [];

  for (const prod of selectedProducts) {
    const isAlreadyAtLocation = existingProductIds.has(prod.id) || existingSkus.has(prod.sku) || prod.location_id === locationId;

    if (isAlreadyAtLocation) {
      skippedProducts.push({
        id: prod.id,
        name: prod.name,
        sku: prod.sku,
        reason: `SKU already exists in ${location.name}`,
      });
    } else {
      // Create location record in product_stock_levels with 0 units
      const { error: insertError } = await supabase.from("product_stock_levels").insert({
        org_id: context.orgId,
        product_id: prod.id,
        location_id: locationId,
        quantity: 0,
      });

      if (!insertError) {
        importedProducts.push({
          id: prod.id,
          name: prod.name,
          sku: prod.sku,
        });
        existingProductIds.add(prod.id);
        existingSkus.add(prod.sku);

        // If product didn't have any location_id set, assign this as primary
        if (!prod.location_id) {
          await supabase.from("products").update({ location_id: locationId }).eq("id", prod.id);
        }
      } else {
        skippedProducts.push({
          id: prod.id,
          name: prod.name,
          sku: prod.sku,
          reason: insertError.message || "Failed to add to location",
        });
      }
    }
  }

  // Log in audit_logs
  try {
    await supabase.from("audit_logs").insert({
      org_id: context.orgId,
      actor_id: context.userId,
      action: "products.bulk_add_to_location",
      entity_type: "business_locations",
      entity_id: locationId,
      metadata: {
        location_id: locationId,
        location_name: location.name,
        imported_count: importedProducts.length,
        skipped_count: skippedProducts.length,
        imported_skus: importedProducts.map((p) => p.sku),
      },
    });
  } catch (err) {
    console.error("Audit log error on bulk add:", err);
  }

  revalidatePath("/inventory");
  return {
    ok: true,
    locationName: location.name,
    importedCount: importedProducts.length,
    skippedCount: skippedProducts.length,
    importedProducts,
    skippedProducts,
  };
}

export interface ProductValidationResult {
  id: string;
  name: string;
  sku: string;
  blocked: boolean;
  reason?: string;
}

export interface ValidationRemoveResult {
  ok: boolean;
  error?: string;
  locationName?: string;
  products: ProductValidationResult[];
  removableCount: number;
  blockedCount: number;
}

export async function validateRemoveProductsFromLocation(
  productIds: string[],
  locationId: string
): Promise<ValidationRemoveResult> {
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "inventory.manage")) {
    return { ok: false, error: "You don't have permission to manage product locations.", products: [], removableCount: 0, blockedCount: 0 };
  }

  if (!productIds || productIds.length === 0 || !locationId) {
    return { ok: false, error: "Products and target location are required.", products: [], removableCount: 0, blockedCount: 0 };
  }

  const supabase = await createClient();

  const { data: location } = await supabase
    .from("business_locations")
    .select("id, name")
    .eq("id", locationId)
    .eq("org_id", context.orgId)
    .single();

  const { data: selectedProducts } = await supabase
    .from("products")
    .select("id, name, sku, location_id")
    .in("id", productIds)
    .eq("org_id", context.orgId);

  if (!selectedProducts || selectedProducts.length === 0) {
    return { ok: false, error: "No matching products found.", products: [], removableCount: 0, blockedCount: 0 };
  }

  // Check stock levels at this location
  const { data: stockLevels } = await supabase
    .from("product_stock_levels")
    .select("product_id, quantity")
    .in("product_id", productIds)
    .eq("location_id", locationId)
    .eq("org_id", context.orgId);

  const stockMap = new Map((stockLevels ?? []).map((s) => [s.product_id, s.quantity]));

  // A product with any historical reference cannot be removed. Checking the
  // item tables directly avoids relying on optional location relationships and
  // prevents a product with history at another location from being detached.
  const [
    saleRows,
    purchaseRows,
    transferRows,
    adjustmentRows,
    saleReturnRows,
    purchaseReturnRows,
    stockRequestRows,
    customerOrderRows,
    auditRows,
  ] = await Promise.all([
    supabase.from("sale_items").select("product_id").in("product_id", productIds).eq("org_id", context.orgId),
    supabase.from("purchase_items").select("product_id").in("product_id", productIds).eq("org_id", context.orgId),
    supabase.from("stock_transfer_items").select("product_id").in("product_id", productIds).eq("org_id", context.orgId),
    supabase.from("stock_adjustment_items").select("product_id").in("product_id", productIds).eq("org_id", context.orgId),
    supabase.from("sale_return_items").select("product_id").in("product_id", productIds).eq("org_id", context.orgId),
    supabase.from("purchase_return_items").select("product_id").in("product_id", productIds).eq("org_id", context.orgId),
    supabase.from("stock_request_items").select("product_id").in("product_id", productIds).eq("org_id", context.orgId),
    supabase.from("customer_order_items").select("product_id").in("product_id", productIds).eq("org_id", context.orgId),
    supabase.from("audit_logs").select("entity_id").in("entity_id", productIds).eq("org_id", context.orgId),
  ]);

  const historyError = [
    saleRows,
    purchaseRows,
    transferRows,
    adjustmentRows,
    saleReturnRows,
    purchaseReturnRows,
    stockRequestRows,
    customerOrderRows,
    auditRows,
  ].find((result) => result.error);
  if (historyError) {
    const historyMessage = historyError.error?.message ?? "unknown database error";
    return {
      ok: false,
      error: `Could not validate product history: ${historyMessage}`,
      products: [],
      removableCount: 0,
      blockedCount: 0,
    };
  }

  const salesProductIds = new Set((saleRows.data ?? []).map((r) => r.product_id));
  const purchaseProductIds = new Set((purchaseRows.data ?? []).map((r) => r.product_id));
  const transferProductIds = new Set((transferRows.data ?? []).map((r) => r.product_id));
  const adjustmentProductIds = new Set((adjustmentRows.data ?? []).map((r) => r.product_id));
  const saleReturnProductIds = new Set((saleReturnRows.data ?? []).map((r) => r.product_id));
  const purchaseReturnProductIds = new Set((purchaseReturnRows.data ?? []).map((r) => r.product_id));
  const stockRequestProductIds = new Set((stockRequestRows.data ?? []).map((r) => r.product_id));
  const customerOrderProductIds = new Set((customerOrderRows.data ?? []).map((r) => r.product_id));
  const auditProductIds = new Set((auditRows.data ?? []).map((r) => r.entity_id).filter((id): id is string => id !== null));

  const validationList: ProductValidationResult[] = [];

  for (const prod of selectedProducts) {
    const currentStock = stockMap.get(prod.id) ?? 0;
    let blocked = false;
    let reason = "";

    if (currentStock > 0) {
      blocked = true;
      reason = `Has stock on hand (${currentStock} units)`;
    } else if (salesProductIds.has(prod.id)) {
      blocked = true;
      reason = "Has sales history";
    } else if (purchaseProductIds.has(prod.id)) {
      blocked = true;
      reason = "Has purchase history";
    } else if (transferProductIds.has(prod.id)) {
      blocked = true;
      reason = "Has stock movements";
    } else if (adjustmentProductIds.has(prod.id)) {
      blocked = true;
      reason = "Has stock adjustments";
    } else if (saleReturnProductIds.has(prod.id)) {
      blocked = true;
      reason = "Has return history";
    } else if (purchaseReturnProductIds.has(prod.id)) {
      blocked = true;
      reason = "Has purchase return history";
    } else if (stockRequestProductIds.has(prod.id)) {
      blocked = true;
      reason = "Has stock request history";
    } else if (customerOrderProductIds.has(prod.id)) {
      blocked = true;
      reason = "Has customer order history";
    } else if (auditProductIds.has(prod.id)) {
      blocked = true;
      reason = "Has audit history";
    }

    validationList.push({
      id: prod.id,
      name: prod.name,
      sku: prod.sku,
      blocked,
      reason: blocked ? reason : undefined,
    });
  }

  const blockedCount = validationList.filter((p) => p.blocked).length;
  const removableCount = validationList.length - blockedCount;

  return {
    ok: true,
    locationName: location?.name ?? "Selected Location",
    products: validationList,
    removableCount,
    blockedCount,
  };
}

export interface BulkRemoveLocationResult {
  ok: boolean;
  error?: string;
  removedCount: number;
  blockedCount: number;
  blockedProducts: { id: string; name: string; sku: string; reason: string }[];
  removedProducts: { id: string; name: string; sku: string }[];
}

export async function bulkRemoveProductsFromLocation(
  productIds: string[],
  locationId: string
): Promise<BulkRemoveLocationResult> {
  const validation = await validateRemoveProductsFromLocation(productIds, locationId);
  if (!validation.ok) {
    return { ok: false, error: validation.error, removedCount: 0, blockedCount: 0, blockedProducts: [], removedProducts: [] };
  }

  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "Session expired", removedCount: 0, blockedCount: 0, blockedProducts: [], removedProducts: [] };

  const supabase = await createClient();

  const allowed = validation.products.filter((p) => !p.blocked);
  const blocked = validation.products.filter((p) => p.blocked).map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    reason: p.reason ?? "Has transaction history",
  }));

  const removedProducts: { id: string; name: string; sku: string }[] = [];

  for (const item of allowed) {
    // Delete location stock level row
    const { error: delError } = await supabase
      .from("product_stock_levels")
      .delete()
      .eq("product_id", item.id)
      .eq("location_id", locationId)
      .eq("org_id", context.orgId);

    if (!delError) {
      removedProducts.push({ id: item.id, name: item.name, sku: item.sku });
      // If product's primary location_id was this location, set it to another location or null
      await supabase
        .from("products")
        .update({ location_id: null })
        .eq("id", item.id)
        .eq("location_id", locationId);
    }
  }

  // Audit log
  try {
    await supabase.from("audit_logs").insert({
      org_id: context.orgId,
      actor_id: context.userId,
      action: "products.remove_from_location",
      entity_type: "business_locations",
      entity_id: locationId,
      metadata: {
        location_id: locationId,
        location_name: validation.locationName,
        removed_count: removedProducts.length,
        blocked_count: blocked.length,
        removed_skus: removedProducts.map((p) => p.sku),
      },
    });
  } catch (err) {
    console.error("Audit log error on remove:", err);
  }

  revalidatePath("/inventory");
  return {
    ok: true,
    removedCount: removedProducts.length,
    blockedCount: blocked.length,
    blockedProducts: blocked,
    removedProducts,
  };
}