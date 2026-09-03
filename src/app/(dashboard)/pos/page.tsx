import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
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
      .select("id, name, sku, barcode, category, brand, unit_price, stock_quantity, image_urls")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .order("name"),
    supabase.from("business_locations").select("id, name").eq("org_id", orgId).eq("is_active", true),
    // Per-branch stock — the product grid needs this to only show/allow
    // what's actually at the selected branch, not the org-wide total.
    supabase.from("product_stock_levels").select("product_id, location_id, quantity").eq("org_id", orgId),
    supabase.from("profiles").select("full_name").eq("id", context.userId).maybeSingle()
  ]);

  const rawProducts = products ?? [];
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
        stockQuantity: p.stock_quantity,
        imageUrl: p.image_urls?.[0] ?? null,
      }))}
      categories={categories}
      brands={brands}
      locations={(locations ?? []).map((l) => ({ id: l.id, name: l.name }))}
      stockLevels={(stockLevels ?? []).map((s) => ({ productId: s.product_id, locationId: s.location_id, quantity: s.quantity }))}
      currency={context.currency}
      taxRatePercent={15}
      cashierName={profile?.full_name || context.userEmail}
    />
  );
}