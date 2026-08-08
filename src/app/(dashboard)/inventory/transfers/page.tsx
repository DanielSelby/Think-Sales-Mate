import { cookies } from "next/headers";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { can } from "@/lib/rbac";
import {
  TransferHistory,
  type TransferRow,
  type TransferFilterLocation,
  type TransferFilterProduct
} from "@/components/inventory/transfer-history";

function monthBounds(offset: number) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function pctChange(current: number, previous: number) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

export default async function StockTransferHistoryPage() {
  const activeOrgId = cookies().get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const supabase = createClient();

  const [{ data: transferRows }, { data: itemRows }, { data: locationRows }, { data: productRows }] = await Promise.all([
    supabase
      .from("stock_transfers")
      .select(
        "id, transfer_number, reference_no, status, reason, notes, shipping_charges, transfer_date, created_at, completed_at, created_by, from:from_location_id(id, name), to:to_location_id(id, name)"
      )
      .eq("org_id", context.orgId)
      .order("created_at", { ascending: false }),
    supabase.from("stock_transfer_items").select("transfer_id, product_id, quantity, unit_cost").eq("org_id", context.orgId),
    supabase.from("business_locations").select("id, name, location_type").eq("org_id", context.orgId).order("name"),
    supabase.from("products").select("id, name, sku").eq("org_id", context.orgId).order("name")
  ]);

  // Aggregate items per transfer (products count, total qty, total value).
  const itemsByTransfer = new Map<string, { productCount: Set<string>; totalQty: number; totalValue: number }>();
  for (const item of itemRows ?? []) {
    const agg = itemsByTransfer.get(item.transfer_id) ?? { productCount: new Set<string>(), totalQty: 0, totalValue: 0 };
    agg.productCount.add(item.product_id);
    agg.totalQty += item.quantity;
    agg.totalValue += item.quantity * item.unit_cost;
    itemsByTransfer.set(item.transfer_id, agg);
  }

  // Resolve each distinct requester's email exactly once.
  const distinctUserIds = [...new Set((transferRows ?? []).map((t) => t.created_by).filter(Boolean))];
  const admin = createAdminClient();
  const emailById = new Map<string, string>();
  for (const userId of distinctUserIds) {
    const { data } = await admin.auth.admin.getUserById(userId);
    if (data.user?.email) emailById.set(userId, data.user.email);
  }

  const transfers: TransferRow[] = (transferRows ?? []).map((t) => {
    const from = Array.isArray(t.from) ? t.from[0] : t.from;
    const to = Array.isArray(t.to) ? t.to[0] : t.to;
    const agg = itemsByTransfer.get(t.id) ?? { productCount: new Set(), totalQty: 0, totalValue: 0 };
    return {
      id: t.id,
      label: t.reference_no || `#${String(t.transfer_number).padStart(4, "0")}`,
      status: t.status,
      reason: t.reason,
      notes: t.notes,
      shippingCharges: t.shipping_charges,
      transferDate: t.transfer_date,
      createdAt: t.created_at,
      completedAt: t.completed_at,
      fromLocationId: from?.id ?? "",
      fromLocationName: from?.name ?? "—",
      toLocationId: to?.id ?? "",
      toLocationName: to?.name ?? "—",
      productCount: agg.productCount.size,
      productIds: [...agg.productCount],
      totalQuantity: agg.totalQty,
      totalValue: agg.totalValue,
      requestedByEmail: t.created_by ? emailById.get(t.created_by) ?? "—" : "—"
    };
  });

  // Real month-over-month KPI deltas.
  const thisMonth = monthBounds(0);
  const lastMonth = monthBounds(-1);
  const inRange = (date: string, range: { start: string; end: string }) => date >= range.start && date < range.end;

  const thisMonthTransfers = transfers.filter((t) => inRange(t.transferDate, thisMonth));
  const lastMonthTransfers = transfers.filter((t) => inRange(t.transferDate, lastMonth));

  const kpis = {
    total: { value: transfers.length, change: pctChange(thisMonthTransfers.length, lastMonthTransfers.length) },
    completed: {
      value: transfers.filter((t) => t.status === "completed").length,
      change: pctChange(
        thisMonthTransfers.filter((t) => t.status === "completed").length,
        lastMonthTransfers.filter((t) => t.status === "completed").length
      )
    },
    pending: {
      value: transfers.filter((t) => t.status === "pending" || t.status === "in_transit").length,
      change: pctChange(
        thisMonthTransfers.filter((t) => t.status === "pending" || t.status === "in_transit").length,
        lastMonthTransfers.filter((t) => t.status === "pending" || t.status === "in_transit").length
      )
    },
    cancelled: {
      value: transfers.filter((t) => t.status === "cancelled").length,
      change: pctChange(
        thisMonthTransfers.filter((t) => t.status === "cancelled").length,
        lastMonthTransfers.filter((t) => t.status === "cancelled").length
      )
    },
    totalQuantity: {
      value: transfers.filter((t) => t.status !== "cancelled").reduce((s, t) => s + t.totalQuantity, 0),
      change: pctChange(
        thisMonthTransfers.filter((t) => t.status !== "cancelled").reduce((s, t) => s + t.totalQuantity, 0),
        lastMonthTransfers.filter((t) => t.status !== "cancelled").reduce((s, t) => s + t.totalQuantity, 0)
      )
    },
    totalValue: {
      value: transfers.filter((t) => t.status !== "cancelled").reduce((s, t) => s + t.totalValue, 0),
      change: pctChange(
        thisMonthTransfers.filter((t) => t.status !== "cancelled").reduce((s, t) => s + t.totalValue, 0),
        lastMonthTransfers.filter((t) => t.status !== "cancelled").reduce((s, t) => s + t.totalValue, 0)
      )
    }
  };

  const locations: TransferFilterLocation[] = (locationRows ?? []).map((l) => ({ id: l.id, name: l.name, type: l.location_type }));
  const products: TransferFilterProduct[] = (productRows ?? []).map((p) => ({ id: p.id, name: p.name, sku: p.sku }));

  return (
    <TransferHistory
      transfers={transfers}
      kpis={kpis}
      locations={locations}
      products={products}
      canManage={can(context.role, "inventory.manage")}
    />
  );
}