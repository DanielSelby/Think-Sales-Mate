import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { can } from "@/lib/rbac";
import { PosView } from "@/components/pos/pos-view";

export const metadata = { title: "POS · SalesMate ERP" };

export default async function PosPage() {
  const context = await getCurrentOrgContext();
  if (!context) return null;

  const orgId = context.orgId;
  const supabase = await createClient();

  const [{ data: products }, { data: locations }, { data: stockLevels }, { data: profile }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, sku, barcode, category, brand, unit_price, wholesale_price, vip_price, special_price, cost_price, stock_quantity, image_urls")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .order("name"),
    supabase.from("business_locations").select("id, name").eq("org_id", orgId).eq("is_active", true),
    // Per-branch stock — the product grid needs this to only show/allow
    // what's actually at the selected branch, not the org-wide total.
    (() => {
      let query = supabase.from("product_stock_levels").select("product_id, location_id, quantity").eq("org_id", orgId);
      return context.masterLocationId ? query.eq("location_id", context.masterLocationId) : query;
    })(),
    supabase.from("profiles").select("full_name").eq("id", context.userId).maybeSingle()
  ]);

  const rawLocations = context.masterLocationId
    ? (locations ?? []).filter((location) => location.id === context.masterLocationId)
    : (locations ?? []);
  const availableProductIds = context.masterLocationId
    ? new Set((stockLevels ?? []).filter((stock) => Number(stock.quantity) > 0).map((stock) => stock.product_id))
    : null;
  const rawProducts = (products ?? []).filter((product) => !availableProductIds || availableProductIds.has(product.id));
  const scopedLocations = context.isBranchScoped && context.allowedLocationIds.length > 0
    ? rawLocations.filter((l) => context.allowedLocationIds.includes(l.id))
    : rawLocations;

  const categories = Array.from(new Set(rawProducts.map((p) => p.category).filter(Boolean))) as string[];
  const brands = Array.from(new Set(rawProducts.map((p) => p.brand).filter(Boolean))) as string[];

  return (
    <PosView
      products={rawProducts.map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        category: p.category,
        brand: p.brand,
        unitPrice: p.unit_price,
        wholesalePrice: p.wholesale_price,
        vipPrice: p.vip_price,
        specialPrice: p.special_price,
        costPrice: Number(p.cost_price ?? 0),
        stockQuantity: p.stock_quantity,
        imageUrl: p.image_urls?.[0] ?? null,
      }))}
      categories={categories}
      brands={brands}
      locations={scopedLocations.map((l) => ({ id: l.id, name: l.name }))}
      stockLevels={(stockLevels ?? []).map((s) => ({ productId: s.product_id, locationId: s.location_id, quantity: s.quantity }))}
      currency={context.currency}
      taxRatePercent={15}
      cashierName={profile?.full_name || context.userEmail}
      canCheckCrossBranchStock={context.canCheckCrossBranchStock}
      canChoosePriceTier={can(context.role, "inventory.manage")}
    />
  );
}