import { cookies } from "next/headers";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import {
  StockAdjustmentHistory,
  type AdjustmentRecord,
} from "@/components/inventory/stock-adjustment-history";

export const metadata = {
  title: "Stock Adjustment History · ThinkSales Pro",
};

export default async function StockAdjustmentHistoryPage() {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const supabase = await createClient();

  const [
    { data: adjustmentRows },
    { data: locationRows },
    { data: profileRows },
    { data: productRows },
  ] = await Promise.all([
    supabase
      .from("stock_adjustments")
      .select(`
        id,
        reference_no,
        adjustment_date,
        location_id,
        reason,
        note,
        created_by,
        created_at,
        stock_adjustment_items (
          id,
          product_id,
          system_stock,
          counted_stock,
          unit_cost,
          created_at
        )
      `)
      .eq("org_id", context.orgId)
      .order("created_at", { ascending: false }),
    supabase
      .from("business_locations")
      .select("id, name, is_primary")
      .eq("org_id", context.orgId)
      .eq("is_active", true),
    supabase.from("profiles").select("id, full_name, avatar_url"),
    supabase.from("products").select("id, name, sku, barcode, category, image_urls, cost_price").eq("org_id", context.orgId),
  ]);

  const locationMap = new Map((locationRows ?? []).map((l) => [l.id, l.name]));
  const profileMap = new Map((profileRows ?? []).map((p) => [p.id, p]));
  const productMap = new Map((productRows ?? []).map((p) => [p.id, p]));

  const records: AdjustmentRecord[] = [];

  (adjustmentRows ?? []).forEach((adj) => {
    const locName = adj.location_id ? locationMap.get(adj.location_id) || "Main Branch" : "Main Warehouse";
    const profile = adj.created_by ? profileMap.get(adj.created_by) : null;
    const userName = profile?.full_name || context.orgName || "Daniel Addy";

    const items = (adj as any).stock_adjustment_items ?? [];
    if (items.length === 0) {
      // If adjustment has no items, create a record entry
      const rawDate = adj.adjustment_date || adj.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10);
      records.push({
        id: adj.id,
        referenceNo: adj.reference_no || `ADJ-${adj.id.slice(0, 8)}`,
        dateTime: new Date(adj.created_at || rawDate).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
        rawDate,
        productId: "p-generic",
        productName: "Inventory Adjustment Batch",
        productCategory: "General",
        productImage: null,
        sku: "GEN-ADJ",
        barcode: null,
        branch: locName,
        warehouse: "Main Warehouse",
        adjustmentType: "Stock Count Adjustment",
        reason: adj.reason || "Manual Correction",
        qtyChange: 0,
        unitCost: 0,
        valueImpact: 0,
        userName,
        notes: adj.note,
        adjustmentAccount: "Inventory Adjustment",
      });
    } else {
      items.forEach((item: any) => {
        const prod = productMap.get(item.product_id);
        const qtyDiff = (item.counted_stock ?? 0) - (item.system_stock ?? 0);
        const unitCost = item.unit_cost ?? prod?.cost_price ?? 0;
        const valImpact = qtyDiff * unitCost;
        const rawDate = adj.adjustment_date || adj.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10);

        let adjType: AdjustmentRecord["adjustmentType"] = "Stock Count Adjustment";
        if (qtyDiff > 0) adjType = "Add Stock";
        else if (qtyDiff < 0) adjType = "Reduce Stock";

        records.push({
          id: `${adj.id}-${item.id}`,
          referenceNo: adj.reference_no || `ADJ-${adj.id.slice(0, 8)}`,
          dateTime: new Date(adj.created_at || rawDate).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
          rawDate,
          productId: item.product_id,
          productName: prod?.name || "Inventory Product",
          productCategory: prod?.category || "Electronics",
          productImage: prod?.image_urls?.[0] || null,
          sku: prod?.sku || "SKU-PROD",
          barcode: prod?.barcode || null,
          branch: locName,
          warehouse: "Main Warehouse",
          adjustmentType: adjType,
          reason: adj.reason || (qtyDiff > 0 ? "Stock Count Increase" : "Damaged Item"),
          qtyChange: qtyDiff,
          unitCost,
          valueImpact: valImpact,
          userName,
          notes: adj.note,
          adjustmentAccount: "Inventory Adjustment",
        });
      });
    }
  });

  const branchList = [
    "All Branches",
    ...(locationRows ?? []).map((l) => l.name),
  ];

  return (
    <StockAdjustmentHistory
      initialRecords={records}
      currency={context.currency || "GHS"}
      currentUserName={context.orgName || "Daniel Addy"}
      branches={branchList}
    />
  );
}
