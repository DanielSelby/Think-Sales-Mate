"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { can } from "@/lib/rbac";
import { generateNextSku } from "@/lib/inventory/sku";

export interface ImportReferenceData {
  categories: string[];
  brands: string[];
  suppliers: string[];
  locations: { id: string; name: string }[];
  existingSkus: string[];
  existingBarcodes: string[];
}

export async function getImportReferenceData(): Promise<ImportReferenceData> {
  const context = await getCurrentOrgContext();
  if (!context) return { categories: [], brands: [], suppliers: [], locations: [], existingSkus: [], existingBarcodes: [] };

  const supabase = await createClient();
  const [{ data: products }, { data: suppliers }, { data: locations }] = await Promise.all([
    supabase.from("products").select("category, brand, sku, barcode").eq("org_id", context.orgId),
    supabase.from("suppliers").select("name").eq("org_id", context.orgId).eq("is_active", true),
    supabase.from("business_locations").select("id, name").eq("org_id", context.orgId).eq("is_active", true)
  ]);

  const categories = [...new Set((products ?? []).map((p) => p.category).filter(Boolean) as string[])];
  const brands = [...new Set((products ?? []).map((p) => p.brand).filter(Boolean) as string[])];
  const supplierNames = [...new Set((suppliers ?? []).map((s) => s.name))];
  const existingSkus = (products ?? []).map((p) => p.sku);
  const existingBarcodes = (products ?? []).map((p) => p.barcode).filter(Boolean) as string[];

  return {
    categories,
    brands,
    suppliers: supplierNames,
    locations: (locations ?? []).map((l) => ({ id: l.id, name: l.name })),
    existingSkus,
    existingBarcodes
  };
}

export interface ImportRowInput {
  rowNumber: number;
  name: string;
  barcode: string | null;
  category: string | null;
  brand: string | null;
  description: string | null;
  costPrice: number | null;
  sellingPrice: number;
  taxPercent: number;
  openingStock: number;
  minStock: number;
  supplier: string | null;
  locationNames: string[];
  isActive: boolean;
}

export interface ImportRowResult {
  rowNumber: number;
  ok: boolean;
  sku?: string;
  error?: string;
}

export interface CommitImportResult {
  imported: number;
  skipped: number;
  errorCount: number;
  results: ImportRowResult[];
}

export async function commitProductImport(fileName: string, rows: ImportRowInput[]): Promise<CommitImportResult> {
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "inventory.manage")) {
    return {
      imported: 0,
      skipped: rows.length,
      errorCount: rows.length,
      results: rows.map((r) => ({ rowNumber: r.rowNumber, ok: false, error: "Not permitted" }))
    };
  }

  const supabase = await createClient();
  const results: ImportRowResult[] = [];
  const reservedSkus = new Set<string>();

  const { data: locationRows } = await supabase
    .from("business_locations")
    .select("id, name")
    .eq("org_id", context.orgId)
    .eq("is_active", true);
  const locationByName = new Map((locationRows ?? []).map((l) => [l.name.toLowerCase(), l.id]));

  let imported = 0;
  let skipped = 0;
  let errorCount = 0;

  for (const row of rows) {
    if (!row.name || Number.isNaN(row.sellingPrice) || row.sellingPrice < 0) {
      results.push({ rowNumber: row.rowNumber, ok: false, error: "Missing product name or a valid selling price." });
      errorCount++;
      continue;
    }

    const matchedLocationIds = row.locationNames
      .map((name) => locationByName.get(name.toLowerCase()))
      .filter((id): id is string => Boolean(id));

    if (row.locationNames.length > 0 && matchedLocationIds.length === 0) {
      results.push({
        rowNumber: row.rowNumber,
        ok: false,
        error: `Location(s) "${row.locationNames.join(", ")}" don't match any active warehouse/branch.`
      });
      errorCount++;
      continue;
    }

    const sku = await generateNextSku(supabase, context.orgId, row.category, reservedSkus);
    const primaryLocationId = matchedLocationIds[0] ?? null;

    const { data: inserted, error: insertError } = await supabase
      .from("products")
      .insert({
        org_id: context.orgId,
        sku,
        name: row.name,
        description: row.description,
        category: row.category,
        brand: row.brand,
        supplier: row.supplier,
        barcode: row.barcode,
        location_id: primaryLocationId,
        unit_price: row.sellingPrice,
        cost_price: row.costPrice,
        stock_quantity: row.openingStock,
        low_stock_threshold: row.minStock,
        is_active: row.isActive
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      results.push({
        rowNumber: row.rowNumber,
        ok: false,
        error: insertError?.code === "23505" ? `Barcode "${row.barcode}" is already in use.` : insertError?.message ?? "Insert failed."
      });
      skipped++;
      continue;
    }

    // Credit opening stock to every matched location (same quantity at
    // each — the template has one "Opening Stock" figure, not a
    // per-location breakdown).
    for (const locationId of matchedLocationIds) {
      await supabase.from("product_stock_levels").upsert(
        {
          org_id: context.orgId,
          product_id: inserted.id,
          location_id: locationId,
          quantity: row.openingStock
        },
        { onConflict: "product_id,location_id" }
      );
    }

    results.push({ rowNumber: row.rowNumber, ok: true, sku });
    imported++;
  }

  await supabase.from("product_import_batches").insert({
    org_id: context.orgId,
    file_name: fileName,
    total_rows: rows.length,
    imported_count: imported,
    updated_count: 0,
    skipped_count: skipped,
    error_count: errorCount,
    created_by: context.userId
  });

  revalidatePath("/inventory");
  return { imported, skipped, errorCount, results };
}

export interface ImportBatchRow {
  id: string;
  fileName: string;
  totalRows: number;
  importedCount: number;
  skippedCount: number;
  errorCount: number;
  createdAt: string;
}

export async function getImportHistory(): Promise<ImportBatchRow[]> {
  const context = await getCurrentOrgContext();
  if (!context) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("product_import_batches")
    .select("id, file_name, total_rows, imported_count, skipped_count, error_count, created_at")
    .eq("org_id", context.orgId)
    .order("created_at", { ascending: false })
    .limit(20);

  return (data ?? []).map((b) => ({
    id: b.id,
    fileName: b.file_name,
    totalRows: b.total_rows,
    importedCount: b.imported_count,
    skippedCount: b.skipped_count,
    errorCount: b.error_count,
    createdAt: b.created_at
  }));
}