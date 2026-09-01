import { cookies } from "next/headers";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import {
  ProductsCatalog,
  type CatalogProduct,
  type CatalogLocation,
  type BestSellerRow
} from "@/components/inventory/products-catalog";


export default async function InventoryPage() {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const supabase = await createClient();

  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: productRows }, { data: locationRows }, { data: stockLevelRows }, { data: recentItemRows }] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, sku, name, description, category, brand, supplier, barcode, location_id, unit_price, cost_price, stock_quantity, low_stock_threshold, is_active, image_urls, business_locations(name)"
      )
      .eq("org_id", context.orgId)
      .order("name"),
    supabase.from("business_locations").select("id, name").eq("org_id", context.orgId).eq("is_active", true).order("name"),
    supabase
      .from("product_stock_levels")
      .select("product_id, location_id, quantity, business_locations(name)")
      .eq("org_id", context.orgId),
    supabase
      .from("sale_items")
      .select("product_id, quantity, products(name)")
      .eq("org_id", context.orgId)
      .gte("created_at", since30d)
  ]);

  const stockLevelsByProduct = new Map<string, { locationId: string; locationName: string; quantity: number }[]>();
  for (const sl of stockLevelRows ?? []) {
    const loc = Array.isArray(sl.business_locations) ? sl.business_locations[0] : sl.business_locations;
    const list = stockLevelsByProduct.get(sl.product_id) ?? [];
    list.push({
      locationId: sl.location_id,
      locationName: loc?.name ?? "Warehouse",
      quantity: sl.quantity,
    });
    stockLevelsByProduct.set(sl.product_id, list);
  }

  const products: CatalogProduct[] = (productRows ?? []).map((p) => {
    const location = Array.isArray(p.business_locations) ? p.business_locations[0] : p.business_locations;
    const stockLevels = stockLevelsByProduct.get(p.id) ?? [];
    const totalLevelStock = stockLevels.reduce((sum, sl) => sum + sl.quantity, 0);
    const effectiveStock = stockLevels.length > 0 ? totalLevelStock : p.stock_quantity;

    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      description: p.description,
      category: p.category,
      brand: p.brand,
      supplier: p.supplier,
      barcode: p.barcode,
      locationId: p.location_id,
      locationName: location?.name ?? null,
      unitPrice: p.unit_price,
      costPrice: p.cost_price,
      stockQuantity: effectiveStock,
      lowStockThreshold: p.low_stock_threshold,
      isActive: p.is_active,
      imageUrl: p.image_urls?.[0] ?? null,
      stockLevels,
    };
  });

  const locations: CatalogLocation[] = (locationRows ?? []).map((l) => ({ id: l.id, name: l.name }));

  const bestSellerMap = new Map<string, { name: string; unitsSold: number }>();
  for (const row of recentItemRows ?? []) {
    const product = Array.isArray(row.products) ? row.products[0] : row.products;
    if (!row.product_id || !product) continue;
    const existing = bestSellerMap.get(row.product_id) ?? { name: product.name, unitsSold: 0 };
    existing.unitsSold += row.quantity;
    bestSellerMap.set(row.product_id, existing);
  }
  const bestSellers: BestSellerRow[] = [...bestSellerMap.entries()]
    .map(([productId, v]) => ({ productId, name: v.name, unitsSold: v.unitsSold }))
    .sort((a, b) => b.unitsSold - a.unitsSold)
    .slice(0, 3);

  return (
    <ProductsCatalog
      products={products}
      locations={locations}
      bestSellers={bestSellers}
      canManage={can(context.role, "inventory.manage")}
      currency={context.currency}
    />
  );
}
