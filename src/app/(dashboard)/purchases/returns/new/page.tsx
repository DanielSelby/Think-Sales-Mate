import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import {
  PurchaseReturnForm, type ReturnOverviewSlice, type TopSupplierByReturnValue, type RecentReturn,
} from "@/components/purchase-returns/purchase-return-form";

export const metadata = { title: "Purchase Return · SalesMate ERP" };

export default async function NewPurchaseReturnPage() {
  const context = await getCurrentOrgContext();
  if (!context) return null;

  const orgId = context.orgId;
  const supabase = await createClient();

  const [{ data: locations }, { data: bankAccounts }, { data: returnItems }, { data: returns }] = await Promise.all([
    supabase.from("business_locations").select("id, name").eq("org_id", orgId).eq("is_active", true),
    supabase.from("bank_accounts").select("id, name").eq("org_id", orgId),
    supabase.from("purchase_return_items").select("return_reason, org_id").eq("org_id", orgId),
    supabase
      .from("purchase_returns")
      .select("id, return_number, return_reason, total_return_value, created_at, supplier:suppliers ( name )")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const reasonCounts = new Map<string, number>();
  for (const item of returnItems ?? []) {
    const reason = item.return_reason ?? "Other";
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  }
  const overview: ReturnOverviewSlice[] = Array.from(reasonCounts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const supplierTotals = new Map<string, number>();
  for (const r of returns ?? []) {
    const name = (r.supplier as { name: string } | null)?.name ?? "Unknown supplier";
    supplierTotals.set(name, (supplierTotals.get(name) ?? 0) + r.total_return_value);
  }
  const topSuppliers: TopSupplierByReturnValue[] = Array.from(supplierTotals.entries())
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const recentReturns: RecentReturn[] = (returns ?? []).slice(0, 5).map((r) => ({
    id: r.id,
    returnNumber: r.return_number,
    reason: r.return_reason ?? "—",
    createdAt: r.created_at,
  }));

  return (
    <PurchaseReturnForm
      locations={(locations ?? []).map((l) => ({ id: l.id, name: l.name }))}
      bankAccounts={(bankAccounts ?? []).map((a) => ({ id: a.id, name: a.name }))}
      currency={context.currency}
      overview={overview}
      topSuppliers={topSuppliers}
      recentReturns={recentReturns}
    />
  );
}