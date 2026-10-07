import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canPermission } from "@/lib/rbac/permissions";
import { ReturnProductsReport, type ReturnReportRow } from "@/components/inventory/return-products/return-products-report";

export default async function ReturnProductsReportPage() {
  const context = await getCurrentOrgContext();
  if (!context || !await canPermission("inventory", "view")) notFound();
  const admin = createAdminClient();
  let headersQuery = admin.from("branch_product_returns").select("id, return_number, return_date, source_location_id, status, return_reason, created_by")
    .eq("org_id", context.orgId).order("return_date", { ascending: false }).limit(2000);
  if (context.isBranchScoped) headersQuery = headersQuery.in("source_location_id", context.allowedLocationIds);
  const { data: headers, error: headersError } = await headersQuery;
  if (headersError) throw new Error(`Could not load return report: ${headersError.message}`);
  const returnIds = (headers ?? []).map((row) => row.id);
  const [{ data: items, error: itemsError }, { data: locations, error: locationsError }, { data: groups, error: groupsError }] = await Promise.all([
    returnIds.length ? admin.from("branch_product_return_items").select("*").eq("org_id", context.orgId).in("return_id", returnIds).limit(10000) : Promise.resolve({ data: [], error: null }),
    admin.from("business_locations").select("id, name").eq("org_id", context.orgId),
    !context.isBranchScoped ? admin.from("branch_product_return_consolidations").select("id, supplier_id, status, supplier_accepted_qty, supplier_rejected_qty").eq("org_id", context.orgId) : Promise.resolve({ data: [], error: null }),
  ]);
  if (itemsError) throw new Error(`Could not load return report items: ${itemsError.message}`);
  if (locationsError) throw new Error(`Could not load report locations: ${locationsError.message}`);
  if (groupsError) throw new Error(`Could not load supplier outcome data: ${groupsError.message}`);
  const productIds = [...new Set((items ?? []).map((item) => item.product_id))];
  const supplierIds = [...new Set((items ?? []).map((item) => item.supplier_id).filter((id): id is string => Boolean(id)))];
  const [{ data: products, error: productsError }, { data: suppliers, error: suppliersError }] = await Promise.all([
    productIds.length ? admin.from("products").select("id, name, sku").in("id", productIds) : Promise.resolve({ data: [], error: null }),
    supplierIds.length ? admin.from("suppliers").select("id, name").in("id", supplierIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (productsError) throw new Error(`Could not load report products: ${productsError.message}`);
  if (suppliersError) throw new Error(`Could not load report suppliers: ${suppliersError.message}`);
  const itemIds = (items ?? []).map((item) => item.id);
  const { data: consolidationLinks, error: consolidationLinksError } = itemIds.length
    ? await admin.from("branch_product_return_consolidation_items").select("return_item_id, consolidation_id").in("return_item_id", itemIds)
    : { data: [], error: null };
  if (consolidationLinksError) throw new Error(`Could not load consolidation references: ${consolidationLinksError.message}`);
  const consolidationIds = [...new Set((consolidationLinks ?? []).map((link) => link.consolidation_id))];
  const { data: consolidationRows, error: consolidationError } = consolidationIds.length
    ? await admin.from("branch_product_return_consolidations").select("id, consolidation_number, purchase_return_id").in("id", consolidationIds).eq("org_id", context.orgId)
    : { data: [], error: null };
  if (consolidationError) throw new Error(`Could not load supplier return references: ${consolidationError.message}`);
  const purchaseReturnIds = [...new Set((consolidationRows ?? []).map((group) => group.purchase_return_id).filter((id): id is string => Boolean(id)))];
  const { data: purchaseReturnRows, error: purchaseReturnsError } = purchaseReturnIds.length
    ? await admin.from("purchase_returns").select("id, return_number").in("id", purchaseReturnIds).eq("org_id", context.orgId)
    : { data: [], error: null };
  if (purchaseReturnsError) throw new Error(`Could not load supplier-return document numbers: ${purchaseReturnsError.message}`);
  const headerById = new Map((headers ?? []).map((row) => [row.id, row]));
  const locationById = new Map((locations ?? []).map((row) => [row.id, row.name]));
  const productById = new Map((products ?? []).map((row) => [row.id, row]));
  const supplierById = new Map((suppliers ?? []).map((row) => [row.id, row.name]));
  const consolidationById = new Map((consolidationRows ?? []).map((row) => [row.id, row]));
  const purchaseReturnById = new Map((purchaseReturnRows ?? []).map((row) => [row.id, row]));
  const consolidationByItemId = new Map((consolidationLinks ?? []).map((link) => [link.return_item_id, consolidationById.get(link.consolidation_id)]));
  const reportRows: ReturnReportRow[] = (items ?? []).flatMap((item) => {
    const header = headerById.get(item.return_id);
    if (!header) return [];
    const product = productById.get(item.product_id);
    const consolidation = consolidationByItemId.get(item.id);
    const purchaseReturn = consolidation?.purchase_return_id ? purchaseReturnById.get(consolidation.purchase_return_id) : null;
    return [{
      returnId: header.id,
      returnNumber: header.return_number,
      date: header.return_date,
      branch: locationById.get(header.source_location_id) ?? "Unknown branch",
      product: product?.name ?? "Unknown product",
      sku: product?.sku ?? "",
      quantity: item.return_qty,
      unitCost: item.unit_cost,
      value: item.return_value,
      reason: item.return_reason || header.return_reason,
      condition: item.condition,
      supplier: item.supplier_id ? supplierById.get(item.supplier_id) ?? "Unknown supplier" : "Pending identification",
      status: header.status,
      consolidation: consolidation ? `CON-${String(consolidation.consolidation_number).padStart(6, "0")}` : null,
      supplierReturnNumber: purchaseReturn ? `PR-${String(purchaseReturn.return_number).padStart(4, "0")}` : null,
    }];
  });
  const supplierStats = (groups ?? []).reduce((stats, group) => {
    const current = stats.get(group.status) ?? { accepted: 0, rejected: 0 };
    current.accepted += group.supplier_accepted_qty ?? 0;
    current.rejected += group.supplier_rejected_qty ?? 0;
    stats.set(group.status, current);
    return stats;
  }, new Map<string, { accepted: number; rejected: number }>());
  const acceptedQty = [...supplierStats.values()].reduce((sum, row) => sum + row.accepted, 0);
  const rejectedQty = [...supplierStats.values()].reduce((sum, row) => sum + row.rejected, 0);

  return <ReturnProductsReport rows={reportRows} currency={context.currency || "GHS"} acceptedQty={acceptedQty} rejectedQty={rejectedQty} />;
}
