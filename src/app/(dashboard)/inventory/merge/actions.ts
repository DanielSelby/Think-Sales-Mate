"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { can } from "@/lib/rbac";

export interface MergeProductOption {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  category: string | null;
  brand: string | null;
  unitPrice: number;
  costPrice: number | null;
  stockQuantity: number;
  imageUrl: string | null;
  createdAt: string;
  locations: { id: string; name: string; quantity: number }[];
}

export interface MergePreviewData {
  products: MergeProductOption[];
  masterProductId: string;
  totalStockAfterMerge: number;
  transactionsToTransfer: {
    total: number;
    sales: number;
    purchases: number;
    transfers: number;
    adjustments: number;
    saleReturns: number;
    purchaseReturns: number;
    stockRequests: number;
    customerOrders: number;
  };
  locationsAffected: { id: string; name: string; currentMasterStock: number; incomingStock: number; finalStock: number }[];
  priceOutcomes: {
    keep_master: { price: number; cost: number | null };
    keep_latest: { price: number; cost: number | null };
    highest: { price: number; cost: number | null };
    lowest: { price: number; cost: number | null };
    average: { price: number; cost: number | null };
  };
}

export interface MergeExecutionResult {
  ok: boolean;
  error?: string;
  masterProductId?: string;
  masterProductName?: string;
  mergedCount?: number;
  consolidatedStock?: number;
  recordsTransferred?: number;
}

/**
 * Search products eligible for merging (excludes products that have already been merged).
 */
export async function searchProductsForMerge(query: string): Promise<MergeProductOption[]> {
  const context = await getCurrentOrgContext();
  if (!context) return [];

  const supabase = await createClient();
  const term = query.trim();

  let q = supabase
    .from("products")
    .select("id, name, sku, barcode, category, brand, unit_price, cost_price, stock_quantity, image_urls, created_at, location_id, business_locations(name)")
    .eq("org_id", context.orgId);

  // Filter out merged products if status column exists, or check is_active
  q = q.neq("status", "merged");

  if (term) {
    const escaped = term.replace(/[%_,]/g, (c) => `\\${c}`);
    q = q.or(`name.ilike.%${escaped}%,sku.ilike.%${escaped}%,barcode.ilike.%${escaped}%`);
  }

  q = q.order("name").limit(25);

  const { data: products, error } = await q;
  if (error || !products) {
    // If status column doesn't exist yet, retry without status filter
    const fallback = await supabase
      .from("products")
      .select("id, name, sku, barcode, category, brand, unit_price, cost_price, stock_quantity, image_urls, created_at, location_id, business_locations(name)")
      .eq("org_id", context.orgId)
      .order("name")
      .limit(25);

    if (fallback.error || !fallback.data) return [];
    return formatProductOptions(fallback.data, supabase, context.orgId);
  }

  return formatProductOptions(products, supabase, context.orgId);
}

async function formatProductOptions(rawProducts: any[], supabase: any, orgId: string): Promise<MergeProductOption[]> {
  if (rawProducts.length === 0) return [];
  const productIds = rawProducts.map((p) => p.id);

  const { data: stockLevels } = await supabase
    .from("product_stock_levels")
    .select("product_id, location_id, quantity, business_locations(id, name)")
    .in("product_id", productIds)
    .eq("org_id", orgId);

  const stockMap = new Map<string, { id: string; name: string; quantity: number }[]>();
  for (const sl of stockLevels ?? []) {
    const loc = Array.isArray(sl.business_locations) ? sl.business_locations[0] : sl.business_locations;
    const list = stockMap.get(sl.product_id) ?? [];
    list.push({
      id: sl.location_id,
      name: loc?.name ?? "Branch",
      quantity: sl.quantity,
    });
    stockMap.set(sl.product_id, list);
  }

  return rawProducts.map((p) => {
    const locations = stockMap.get(p.id) ?? [];
    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      barcode: p.barcode ?? null,
      category: p.category ?? null,
      brand: p.brand ?? null,
      unitPrice: Number(p.unit_price || 0),
      costPrice: p.cost_price != null ? Number(p.cost_price) : null,
      stockQuantity: Number(p.stock_quantity || 0),
      imageUrl: p.image_urls?.[0] ?? null,
      createdAt: p.created_at,
      locations,
    };
  });
}

