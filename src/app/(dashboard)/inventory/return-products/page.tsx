import { notFound } from "next/navigation";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canPermission } from "@/lib/rbac/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { ReturnProductsManagement, type ReturnProductRow, type ReturnConsolidationRow } from "@/components/inventory/return-products/return-products-management";

export default async function ReturnProductsPage() {
  const context = await getCurrentOrgContext();
  if (!context || !await canPermission("inventory", "view")) notFound();

  const admin = createAdminClient();
  let returnsQuery = admin
    .from("branch_product_returns")
    .select("*")
    .eq("org_id", context.orgId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (context.isBranchScoped) {
    returnsQuery = returnsQuery.in("source_location_id", context.allowedLocationIds);
  }

  const { data: returnHeaders, error: returnsError } = await returnsQuery;
  if (returnsError) throw new Error(`Could not load branch returns: ${returnsError.message}`);
  const headers = returnHeaders ?? [];
  const returnIds = headers.map((row) => row.id);
  const requesterIds = [...new Set(headers.map((row) => row.requested_by))];
  const [{ data: locations, error: locationsError }, { data: itemRows, error: itemsError }, { data: requesters, error: requestersError }] = await Promise.all([
    admin.from("business_locations").select("id, name").eq("org_id", context.orgId),
    returnIds.length
      ? admin.from("branch_product_return_items").select("*").eq("org_id", context.orgId).in("return_id", returnIds).order("created_at", { ascending: true }).limit(2000)
      : Promise.resolve({ data: [], error: null }),
    requesterIds.length ? admin.from("profiles").select("id, full_name").in("id", requesterIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (locationsError) throw new Error(`Could not load return locations: ${locationsError.message}`);
  if (itemsError) throw new Error(`Could not load return line items: ${itemsError.message}`);
  if (requestersError) throw new Error(`Could not load return requesters: ${requestersError.message}`);

  const productIds = [...new Set((itemRows ?? []).map((row) => row.product_id))];
  const supplierIds = [...new Set((itemRows ?? []).map((row) => row.supplier_id).filter((id): id is string => Boolean(id)))];
  const purchaseIds = [...new Set((itemRows ?? []).map((row) => row.purchase_id).filter((id): id is string => Boolean(id)))];
  const [{ data: products, error: productsError }, { data: suppliers, error: suppliersError }, { data: purchases, error: purchasesError }] = await Promise.all([
    productIds.length ? admin.from("products").select("id, name, sku").in("id", productIds) : Promise.resolve({ data: [], error: null }),
    supplierIds.length ? admin.from("suppliers").select("id, name").in("id", supplierIds) : Promise.resolve({ data: [], error: null }),
    purchaseIds.length ? admin.from("purchases").select("id, purchase_number, invoice_number, reference").in("id", purchaseIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (productsError) throw new Error(`Could not load return products: ${productsError.message}`);
  if (suppliersError) throw new Error(`Could not load return suppliers: ${suppliersError.message}`);
  if (purchasesError) throw new Error(`Could not load purchase references: ${purchasesError.message}`);

  const headerById = new Map(headers.map((row) => [row.id, row]));
  const locationById = new Map((locations ?? []).map((row) => [row.id, row.name]));
  const requesterById = new Map((requesters ?? []).map((row) => [row.id, row.full_name]));
  const productById = new Map((products ?? []).map((row) => [row.id, row]));
  const supplierById = new Map((suppliers ?? []).map((row) => [row.id, row.name]));
  const purchaseById = new Map((purchases ?? []).map((row) => [row.id, row]));
  const items = itemRows ?? [];
  const rows: ReturnProductRow[] = items.flatMap((item) => {
    const parent = headerById.get(item.return_id);
    if (!parent) return [];
    const product = productById.get(item.product_id);
    const purchase = item.purchase_id ? purchaseById.get(item.purchase_id) : null;
    return [{
      id: item.id,
      returnId: parent.id,
      returnNumber: parent.return_number,
      returnDate: parent.return_date,
      createdAt: parent.created_at,
      status: parent.status,
      isConsolidated: false,
      branchId: parent.source_location_id,
      branchName: locationById.get(parent.source_location_id) ?? "Unknown branch",
      requestedBy: requesterById.get(parent.requested_by) ?? "Organization member",
      destinationName: locationById.get(parent.destination_location_id) ?? "Unknown returns office",
      productId: item.product_id,
      productName: product?.name ?? "Unknown product",
      sku: product?.sku ?? "",
      quantity: item.return_qty,
      unitCost: item.unit_cost,
      returnValue: item.return_value,
      condition: item.condition,
      reason: item.return_reason,
      supplierId: item.supplier_id,
      supplierName: item.supplier_id ? supplierById.get(item.supplier_id) ?? "Unknown supplier" : null,
      purchaseId: item.purchase_id,
      purchaseReference: purchase ? purchase.invoice_number || purchase.reference || `PO-${purchase.purchase_number}` : null,
      originalTransferId: item.original_transfer_id,
    }];
  });

  let consolidations: ReturnConsolidationRow[] = [];
  if (!context.isBranchScoped && await canPermission("inventory", "approve")) {
    const { data: consolidationRows, error: consolidationsError } = await admin
      .from("branch_product_return_consolidations")
      .select("*")
      .eq("org_id", context.orgId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (consolidationsError) throw new Error(`Could not load return consolidations: ${consolidationsError.message}`);
    const consolidationList = consolidationRows ?? [];
    const consolidationIds = consolidationList.map((row) => row.id);
    const purchaseReturnIds = consolidationList.map((row) => row.purchase_return_id).filter((id): id is string => Boolean(id));
    const [{ data: links, error: linksError }, { data: suppliersForGroups, error: groupSuppliersError }, { data: purchaseReturns, error: purchaseReturnsError }] = await Promise.all([
      consolidationIds.length
        ? admin.from("branch_product_return_consolidation_items").select("consolidation_id, return_item_id").in("consolidation_id", consolidationIds)
        : Promise.resolve({ data: [], error: null }),
      admin.from("suppliers").select("id, name, phone, email").eq("org_id", context.orgId),
      purchaseReturnIds.length
        ? admin.from("purchase_returns").select("id, status").in("id", purchaseReturnIds).eq("org_id", context.orgId)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (linksError) throw new Error(`Could not load consolidated return items: ${linksError.message}`);
    if (groupSuppliersError) throw new Error(`Could not load supplier contact information: ${groupSuppliersError.message}`);
    if (purchaseReturnsError) throw new Error(`Could not load Purchase Return status: ${purchaseReturnsError.message}`);
    const rowById = new Map(rows.map((row) => [row.id, row]));
    const consolidatedItemIds = new Set((links ?? []).map((link) => link.return_item_id));
    for (const row of rows) row.isConsolidated = consolidatedItemIds.has(row.id);
    const supplierDetails = new Map((suppliersForGroups ?? []).map((row) => [row.id, row]));
    const purchaseReturnById = new Map((purchaseReturns ?? []).map((row) => [row.id, row]));
    consolidations = consolidationList.map((group) => {
      const groupItems = (links ?? [])
        .filter((link) => link.consolidation_id === group.id)
        .map((link) => rowById.get(link.return_item_id))
        .filter((row): row is ReturnProductRow => Boolean(row));
      const supplier = supplierDetails.get(group.supplier_id);
      const purchase = purchaseById.get(group.purchase_id);
      return {
        id: group.id,
        number: group.consolidation_number,
        supplierName: supplier?.name ?? "Unknown supplier",
        supplierPhone: supplier?.phone ?? null,
        supplierEmail: supplier?.email ?? null,
        purchaseReference: purchase ? purchase.invoice_number || purchase.reference || `PO-${purchase.purchase_number}` : "—",
        status: group.status,
        createdAt: group.created_at,
        purchaseReturnId: group.purchase_return_id,
        purchaseReturnStatus: group.purchase_return_id ? purchaseReturnById.get(group.purchase_return_id)?.status ?? null : null,
        acceptedQuantity: group.supplier_accepted_qty,
        rejectedQuantity: group.supplier_rejected_qty,
        responseNotes: group.supplier_response_notes,
        totalQuantity: groupItems.reduce((sum, row) => sum + row.quantity, 0),
        totalValue: groupItems.reduce((sum, row) => sum + row.returnValue, 0),
        itemIds: groupItems.map((row) => row.id),
        outcomeItems: groupItems.map((row) => ({ id: row.id, productName: row.productName, quantity: row.quantity })),
        conditions: [...new Set(groupItems.map((row) => row.condition))],
        reasons: [...new Set(groupItems.map((row) => row.reason))],
        branches: [...new Set(groupItems.map((row) => row.branchName))],
        productSummary: [...new Set(groupItems.map((row) => row.productName))].join(", "),
      };
    });
  }

  const kpis = {
    pendingBranchReturns: headers.filter((row) => row.status === "pending_review").length,
    totalUnitsReturned: items.reduce((sum, row) => sum + row.return_qty, 0),
    totalReturnValue: items.reduce((sum, row) => sum + Number(row.return_value), 0),
    pendingIdentification: headers.filter((row) => row.status === "pending_identification").length,
    consolidatedReturns: consolidations.length,
    supplierReturnsIssued: consolidations.filter((row) => row.purchaseReturnId).length,
  };
  const canManage = !context.isBranchScoped && await canPermission("inventory", "approve");
  const canCreateSupplierReturn = !context.isBranchScoped && await canPermission("purchases", "create");
  const canRecordSupplierOutcome = !context.isBranchScoped && await canPermission("purchases", "approve");

  return (
    <ReturnProductsManagement
      rows={rows}
      consolidations={consolidations}
      kpis={kpis}
      currency={context.currency || "GHS"}
      canCreate={await canPermission("inventory", "create")}
      canManage={canManage}
      canCreateSupplierReturn={canCreateSupplierReturn}
      canRecordSupplierOutcome={canRecordSupplierOutcome}
    />
  );
}
