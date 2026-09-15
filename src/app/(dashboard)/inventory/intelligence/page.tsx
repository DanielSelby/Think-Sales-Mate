import { cookies } from "next/headers";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { InventoryIntelligenceCenter, type IntelligenceData } from "@/components/inventory/inventory-intelligence-center";

export const dynamic = "force-dynamic";

export default async function InventoryIntelligencePage() {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const supabase = await createClient();
  const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  const [{ data: products }, { data: stockLevels }, { data: locations }, { data: sales }, { data: purchases }, { data: transfers }, { data: adjustments }] =
    await Promise.all([
      supabase.from("products").select("id, sku, name, category, brand, supplier, cost_price, unit_price, stock_quantity, low_stock_threshold, is_active, location_id").eq("org_id", context.orgId).order("name").limit(2000),
      supabase.from("product_stock_levels").select("product_id, location_id, quantity, business_locations(name)").eq("org_id", context.orgId),
      supabase.from("business_locations").select("id, name").eq("org_id", context.orgId).eq("is_active", true).order("name"),
      supabase.from("sale_items").select("product_id, quantity, line_total, created_at, sales: sale_id (status, business_locations(name))").eq("org_id", context.orgId).gte("created_at", since).limit(10000),
      supabase.from("purchase_items").select("product_id, quantity_received, quantity, created_at, purchases: purchase_id (status)").eq("org_id", context.orgId).gte("created_at", since).limit(10000),
      supabase.from("stock_transfer_items").select("quantity, created_at, stock_transfers: transfer_id (status)").eq("org_id", context.orgId).gte("created_at", since).limit(10000),
      supabase.from("stock_adjustment_items").select("system_stock, counted_stock, created_at").eq("org_id", context.orgId).gte("created_at", since).limit(10000),
    ]);

  const locationNames = new Map((locations ?? []).map((location) => [location.id, location.name]));
  const stockByProduct = new Map<string, { locationId: string; locationName: string; quantity: number }[]>();
  for (const row of stockLevels ?? []) {
    const relation = Array.isArray(row.business_locations) ? row.business_locations[0] : row.business_locations;
    const list = stockByProduct.get(row.product_id) ?? [];
    list.push({ locationId: row.location_id, locationName: relation?.name ?? locationNames.get(row.location_id) ?? "Warehouse", quantity: Number(row.quantity ?? 0) });
    stockByProduct.set(row.product_id, list);
  }

  const salesByProduct = new Map<string, { quantity: number; revenue: number; lastSale: string | null }>();
  const monthlyMovement = new Map<string, { inQty: number; outQty: number }>();
  for (const row of sales ?? []) {
    const sale = Array.isArray(row.sales) ? row.sales[0] : row.sales;
    if (sale?.status === "cancelled") continue;
    const current = salesByProduct.get(row.product_id) ?? { quantity: 0, revenue: 0, lastSale: null };
    current.quantity += Number(row.quantity ?? 0);
    current.revenue += Number(row.line_total ?? 0);
    current.lastSale = !current.lastSale || row.created_at > current.lastSale ? row.created_at : current.lastSale;
    salesByProduct.set(row.product_id, current);
    const month = row.created_at.slice(0, 7);
    const movement = monthlyMovement.get(month) ?? { inQty: 0, outQty: 0 };
    movement.outQty += Number(row.quantity ?? 0);
    monthlyMovement.set(month, movement);
  }
  for (const row of purchases ?? []) {
    const purchase = Array.isArray(row.purchases) ? row.purchases[0] : row.purchases;
    if (purchase?.status === "cancelled" || purchase?.status === "draft") continue;
    const quantity = Number(row.quantity_received ?? row.quantity ?? 0);
    const month = row.created_at.slice(0, 7);
    const movement = monthlyMovement.get(month) ?? { inQty: 0, outQty: 0 };
    movement.inQty += quantity;
    monthlyMovement.set(month, movement);
  }
  for (const row of transfers ?? []) {
    const transfer = Array.isArray(row.stock_transfers) ? row.stock_transfers[0] : row.stock_transfers;
    if (transfer?.status !== "completed") continue;
    const month = row.created_at.slice(0, 7);
    const movement = monthlyMovement.get(month) ?? { inQty: 0, outQty: 0 };
    movement.inQty += Number(row.quantity ?? 0);
    movement.outQty += Number(row.quantity ?? 0);
    monthlyMovement.set(month, movement);
  }
  for (const row of adjustments ?? []) {
    const variance = Number(row.counted_stock ?? 0) - Number(row.system_stock ?? 0);
    if (!variance) continue;
    const month = row.created_at.slice(0, 7);
    const movement = monthlyMovement.get(month) ?? { inQty: 0, outQty: 0 };
    if (variance > 0) movement.inQty += variance;
    else movement.outQty += Math.abs(variance);
    monthlyMovement.set(month, movement);
  }

  const intelligenceData: IntelligenceData = {
    currency: context.currency,
    locations: (locations ?? []).map((location) => ({ id: location.id, name: location.name })),
    categories: [...new Set((products ?? []).map((product) => product.category).filter(Boolean) as string[])].sort(),
    suppliers: [...new Set((products ?? []).map((product) => product.supplier).filter(Boolean) as string[])].sort(),
    brands: [...new Set((products ?? []).map((product) => product.brand).filter(Boolean) as string[])].sort(),
    products: (products ?? []).map((product) => {
      const levels = stockByProduct.get(product.id) ?? [];
      const stock = levels.length ? levels.reduce((sum, level) => sum + level.quantity, 0) : Number(product.stock_quantity ?? 0);
      const salesData = salesByProduct.get(product.id) ?? { quantity: 0, revenue: 0, lastSale: null };
      const cost = Number(product.cost_price ?? 0);
      const averageMonthlySales = salesData.quantity / 12;
      return {
        id: product.id,
        sku: product.sku,
        name: product.name,
        category: product.category ?? "Uncategorized",
        brand: product.brand ?? "Unbranded",
        supplier: product.supplier ?? "Unknown supplier",
        locationId: product.location_id,
        locationName: product.location_id ? (locationNames.get(product.location_id) ?? "Main Warehouse") : "Main Warehouse",
        stock,
        cost,
        price: Number(product.unit_price ?? 0),
        value: stock * cost,
        sold: salesData.quantity,
        revenue: salesData.revenue,
        profit: salesData.revenue - salesData.quantity * cost,
        lastSale: salesData.lastSale,
        daysIdle: salesData.lastSale ? Math.max(0, Math.floor((Date.now() - new Date(salesData.lastSale).getTime()) / 86400000)) : 365,
        averageMonthlySales,
        threshold: Number(product.low_stock_threshold ?? 5),
        active: product.is_active ?? true,
        levels,
      };
    }),
    monthlyMovement: [...monthlyMovement.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([month, values]) => ({ month, ...values })),
  };
  return <InventoryIntelligenceCenter initialData={intelligenceData} />;
}
