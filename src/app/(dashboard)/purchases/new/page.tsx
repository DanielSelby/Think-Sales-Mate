import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { AddPurchaseForm, type Recommendation } from "@/components/purchases/add-purchase-form";

export const metadata = { title: "Add Purchase · SalesMate ERP" };

export default async function AddPurchasePage() {
  const context = await getCurrentOrgContext();
  if (!context) return null; // layout redirects when there's no org

  const orgId = context.orgId;
  const isBranchScoped = context.isBranchScoped;
  const allowedLocationIds = context.allowedLocationIds;
  const supabase = await createClient();

  const [
    { data: suppliers },
    { data: locations },
    { data: projects },
    { data: products },
    { data: stockLevels },
    { data: bankAccounts },
  ] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, name, contact_person, phone, email, payment_terms, currency")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .order("name"),
    supabase.from("business_locations").select("id, name, address").eq("org_id", orgId).eq("is_active", true),
    supabase.from("projects").select("id, name").eq("org_id", orgId).order("name"),
    supabase
      .from("products")
      .select("id, name, sku, barcode, cost_price, stock_quantity, low_stock_threshold")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .order("name"),
    (() => {
      let query = supabase.from("product_stock_levels").select("product_id, location_id, quantity").eq("org_id", orgId);
      return isBranchScoped ? query.in("location_id", allowedLocationIds) : query;
    })(),
    supabase.from("bank_accounts").select("id, name").eq("org_id", orgId),
  ]);

  const visibleLocations = isBranchScoped
    ? (locations ?? []).filter((location) => allowedLocationIds.includes(location.id))
    : locations ?? [];
  const stockByProduct = new Map<string, number>();
  for (const level of stockLevels ?? []) {
    stockByProduct.set(level.product_id, (stockByProduct.get(level.product_id) ?? 0) + Number(level.quantity ?? 0));
  }
  const recommendations = await buildRecommendations(orgId);

  return (
    <AddPurchaseForm
      suppliers={(suppliers ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        contactPerson: s.contact_person,
        phone: s.phone,
        email: s.email,
        paymentTerms: s.payment_terms,
        currency: s.currency,
      }))}
      locations={visibleLocations.map((l) => ({ id: l.id, name: l.name, address: l.address }))}
      projects={(projects ?? []).map((p) => ({ id: p.id, name: p.name }))}
      products={(products ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        costPrice: p.cost_price ?? 0,
        stockQuantity: isBranchScoped ? stockByProduct.get(p.id) ?? 0 : p.stock_quantity,
      }))}
      bankAccounts={(bankAccounts ?? []).map((a) => ({ id: a.id, name: a.name }))}
      currency={context.currency}
      recommendations={recommendations}
    />
  );

  // ---------------------------------------------------------------------
  // Recommendation heuristics — v1, computed from real data rather than a
  // model: low-stock reorder suggestions, frequently-purchased products,
  // and cross-supplier price comparisons where history exists.
  // ---------------------------------------------------------------------
  async function buildRecommendations(orgId: string): Promise<Recommendation[]> {
    const out: Recommendation[] = [];

    const { data: lowStock } = await supabase
      .from("products")
      .select("id, name, stock_quantity, low_stock_threshold")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .order("stock_quantity", { ascending: true })
      .limit(20);

    const { data: levels } = await (async () => {
      let query = supabase.from("product_stock_levels").select("product_id, location_id, quantity").eq("org_id", orgId);
      return isBranchScoped ? query.in("location_id", allowedLocationIds) : query;
    })();
    const visibleQuantity = new Map<string, number>();
    for (const level of levels ?? []) visibleQuantity.set(level.product_id, (visibleQuantity.get(level.product_id) ?? 0) + Number(level.quantity ?? 0));
    const lowStockRows = (lowStock ?? [])
      .filter((product) => !isBranchScoped || visibleQuantity.has(product.id))
      .map((product) => ({ ...product, stock_quantity: isBranchScoped ? visibleQuantity.get(product.id) ?? 0 : product.stock_quantity }))
      .filter((product) => product.stock_quantity <= product.low_stock_threshold);

    for (const p of lowStockRows.slice(0, 3)) {
      const suggestedQty = Math.max(1, p.low_stock_threshold * 2 - p.stock_quantity);
      out.push({
        productId: p.id,
        productName: p.name,
        suggestion: `only ${p.stock_quantity} left — reorder ~${suggestedQty} to stay ahead`,
        kind: "reorder",
      });
    }

    const { data: recentItems } = await supabase
      .from("purchase_items")
      .select("product_id, quantity, product:products(name)")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(300);

    if (recentItems && recentItems.length > 0) {
      const totalsByProduct = new Map<string, { name: string; qty: number; count: number }>();
      for (const item of recentItems) {
        const name = (item.product as { name: string } | null)?.name ?? "Unknown product";
        const entry = totalsByProduct.get(item.product_id) ?? { name, qty: 0, count: 0 };
        entry.qty += item.quantity;
        entry.count += 1;
        totalsByProduct.set(item.product_id, entry);
      }

      const alreadyFlagged = new Set(out.map((r) => r.productId));
      const topFrequent = Array.from(totalsByProduct.entries())
        .filter(([id]) => !alreadyFlagged.has(id))
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 2);

      for (const [productId, info] of topFrequent) {
        const avgQty = Math.round(info.qty / info.count);
        out.push({
          productId,
          productName: info.name,
          suggestion: `ordered ${info.count} times before — usually in batches of ~${avgQty}`,
          kind: "frequent",
        });
      }
    }

    return out;
  }
}