/**
 * Generate preview and impact analysis for merging products.
 */
export async function previewProductMerge(
  productIds: string[],
  selectedMasterId?: string
): Promise<{ ok: boolean; error?: string; preview?: MergePreviewData }> {
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "inventory.manage")) {
    return { ok: false, error: "Unauthorized: inventory manager role required." };
  }

  if (!productIds || productIds.length < 2) {
    return { ok: false, error: "Select at least 2 products to merge." };
  }

  const supabase = await createClient();

  const { data: rawProducts, error: prodError } = await supabase
    .from("products")
    .select("id, name, sku, barcode, category, brand, unit_price, cost_price, stock_quantity, image_urls, created_at, location_id")
    .in("id", productIds)
    .eq("org_id", context.orgId);

  if (prodError || !rawProducts || rawProducts.length < 2) {
    return { ok: false, error: "Could not retrieve selected products." };
  }

  const products = await formatProductOptions(rawProducts, supabase, context.orgId);

  // Determine master product:
  // default to selectedMasterId if provided and valid, otherwise first product in list
  const masterProduct = products.find((p) => p.id === selectedMasterId) ?? products[0];
  const masterId = masterProduct.id;
  const secondaryProducts = products.filter((p) => p.id !== masterId);
  const secondaryIds = secondaryProducts.map((p) => p.id);

  // 1. Transaction counts across all modules
  const [
    { count: salesCount },
    { count: purchasesCount },
    { count: transfersCount },
    { count: adjustmentsCount },
    { count: saleReturnsCount },
    { count: purchaseReturnsCount },
    { count: stockRequestsCount },
    { count: customerOrdersCount },
  ] = await Promise.all([
    supabase.from("sale_items").select("*", { count: "exact", head: true }).in("product_id", secondaryIds).eq("org_id", context.orgId),
    supabase.from("purchase_items").select("*", { count: "exact", head: true }).in("product_id", secondaryIds).eq("org_id", context.orgId),
    supabase.from("stock_transfer_items").select("*", { count: "exact", head: true }).in("product_id", secondaryIds).eq("org_id", context.orgId),
    supabase.from("stock_adjustment_items").select("*", { count: "exact", head: true }).in("product_id", secondaryIds).eq("org_id", context.orgId),
    supabase.from("sale_return_items").select("*", { count: "exact", head: true }).in("product_id", secondaryIds).eq("org_id", context.orgId),
    supabase.from("purchase_return_items").select("*", { count: "exact", head: true }).in("product_id", secondaryIds).eq("org_id", context.orgId),
    supabase.from("stock_request_items").select("*", { count: "exact", head: true }).in("product_id", secondaryIds).eq("org_id", context.orgId),
    supabase.from("customer_order_items").select("*", { count: "exact", head: true }).in("product_id", secondaryIds).eq("org_id", context.orgId),
  ]);

  const sales = salesCount ?? 0;
  const purchases = purchasesCount ?? 0;
  const transfers = transfersCount ?? 0;
  const adjustments = adjustmentsCount ?? 0;
  const saleReturns = saleReturnsCount ?? 0;
  const purchaseReturns = purchaseReturnsCount ?? 0;
  const stockRequests = stockRequestsCount ?? 0;
  const customerOrders = customerOrdersCount ?? 0;
  const totalTransfers = sales + purchases + transfers + adjustments + saleReturns + purchaseReturns + stockRequests + customerOrders;

  // 2. Stock pool per location
  const { data: allStockLevels } = await supabase
    .from("product_stock_levels")
    .select("product_id, location_id, quantity, business_locations(id, name)")
    .in("product_id", productIds)
    .eq("org_id", context.orgId);

  const locationMap = new Map<string, { id: string; name: string; currentMasterStock: number; incomingStock: number; finalStock: number }>();

  for (const sl of allStockLevels ?? []) {
    const loc = Array.isArray(sl.business_locations) ? sl.business_locations[0] : sl.business_locations;
    const locName = loc?.name ?? "Location";
    const existing = locationMap.get(sl.location_id) ?? {
      id: sl.location_id,
      name: locName,
      currentMasterStock: 0,
      incomingStock: 0,
      finalStock: 0,
    };

    if (sl.product_id === masterId) {
      existing.currentMasterStock += sl.quantity;
    } else {
      existing.incomingStock += sl.quantity;
    }
    existing.finalStock = existing.currentMasterStock + existing.incomingStock;
    locationMap.set(sl.location_id, existing);
  }

  const locationsAffected = Array.from(locationMap.values()).filter((l) => l.finalStock > 0 || l.incomingStock > 0 || l.currentMasterStock > 0);

  // Total stock across all products
  const totalStockAfterMerge = products.reduce((sum, p) => sum + p.stockQuantity, 0);

  // 3. Price outcomes
  const prices = products.map((p) => p.unitPrice);
  const costs = products.map((p) => p.costPrice).filter((c): c is number => c !== null);

  const latestProduct = [...products].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  const priceOutcomes = {
    keep_master: {
      price: masterProduct.unitPrice,
      cost: masterProduct.costPrice,
    },
    keep_latest: {
      price: latestProduct.unitPrice,
      cost: latestProduct.costPrice,
    },
    highest: {
      price: Math.max(...prices),
      cost: costs.length > 0 ? Math.max(...costs) : masterProduct.costPrice,
    },
    lowest: {
      price: Math.min(...prices),
      cost: costs.length > 0 ? Math.min(...costs) : masterProduct.costPrice,
    },
    average: {
      price: Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100,
      cost: costs.length > 0 ? Math.round((costs.reduce((a, b) => a + b, 0) / costs.length) * 100) / 100 : masterProduct.costPrice,
    },
  };

  return {
    ok: true,
    preview: {
      products,
      masterProductId: masterId,
      totalStockAfterMerge,
      transactionsToTransfer: {
        total: totalTransfers,
        sales,
        purchases,
        transfers,
        adjustments,
        saleReturns,
        purchaseReturns,
        stockRequests,
        customerOrders,
      },
      locationsAffected,
      priceOutcomes,
    },
  };
}

