import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { canPermission, canTabPermission } from "@/lib/rbac/permissions";
import { BarcodeLabelsPage, type BarcodeLabelLocation, type BarcodeLabelProduct } from "@/components/inventory/barcode-labels-page";

export const metadata = { title: "Print Barcode Labels · ThinkSales Pro" };

export default async function BarcodeLabelsRoute() {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) redirect("/login");
  if (!await canPermission("inventory", "view")) redirect("/dashboard");

  const supabase = await createClient();
  const allowedLocationIds = context.isBranchScoped ? context.allowedLocationIds : null;
  if (context.isBranchScoped && !allowedLocationIds?.length) redirect("/dashboard");

  let locationsQuery = supabase
    .from("business_locations")
    .select("id, name")
    .eq("org_id", context.orgId)
    .eq("is_active", true)
    .order("name");
  let stockLevelsQuery = supabase
    .from("product_stock_levels")
    .select("product_id, location_id, quantity")
    .eq("org_id", context.orgId);
  if (allowedLocationIds) {
    locationsQuery = locationsQuery.in("id", allowedLocationIds);
    stockLevelsQuery = stockLevelsQuery.in("location_id", allowedLocationIds);
  }

  const [{ data: productRows, error: productsError }, { data: locationRows, error: locationsError }, { data: stockRows, error: stockError }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, sku, barcode, category, brand, location_id, unit_price, stock_quantity, low_stock_threshold, is_active, image_urls")
      .eq("org_id", context.orgId)
      .order("name"),
    locationsQuery,
    stockLevelsQuery,
  ]);
  if (productsError) throw new Error(`Could not load products for barcode labels: ${productsError.message}`);
  if (locationsError) throw new Error(`Could not load branches for barcode labels: ${locationsError.message}`);
  if (stockError) throw new Error(`Could not load branch stock for barcode labels: ${stockError.message}`);

  const stockByProduct = new Map<string, Map<string, number>>();
  for (const stock of stockRows ?? []) {
    const byLocation = stockByProduct.get(stock.product_id) ?? new Map<string, number>();
    byLocation.set(stock.location_id, Number(stock.quantity ?? 0));
    stockByProduct.set(stock.product_id, byLocation);
  }

  const locations: BarcodeLabelLocation[] = (locationRows ?? []).map((location) => ({
    id: location.id,
    name: location.name,
  }));
  const allowedSet = allowedLocationIds ? new Set(allowedLocationIds) : null;
  const products: BarcodeLabelProduct[] = (productRows ?? [])
    .filter((product) => !allowedSet
      || (product.location_id !== null && allowedSet.has(product.location_id))
      || [...(stockByProduct.get(product.id)?.keys() ?? [])].some((locationId) => allowedSet.has(locationId)))
    .map((product) => {
      const branchStocks = stockByProduct.get(product.id);
      const scopedStockLevels = [...(branchStocks ?? new Map<string, number>())]
        .filter(([locationId]) => !allowedSet || allowedSet.has(locationId))
        .map(([locationId, quantity]) => ({ locationId, quantity }));
      const stockQuantity = scopedStockLevels.length
        ? scopedStockLevels.reduce((total, stock) => total + stock.quantity, 0)
        : allowedSet ? 0 : Number(product.stock_quantity ?? 0);
      const locationId = product.location_id;
      const location = locations.find((candidate) => candidate.id === locationId);
      return {
        id: product.id,
        name: product.name,
        sku: product.sku ?? "",
        barcode: product.barcode,
        category: product.category,
        brand: product.brand,
        locationId,
        locationName: location?.name ?? null,
        sellingPrice: Number(product.unit_price ?? 0),
        stockQuantity,
        lowStockThreshold: Number(product.low_stock_threshold ?? 5),
        stockLevels: scopedStockLevels,
        isActive: Boolean(product.is_active),
        imageUrl: product.image_urls?.[0] ?? null,
      };
    });

  const canGenerateBarcodes = await canTabPermission("inventory", "products", "product_list", "edit")
    && await canPermission("inventory", "edit");

  return <BarcodeLabelsPage
    products={products}
    locations={locations}
    currency={context.currency}
    canGenerateBarcodes={canGenerateBarcodes}
  />;
}
