import { cookies } from "next/headers";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import {
  StockAdjustmentForm,
  type AdjustLocation,
  type AdjustableProduct,
  type RecentAdjustment,
  type ReasonStat
} from "@/components/inventory/stock-adjustment-form";

export default async function StockAdjustmentPage() {
  const activeOrgId = await (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const supabase = await createClient();

  const [{ data: locationRows }, { data: productRows }, { data: recentRows }, { data: reasonRows }] = await Promise.all([
    supabase
      .from("business_locations")
      .select("id, name")
      .eq("org_id", context.orgId)
      .eq("is_active", true)
      .order("is_primary", { ascending: false })
      .order("name"),
    supabase
      .from("products")
      .select("id, sku, name, category, stock_quantity, cost_price")
      .eq("org_id", context.orgId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("stock_adjustments")
      .select("id, reference_no, adjustment_number, adjustment_date, stock_adjustment_items(system_stock, counted_stock, unit_cost)")
      .eq("org_id", context.orgId)
      .order("created_at", { ascending: false })
      .limit(3),
    supabase.from("stock_adjustments").select("reason").eq("org_id", context.orgId)
  ]);

  const locations: AdjustLocation[] = (locationRows ?? []).map((l) => ({ id: l.id, name: l.name }));

  const products: AdjustableProduct[] = (productRows ?? []).map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    category: p.category,
    stockQuantity: p.stock_quantity,
    costPrice: p.cost_price
  }));

  const recentAdjustments: RecentAdjustment[] = (recentRows ?? []).map((a) => {
    const items = (a.stock_adjustment_items ?? []) as { system_stock: number; counted_stock: number; unit_cost: number }[];
    const impact = items.reduce((sum, i) => sum + (i.counted_stock - i.system_stock) * i.unit_cost, 0);
    return {
      id: a.id,
      label: a.reference_no || `ADJ-${String(a.adjustment_number).padStart(4, "0")}`,
      date: a.adjustment_date,
      impact
    };
  });

  const reasonCounts = new Map<string, number>();
  for (const row of reasonRows ?? []) {
    const key = row.reason || "Other";
    reasonCounts.set(key, (reasonCounts.get(key) ?? 0) + 1);
  }
  const totalReasons = [...reasonCounts.values()].reduce((s, v) => s + v, 0);
  const reasonStats: ReasonStat[] = [...reasonCounts.entries()]
    .map(([reason, count]) => ({ reason, pct: totalReasons > 0 ? Math.round((count / totalReasons) * 100) : 0 }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 4);

  return (
    <StockAdjustmentForm
      locations={locations}
      products={products}
      recentAdjustments={recentAdjustments}
      reasonStats={reasonStats}
    />
  );
}