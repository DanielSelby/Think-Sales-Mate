"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canAccessLocation } from "@/lib/organizations/location-access";

export interface CrossBranchStockResult {
  ok: boolean;
  productName?: string;
  sku?: string;
  branches?: { id: string; name: string; quantity: number }[];
  error?: string;
}

export interface ProductSearchResult {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
}

export async function searchProductsForDetails(query: string): Promise<ProductSearchResult[]> {
  const context = await getCurrentOrgContext();
  if (!context) return [];

  const term = query.trim();
  if (!term) return [];

  const escaped = term.replace(/[%_,]/g, (character) => `\\${character}`);
  const admin = createAdminClient();
  const { data: products, error } = await admin
    .from("products")
    .select("id, name, sku, barcode, location_id")
    .eq("org_id", context.orgId)
    .eq("is_active", true)
    .or(`name.ilike.%${escaped}%,sku.ilike.%${escaped}%,barcode.ilike.%${escaped}%`)
    .order("name")
    .limit(8);

  if (error) return [];

  return (products ?? [])
    .filter((product) => !context.isBranchScoped || (product.location_id && canAccessLocation(context, product.location_id)))
    .map(({ id, name, sku, barcode }) => ({ id, name, sku, barcode }));
}

export async function checkCrossBranchStock(query: string): Promise<CrossBranchStockResult> {
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "Your session has expired. Please sign in again." };
  if (!context.canCheckCrossBranchStock) {
    return { ok: false, error: "You do not have permission to check stock across branches." };
  }

  const term = query.trim();
  if (!term) return { ok: false, error: "Enter a product name, SKU, or barcode." };

  const admin = createAdminClient();
  const escaped = term.replace(/[%_,]/g, (character) => `\\${character}`);
  const { data: products, error: productError } = await admin
    .from("products")
    .select("id, name, sku, barcode")
    .eq("org_id", context.orgId)
    .or(`name.ilike.%${escaped}%,sku.ilike.%${escaped}%,barcode.ilike.%${escaped}%`)
    .order("name")
    .limit(10);
  if (productError) return { ok: false, error: productError.message };
  if (!products || products.length === 0) return { ok: false, error: "No product found." };

  const product = products[0];
  const [{ data: locations, error: locationsError }, { data: stockLevels, error: stockError }] = await Promise.all([
    admin.from("business_locations").select("id, name").eq("org_id", context.orgId).eq("is_active", true).order("name"),
    admin.from("product_stock_levels").select("location_id, quantity").eq("org_id", context.orgId).eq("product_id", product.id),
  ]);
  if (locationsError || stockError) return { ok: false, error: locationsError?.message ?? stockError?.message };

  const quantities = new Map((stockLevels ?? []).map((row) => [row.location_id, row.quantity]));
  return {
    ok: true,
    productName: product.name,
    sku: product.sku,
    branches: (locations ?? []).map((location) => ({
      id: location.id,
      name: location.name,
      quantity: quantities.get(location.id) ?? 0,
    })),
  };
}
