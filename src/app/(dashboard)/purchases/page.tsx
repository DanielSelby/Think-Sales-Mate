import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { derivePaymentStatus } from "@/lib/sales/format";
import {
  PurchaseListView, type PurchaseRow, type PurchaseKpis, type AnalyticsSlice,
  type TopSupplier, type CategoryBreakdown, type RecentActivity,
} from "@/components/purchases/purchase-list-view";
import type { PurchaseStatus } from "@/types/database";

export const metadata = { title: "Purchases · SalesMate ERP" };

const ACTIVITY_LABEL: Record<string, string> = {
  "purchase.created": "New purchase order",
  "purchase.items_received": "Items received for",
  "purchase.duplicated": "Duplicated as",
  "purchase.payment_recorded": "Payment recorded for",
};

export default async function PurchasesPage({ searchParams }: { searchParams?: { location?: string } }) {
  const context = await getCurrentOrgContext();
  if (!context) return null;

  const orgId = context.orgId;
  const supabase = await createClient();

  const locationId = searchParams?.location && searchParams.location !== "all" ? searchParams.location : null;
  let purchasesQuery = supabase
      .from("purchases")
      .select(`
        id, purchase_number, purchase_date, invoice_number, total, paid_amount, status, created_by,
        created_at, expected_delivery_date,
        supplier:suppliers ( name ),
        location:business_locations ( name )
      `)
      .eq("org_id", orgId)
      // purchase_date is a DATE column, so several purchases can share the
      // same date — order by created_at as a tiebreaker so a brand-new
      // purchase always sorts to the top instead of landing wherever
      // Postgres happens to put ties.
      .order("purchase_date", { ascending: false })
      .order("created_at", { ascending: false });
  if (locationId) purchasesQuery = purchasesQuery.eq("location_id", locationId);

  const [{ data: purchases }, { data: suppliers }, { data: locations }] = await Promise.all([
    purchasesQuery,
    supabase.from("suppliers").select("id, name").eq("org_id", orgId).eq("is_active", true),
    supabase.from("business_locations").select("id, name").eq("org_id", orgId).eq("is_active", true),
  ]);

  const rawPurchases = purchases ?? [];

  // Line items — used for product-count/preview column and category breakdown
  const { data: allItems } = await supabase
    .from("purchase_items")
    .select("purchase_id, quantity, line_total, product:products ( name, category )")
    .eq("org_id", orgId);

  const itemsByPurchase = new Map<string, { name: string; category: string | null }[]>();
  const categoryTotals = new Map<string, number>();
  for (const item of allItems ?? []) {
    const product = item.product as { name: string; category: string | null } | null;
    const list = itemsByPurchase.get(item.purchase_id) ?? [];
    list.push({ name: product?.name ?? "Unknown product", category: product?.category ?? null });
    itemsByPurchase.set(item.purchase_id, list);

    const category = product?.category ?? "Uncategorized";
    categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + item.line_total);
  }

  // Staff names — created_by has no declared FK to profiles, resolve separately
  const creatorIds = Array.from(new Set(rawPurchases.map((p) => p.created_by).filter(Boolean)));
  const { data: staff } = creatorIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", creatorIds)
    : { data: [] as { id: string; full_name: string | null }[] };
  const staffNameById = new Map((staff ?? []).map((s) => [s.id, s.full_name ?? "Unknown"]));

  const today = new Date();
  const rows: PurchaseRow[] = rawPurchases.map((p) => {
    const items = itemsByPurchase.get(p.id) ?? [];
    return {
      id: p.id,
      purchaseNumber: p.purchase_number,
      date: p.purchase_date,
      createdAt: p.created_at,
      invoiceNumber: p.invoice_number,
      supplierName: (p.supplier as { name: string } | null)?.name ?? "Unknown supplier",
      locationName: (p.location as { name: string } | null)?.name ?? "—",
      itemCount: items.length,
      primaryProductName: items[0]?.name ?? null,
      total: p.total,
      paidAmount: p.paid_amount,
      paymentStatus: derivePaymentStatus(p.total, p.paid_amount),
      status: p.status,
      createdByName: staffNameById.get(p.created_by) ?? "—",
      expectedDeliveryDate: p.expected_delivery_date,
    };
  });

  const kpis: PurchaseKpis = {
    totalPurchases: rows.length,
    totalValue: rows.reduce((sum, r) => sum + r.total, 0),
    pendingOrders: rows.filter((r) => r.status === "ordered" || r.status === "partially_received").length,
    receivedOrders: rows.filter((r) => r.status === "received").length,
    overdueDeliveries: rows.filter(
      (r) => r.expectedDeliveryDate && new Date(r.expectedDeliveryDate) < today && r.status !== "received" && r.status !== "cancelled"
    ).length,
    outstandingPayments: rows
      .filter((r) => r.status !== "cancelled")
      .reduce((sum, r) => sum + Math.max(0, r.total - r.paidAmount), 0),
  };

  const statusOrder: PurchaseStatus[] = ["received", "partially_received", "ordered", "draft", "cancelled"];
  const overview: AnalyticsSlice[] = statusOrder
    .map((status) => ({ status, count: rows.filter((r) => r.status === status).length }))
    .filter((s) => s.count > 0);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const supplierTotals = new Map<string, number>();
  for (const r of rows) {
    if (new Date(r.date) < monthStart) continue;
    supplierTotals.set(r.supplierName, (supplierTotals.get(r.supplierName) ?? 0) + r.total);
  }
  const topSuppliers: TopSupplier[] = Array.from(supplierTotals.entries())
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const categories: CategoryBreakdown[] = Array.from(categoryTotals.entries())
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const { data: activityLogs } = await supabase
    .from("audit_logs")
    .select("id, action, entity_id, actor_id, created_at")
    .eq("org_id", orgId)
    .eq("entity_type", "purchases")
    .order("created_at", { ascending: false })
    .limit(6);

  const activityPurchaseIds = Array.from(new Set((activityLogs ?? []).map((l) => l.entity_id).filter(Boolean))) as string[];
  const purchaseNumberById = new Map(rows.map((r) => [r.id, r.purchaseNumber]));
  const missingIds = activityPurchaseIds.filter((id) => !purchaseNumberById.has(id));
  if (missingIds.length) {
    const { data: extra } = await supabase.from("purchases").select("id, purchase_number").in("id", missingIds);
    for (const e of extra ?? []) purchaseNumberById.set(e.id, e.purchase_number);
  }

  const activityActorIds = Array.from(new Set((activityLogs ?? []).map((l) => l.actor_id).filter(Boolean))) as string[];
  const activityStaffMissing = activityActorIds.filter((id) => !staffNameById.has(id));
  if (activityStaffMissing.length) {
    const { data: extraStaff } = await supabase.from("profiles").select("id, full_name").in("id", activityStaffMissing);
    for (const s of extraStaff ?? []) staffNameById.set(s.id, s.full_name ?? "Unknown");
  }

  const recentActivity: RecentActivity[] = (activityLogs ?? [])
    .filter((l) => l.entity_id && purchaseNumberById.has(l.entity_id))
    .map((l) => ({
      id: l.id,
      label: ACTIVITY_LABEL[l.action] ?? l.action,
      purchaseNumber: purchaseNumberById.get(l.entity_id!)!,
      actorName: l.actor_id ? staffNameById.get(l.actor_id) ?? "Unknown" : "System",
      createdAt: l.created_at,
    }));

  return (
    <PurchaseListView
      purchases={rows}
      kpis={kpis}
      currency={context.currency}
      suppliers={(suppliers ?? []).map((s) => s.name)}
      locations={(locations ?? []).map((l) => l.name)}
      initialLocation={locationId ? (locations ?? []).find((l) => l.id === locationId)?.name ?? "all" : "all"}
      overview={overview}
      topSuppliers={topSuppliers}
      categories={categories}
      recentActivity={recentActivity}
    />
  );
}