import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { PosView } from "@/components/pos/pos-view";

export const metadata = { title: "POS · SalesMate ERP" };

export default async function PosPage() {
  const context = await getCurrentOrgContext();
  if (!context) return null;

  const orgId = context.orgId;
  const supabase = await createClient();

  const [{ data: products }, { data: locations }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, sku, barcode, category, unit_price, stock_quantity")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .order("name"),
    supabase.from("business_locations").select("id, name").eq("org_id", orgId).eq("is_active", true),
  ]);

  const rawProducts = products ?? [];
  const categories = Array.from(new Set(rawProducts.map((p) => p.category).filter(Boolean))) as string[];

  return (
    <PosView
      products={rawProducts.map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        category: p.category,
        unitPrice: p.unit_price,
        stockQuantity: p.stock_quantity,
      }))}
      categories={categories}
      locations={(locations ?? []).map((l) => ({ id: l.id, name: l.name }))}
      currency={context.currency}
      taxRatePercent={15}
    />
  );
}