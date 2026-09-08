"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { can } from "@/lib/rbac";
import { normalizeProductName, productNameScore, type BarcodeValidationMode, type DuplicateControlMode, type ProductDuplicateMatch } from "@/lib/inventory/duplicate-products";

type DuplicateSettings = {
  controlMode: DuplicateControlMode;
  similarityThreshold: number;
  barcodeValidation: BarcodeValidationMode;
};

const DEFAULT_SETTINGS: DuplicateSettings = { controlMode: "block_exact_similar", similarityThreshold: 85, barcodeValidation: "warn" };

export async function getDuplicateSettings(): Promise<DuplicateSettings> {
  const context = await getCurrentOrgContext();
  if (!context) return DEFAULT_SETTINGS;
  const supabase = await createClient();
  const { data } = await supabase.from("product_duplicate_settings").select("control_mode, similarity_threshold, barcode_validation").eq("org_id", context.orgId).maybeSingle();
  return data ? { controlMode: data.control_mode as DuplicateControlMode, similarityThreshold: data.similarity_threshold, barcodeValidation: data.barcode_validation as BarcodeValidationMode } : DEFAULT_SETTINGS;
}

export async function saveDuplicateSettings(input: DuplicateSettings) {
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "settings.edit")) return { error: "You do not have permission to change product settings." };
  const supabase = await createClient();
  const { error } = await supabase.from("product_duplicate_settings").upsert({
    org_id: context.orgId,
    control_mode: input.controlMode,
    similarity_threshold: Math.min(100, Math.max(70, input.similarityThreshold)),
    barcode_validation: input.barcodeValidation,
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: error.message };
  revalidatePath("/settings/products/duplicates");
  return { success: true };
}

export async function findProductDuplicates(name: string, barcode?: string | null): Promise<{ matches: ProductDuplicateMatch[]; barcodeMatch: ProductDuplicateMatch | null }> {
  const context = await getCurrentOrgContext();
  if (!context || !name.trim()) return { matches: [], barcodeMatch: null };
  const supabase = await createClient();
  const { data: products } = await supabase.from("products").select("id, name, sku, brand, category, barcode, stock_quantity, image_urls").eq("org_id", context.orgId).eq("is_active", true).neq("status", "merged").limit(500);
  const productRows = products ?? [];
  const ids = productRows.map((product) => product.id);
  const { data: levels } = ids.length ? await supabase.from("product_stock_levels").select("product_id, location_id, quantity").in("product_id", ids) : { data: [] };
  const locationIds = [...new Set((levels ?? []).map((level) => level.location_id))];
  const { data: locations } = locationIds.length ? await supabase.from("business_locations").select("id, name").in("id", locationIds) : { data: [] };
  const locationById = new Map((locations ?? []).map((location) => [location.id, location.name]));
  const stockByProduct = new Map<string, { quantity: number; locations: string[] }>();
  for (const level of levels ?? []) {
    const current = stockByProduct.get(level.product_id) ?? { quantity: 0, locations: [] };
    current.quantity += level.quantity;
    const location = locationById.get(level.location_id);
    if (location && !current.locations.includes(location)) current.locations.push(location);
    stockByProduct.set(level.product_id, current);
  }
  const matches = productRows.map((product) => {
    const score = productNameScore(name, product.name);
    const stock = stockByProduct.get(product.id) ?? { quantity: product.stock_quantity, locations: [] };
    return { id: product.id, name: product.name, sku: product.sku, brand: product.brand, category: product.category, barcode: product.barcode, imageUrl: product.image_urls?.[0] ?? null, stockQuantity: stock.quantity, locations: stock.locations, score, exact: normalizeProductName(name) === normalizeProductName(product.name) };
  }).filter((product) => product.score >= 70).sort((left, right) => right.score - left.score).slice(0, 10);
  const barcodeMatch = barcode?.trim() ? matches.find((product) => product.barcode?.toLowerCase() === barcode.trim().toLowerCase()) ?? null : null;
  return { matches, barcodeMatch };
}

export async function getDuplicateReviewRows() {
  const context = await getCurrentOrgContext();
  if (!context) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("products").select("id, name, sku, brand, category, barcode, stock_quantity").eq("org_id", context.orgId).eq("is_active", true).neq("status", "merged").order("name").limit(500);
  const products = data ?? [];
  const rows: Array<{ id: string; name: string; sku: string; brand: string | null; category: string | null; barcode: string | null; score: number; type: "exact" | "similar" | "barcode" | "brand_model" }> = [];
  for (let index = 0; index < products.length; index++) {
    for (let next = index + 1; next < products.length; next++) {
      const left = products[index];
      const right = products[next];
      const score = productNameScore(left.name, right.name);
      if (score >= 70) rows.push({ id: `${left.id}-${right.id}`, name: `${left.name} / ${right.name}`, sku: `${left.sku} · ${right.sku}`, brand: left.brand ?? right.brand, category: left.category ?? right.category, barcode: null, score, type: score === 100 ? "exact" : "similar" });
      if (left.barcode && right.barcode && left.barcode === right.barcode) rows.push({ id: `barcode-${left.id}-${right.id}`, name: `${left.name} / ${right.name}`, sku: `${left.sku} · ${right.sku}`, brand: left.brand ?? right.brand, category: left.category ?? right.category, barcode: left.barcode, score: 100, type: "barcode" });
      if (left.brand && right.brand && normalizeProductName(left.brand) === normalizeProductName(right.brand) && left.category === right.category && score >= 55 && score < 100) {
        rows.push({ id: `brand-model-${left.id}-${right.id}`, name: `${left.name} / ${right.name}`, sku: `${left.sku} · ${right.sku}`, brand: left.brand, category: left.category, barcode: null, score, type: "brand_model" });
      }
    }
  }
  return rows.slice(0, 200);
}
