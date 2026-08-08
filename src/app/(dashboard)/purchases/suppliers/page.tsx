import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import {
  SupplierListView, type SupplierRow, type SupplierKpis, type SupplierOverviewSlice,
  type TopSupplierByValue, type SupplierActivity,
} from "@/components/suppliers/supplier-list-view";
import type { SupplierStatus } from "@/types/database";

export const metadata = { title: "Suppliers · SalesMate ERP" };

const ACTIVITY_LABEL: Record<string, string> = {
  "supplier.created": "New supplier added:",
  "supplier.status_changed": "Status updated for",
  "supplier.imported": "Suppliers imported",
};

export default async function SuppliersPage() {
  const context = await getCurrentOrgContext();
  if (!context) return null;

  const orgId = context.orgId;
  const supabase = createClient();

  const [{ data: suppliers }, { data: purchases }] = await Promise.all([
    supabase.from("suppliers").select("id, name, contact_person, phone, email, category, country, payment_terms, status").eq("org_id", orgId).order("name"),
    supabase.from("purchases").select("supplier_id, total, paid_amount, status, expected_delivery_date, received_at").eq("org_id", orgId),
  ]);

  const rawSuppliers = suppliers ?? [];
  const rawPurchases = purchases ?? [];

  const totalsBySupplier = new Map<string, { total: number; outstanding: number }>();
  for (const p of rawPurchases) {
    if (p.status === "cancelled") continue;
    const entry = totalsBySupplier.get(p.supplier_id) ?? { total: 0, outstanding: 0 };
    entry.total += p.total;
    entry.outstanding += Math.max(0, p.total - p.paid_amount);
    totalsBySupplier.set(p.supplier_id, entry);
  }

  const rows: SupplierRow[] = rawSuppliers.map((s) => {
    const totals = totalsBySupplier.get(s.id) ?? { total: 0, outstanding: 0 };
    return {
      id: s.id,
      name: s.name,
      contactPerson: s.contact_person,
      phone: s.phone,
      email: s.email,
      category: s.category,
      country: s.country,
      paymentTerms: s.payment_terms,
      status: s.status,
      totalPurchases: totals.total,
      outstanding: totals.outstanding,
    };
  });

  const deliverable = rawPurchases.filter((p) => p.expected_delivery_date && p.received_at);
  const onTime = deliverable.filter((p) => new Date(p.received_at!) <= new Date(p.expected_delivery_date!));
  const onTimeDeliveryRate = deliverable.length > 0 ? Math.round((onTime.length / deliverable.length) * 1000) / 10 : null;

  const kpis: SupplierKpis = {
    totalSuppliers: rows.length,
    activeSuppliers: rows.filter((r) => r.status === "active").length,
    totalPurchaseValue: rows.reduce((sum, r) => sum + r.totalPurchases, 0),
    outstandingPayables: rows.reduce((sum, r) => sum + r.outstanding, 0),
    onTimeDeliveryRate,
  };

  const categories = Array.from(new Set(rows.map((r) => r.category).filter(Boolean))) as string[];
  const countries = Array.from(new Set(rows.map((r) => r.country).filter(Boolean))) as string[];

  const statusOrder: SupplierStatus[] = ["active", "inactive", "blacklisted"];
  const overview: SupplierOverviewSlice[] = statusOrder
    .map((status) => ({ status, count: rows.filter((r) => r.status === status).length }))
    .filter((s) => s.count > 0);

  const topSuppliers: TopSupplierByValue[] = [...rows]
    .filter((r) => r.totalPurchases > 0)
    .sort((a, b) => b.totalPurchases - a.totalPurchases)
    .slice(0, 5)
    .map((r) => ({ name: r.name, total: r.totalPurchases }));

  const { data: activityLogs } = await supabase
    .from("audit_logs")
    .select("id, action, entity_id, metadata, created_at")
    .eq("org_id", orgId)
    .eq("entity_type", "suppliers")
    .order("created_at", { ascending: false })
    .limit(6);

  const supplierNameById = new Map(rows.map((r) => [r.id, r.name]));
  const recentActivity: SupplierActivity[] = (activityLogs ?? []).map((l) => {
    const meta = l.metadata as { name?: string; count?: number } | null;
    const supplierName =
      (l.entity_id && supplierNameById.get(l.entity_id)) ??
      meta?.name ??
      (l.action === "supplier.imported" ? `${meta?.count ?? ""} record(s)` : "—");
    return {
      id: l.id,
      label: ACTIVITY_LABEL[l.action] ?? l.action,
      supplierName,
      createdAt: l.created_at,
    };
  });

  return (
    <SupplierListView
      suppliers={rows}
      kpis={kpis}
      currency={context.currency}
      categories={categories}
      countries={countries}
      overview={overview}
      topSuppliers={topSuppliers}
      recentActivity={recentActivity}
    />
  );
}