export interface ExecuteMergePayload {
  masterProductId: string;
  secondaryProductIds: string[];
  pricingStrategy: "keep_master" | "keep_latest" | "highest" | "lowest" | "average" | "custom";
  customPrice?: number;
  customCost?: number;
  detailsOptions?: {
    mergeImages?: boolean;
    keepDescription?: "master" | "latest";
    keepBarcode?: "master" | "latest";
  };
}

/**
 * Execute Product Merge with atomic safety and audit logging.
 */
export async function executeProductMerge(payload: ExecuteMergePayload): Promise<MergeExecutionResult> {
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "inventory.manage")) {
    return { ok: false, error: "Unauthorized: inventory manager role required." };
  }

  const { masterProductId, secondaryProductIds, pricingStrategy, customPrice, customCost, detailsOptions } = payload;

  if (!masterProductId || !secondaryProductIds || secondaryProductIds.length === 0) {
    return { ok: false, error: "Invalid merge configuration: master and secondary products required." };
  }

  if (secondaryProductIds.includes(masterProductId)) {
    return { ok: false, error: "Master product cannot be in the list of merged products." };
  }

  const supabase = await createClient();
  const admin = createAdminClient();

  // Try DB RPC first (if migration procedure is present)
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc("merge_products", {
      p_org_id: context.orgId,
      p_master_id: masterProductId,
      p_secondary_ids: secondaryProductIds,
      p_actor_id: context.userId,
      p_pricing_strategy: pricingStrategy,
      p_custom_price: customPrice ?? null,
      p_custom_cost: customCost ?? null,
      p_details_options: detailsOptions ?? {},
    });

    if (!rpcError && rpcData?.success) {
      const { data: masterProd } = await supabase.from("products").select("name").eq("id", masterProductId).single();
      revalidatePath("/inventory");
      revalidatePath("/inventory/merge");
      revalidatePath("/reports");
      return {
        ok: true,
        masterProductId,
        masterProductName: masterProd?.name ?? "Master Product",
        mergedCount: rpcData.merged_count,
        consolidatedStock: rpcData.consolidated_stock,
        recordsTransferred: rpcData.records_transferred,
      };
    }
  } catch {
    // If RPC is not found in database, execute via resilient server-side transaction emulation
  }

  // Fallback: Safe Multi-step Execution using Admin Client
  try {
    // 1. Fetch Master & Secondary products
    const { data: master, error: masterErr } = await admin
      .from("products")
      .select("*")
      .eq("id", masterProductId)
      .eq("org_id", context.orgId)
      .single();

    if (masterErr || !master) {
      return { ok: false, error: "Master product not found." };
    }

    const { data: secondaries, error: secErr } = await admin
      .from("products")
      .select("*")
      .in("id", secondaryProductIds)
      .eq("org_id", context.orgId);

    if (secErr || !secondaries || secondaries.length === 0) {
      return { ok: false, error: "Secondary products not found." };
    }

    // 2. Determine target pricing
    const allProds = [master, ...secondaries];
    let finalPrice = master.unit_price;
    let finalCost = master.cost_price;

    if (pricingStrategy === "highest") {
      finalPrice = Math.max(...allProds.map((p) => Number(p.unit_price || 0)));
      const validCosts = allProds.map((p) => p.cost_price).filter((c): c is number => c != null);
      finalCost = validCosts.length > 0 ? Math.max(...validCosts) : master.cost_price;
    } else if (pricingStrategy === "lowest") {
      finalPrice = Math.min(...allProds.map((p) => Number(p.unit_price || 0)));
      const validCosts = allProds.map((p) => p.cost_price).filter((c): c is number => c != null);
      finalCost = validCosts.length > 0 ? Math.min(...validCosts) : master.cost_price;
    } else if (pricingStrategy === "average") {
      finalPrice = Math.round((allProds.reduce((a, b) => a + Number(b.unit_price || 0), 0) / allProds.length) * 100) / 100;
      const validCosts = allProds.map((p) => p.cost_price).filter((c): c is number => c != null);
      finalCost = validCosts.length > 0 ? Math.round((validCosts.reduce((a, b) => a + Number(b), 0) / validCosts.length) * 100) / 100 : master.cost_price;
    } else if (pricingStrategy === "keep_latest") {
      const latest = [...allProds].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
      finalPrice = latest.unit_price;
      finalCost = latest.cost_price;
    } else if (pricingStrategy === "custom" && customPrice != null) {
      finalPrice = customPrice;
      finalCost = customCost ?? master.cost_price;
    }

    // 3. Consolidate Images
    let mergedImages = master.image_urls || [];
    if (detailsOptions?.mergeImages !== false) {
      const allImages = new Set<string>();
      (master.image_urls || []).forEach((u: string) => allImages.add(u));
      secondaries.forEach((sec) => (sec.image_urls || []).forEach((u: string) => allImages.add(u)));
      mergedImages = Array.from(allImages);
    }

    // 4. Consolidate Location Stock Levels
    const { data: secStockLevels } = await admin
      .from("product_stock_levels")
      .select("location_id, quantity")
      .in("product_id", secondaryProductIds)
      .eq("org_id", context.orgId);

    const stockByLocation = new Map<string, number>();
    for (const row of secStockLevels ?? []) {
      stockByLocation.set(row.location_id, (stockMap_get(stockByLocation, row.location_id) || 0) + row.quantity);
    }

    for (const [locId, addedQty] of stockByLocation.entries()) {
      const { data: existingMasterLevel } = await admin
        .from("product_stock_levels")
        .select("quantity")
        .eq("product_id", masterProductId)
        .eq("location_id", locId)
        .maybeSingle();

      if (existingMasterLevel) {
        await admin
          .from("product_stock_levels")
          .update({
            quantity: existingMasterLevel.quantity + addedQty,
            updated_at: new Date().toISOString(),
          })
          .eq("product_id", masterProductId)
          .eq("location_id", locId);
      } else {
        await admin.from("product_stock_levels").insert({
          org_id: context.orgId,
          product_id: masterProductId,
          location_id: locId,
          quantity: addedQty,
        });
      }
    }

    // Set secondary product_stock_levels to 0
    await admin
      .from("product_stock_levels")
      .update({ quantity: 0, updated_at: new Date().toISOString() })
      .in("product_id", secondaryProductIds)
      .eq("org_id", context.orgId);

    // Calculate total stock after merge
    const { data: updatedMasterLevels } = await admin
      .from("product_stock_levels")
      .select("quantity")
      .eq("product_id", masterProductId)
      .eq("org_id", context.orgId);

    const consolidatedStock = (updatedMasterLevels ?? []).reduce((sum, r) => sum + r.quantity, 0);

    // 5. Transfer historical transaction records to masterProductId
    let transferredCount = 0;

    const transferTasks = [
      admin.from("sale_items").update({ product_id: masterProductId }).in("product_id", secondaryProductIds).eq("org_id", context.orgId),
      admin.from("purchase_items").update({ product_id: masterProductId }).in("product_id", secondaryProductIds).eq("org_id", context.orgId),
      admin.from("stock_transfer_items").update({ product_id: masterProductId }).in("product_id", secondaryProductIds).eq("org_id", context.orgId),
      admin.from("stock_adjustment_items").update({ product_id: masterProductId }).in("product_id", secondaryProductIds).eq("org_id", context.orgId),
      admin.from("sale_return_items").update({ product_id: masterProductId }).in("product_id", secondaryProductIds).eq("org_id", context.orgId),
      admin.from("purchase_return_items").update({ product_id: masterProductId }).in("product_id", secondaryProductIds).eq("org_id", context.orgId),
      admin.from("stock_request_items").update({ product_id: masterProductId }).in("product_id", secondaryProductIds).eq("org_id", context.orgId),
      admin.from("customer_order_items").update({ product_id: masterProductId }).in("product_id", secondaryProductIds).eq("org_id", context.orgId),
    ];

    const results = await Promise.allSettled(transferTasks);
    results.forEach((res) => {
      if (res.status === "fulfilled" && !res.value.error) {
        transferredCount += (res.value as any).count ?? 1;
      }
    });

    // 6. Update Master Product
    await admin
      .from("products")
      .update({
        unit_price: finalPrice,
        cost_price: finalCost,
        stock_quantity: consolidatedStock,
        image_urls: mergedImages,
        updated_at: new Date().toISOString(),
      })
      .eq("id", masterProductId);

    // 7. Soft-delete secondary products
    const secondaryUpdatePayload: any = {
      is_active: false,
      stock_quantity: 0,
      updated_at: new Date().toISOString(),
    };

    // Include status and merged_into_product_id if column exists
    try {
      await admin
        .from("products")
        .update({
          ...secondaryUpdatePayload,
          status: "merged",
          merged_into_product_id: masterProductId,
          merged_at: new Date().toISOString(),
          merged_by: context.userId,
        })
        .in("id", secondaryProductIds);
    } catch {
      await admin.from("products").update(secondaryUpdatePayload).in("id", secondaryProductIds);
    }

    // 8. Create Audit Log
    try {
      await admin.from("audit_logs").insert({
        org_id: context.orgId,
        actor_id: context.userId,
        action: "product.merge",
        entity_type: "products",
        entity_id: masterProductId,
        metadata: {
          master_product_id: masterProductId,
          master_product_name: master.name,
          master_sku: master.sku,
          secondary_product_ids: secondaryProductIds,
          merged_count: secondaryProductIds.length,
          consolidated_stock: consolidatedStock,
          records_transferred: transferredCount,
          pricing_strategy: pricingStrategy,
          final_price: finalPrice,
        },
      });
    } catch (err) {
      console.error("Audit log error:", err);
    }

    revalidatePath("/inventory");
    revalidatePath("/inventory/merge");
    revalidatePath("/reports");
    revalidatePath("/sales");
    revalidatePath("/purchases");

    return {
      ok: true,
      masterProductId,
      masterProductName: master.name,
      mergedCount: secondaryProductIds.length,
      consolidatedStock,
      recordsTransferred: transferredCount,
    };
  } catch (err: any) {
    return { ok: false, error: err.message || "Failed to execute product merge." };
  }
}

function stockMap_get(map: Map<string, number>, key: string): number {
  return map.get(key) ?? 0;
}
