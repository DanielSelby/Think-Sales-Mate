import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccessLocation } from "@/lib/organizations/location-access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canPermission } from "@/lib/rbac/permissions";
import { BranchProductReturnDetails, type ReturnDetailData } from "@/components/inventory/return-products/branch-product-return-details";

export default async function BranchProductReturnDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getCurrentOrgContext();
  if (!context || !await canPermission("inventory", "view")) notFound();
  const canManage = !context.isBranchScoped && await canPermission("inventory", "approve");
  const canAttach = await canPermission("inventory", "create") || canManage;

  const admin = createAdminClient();
  const { data: header, error: headerError } = await admin
    .from("branch_product_returns")
    .select("*")
    .eq("id", id)
    .eq("org_id", context.orgId)
    .maybeSingle();
  if (headerError) throw new Error(`Could not load return: ${headerError.message}`);
  if (!header || !canAccessLocation(context, header.source_location_id)) notFound();

  const [{ data: itemRows, error: itemsError }, { data: locationRows, error: locationsError }, { data: attachmentRows, error: attachmentsError }, { data: requester, error: requesterError }] = await Promise.all([
    admin.from("branch_product_return_items").select("*").eq("return_id", header.id).eq("org_id", context.orgId).order("created_at"),
    admin.from("business_locations").select("id, name").eq("org_id", context.orgId),
    admin.from("branch_product_return_attachments").select("id, file_name, storage_path, content_type, file_size, created_at").eq("return_id", header.id).eq("org_id", context.orgId).order("created_at", { ascending: true }),
    admin.from("profiles").select("id, full_name").eq("id", header.requested_by).maybeSingle(),
  ]);
  if (itemsError) throw new Error(`Could not load return items: ${itemsError.message}`);
  if (locationsError) throw new Error(`Could not load return locations: ${locationsError.message}`);
  if (attachmentsError) throw new Error(`Could not load return attachments: ${attachmentsError.message}`);
  if (requesterError) throw new Error(`Could not load return requester: ${requesterError.message}`);
  const items = itemRows ?? [];
  const itemIds = items.map((item) => item.id);
  const { data: consolidationLinks, error: consolidationLinksError } = itemIds.length
    ? await admin.from("branch_product_return_consolidation_items").select("consolidation_id").eq("org_id", context.orgId).in("return_item_id", itemIds)
    : { data: [], error: null };
  if (consolidationLinksError) throw new Error(`Could not load return consolidation history: ${consolidationLinksError.message}`);
  const auditEntityIds = [...new Set([header.id, ...itemIds, ...(consolidationLinks ?? []).map((link) => link.consolidation_id)])];
  const { data: logs, error: logsError } = await admin
    .from("audit_logs")
    .select("id, actor_id, action, entity_id, created_at, metadata")
    .eq("org_id", context.orgId)
    .in("entity_type", ["branch_product_returns", "branch_product_return_items", "branch_product_return_consolidations"])
    .in("entity_id", auditEntityIds)
    .order("created_at", { ascending: true });
  if (logsError) throw new Error(`Could not load return history: ${logsError.message}`);
  const attachmentPaths = (attachmentRows ?? []).map((row) => row.storage_path);
  const { data: signedUrls, error: signedUrlError } = attachmentPaths.length
    ? await admin.storage.from("branch-return-attachments").createSignedUrls(attachmentPaths, 60 * 60)
    : { data: [], error: null };
  if (signedUrlError) throw new Error(`Could not create return attachment links: ${signedUrlError.message}`);
  const signedUrlByPath = new Map((signedUrls ?? []).map((row) => [row.path, row.signedUrl]));
  const productIds = [...new Set(items.map((item) => item.product_id))];
  const purchaseItemIds = [...new Set(items.map((item) => item.purchase_item_id).filter((value): value is string => Boolean(value)))];
  const purchaseIds = [...new Set(items.map((item) => item.purchase_id).filter((value): value is string => Boolean(value)))];
  const [{ data: products, error: productsError }, { data: matchedPurchaseLines, error: matchedLinesError }, { data: matchedPurchases, error: matchedPurchasesError }, { data: suppliers, error: suppliersError }] = await Promise.all([
    productIds.length ? admin.from("products").select("id, name, sku").in("id", productIds) : Promise.resolve({ data: [], error: null }),
    purchaseItemIds.length ? admin.from("purchase_items").select("id, purchase_id, product_id, quantity_received, unit_price").in("id", purchaseItemIds) : Promise.resolve({ data: [], error: null }),
    purchaseIds.length ? admin.from("purchases").select("id, purchase_number, purchase_date, invoice_number, reference, supplier_id, status").in("id", purchaseIds) : Promise.resolve({ data: [], error: null }),
    admin.from("suppliers").select("id, name, phone, email").eq("org_id", context.orgId),
  ]);
  if (productsError) throw new Error(`Could not load return products: ${productsError.message}`);
  if (matchedLinesError) throw new Error(`Could not load matched purchase lines: ${matchedLinesError.message}`);
  if (matchedPurchasesError) throw new Error(`Could not load matched purchases: ${matchedPurchasesError.message}`);
  if (suppliersError) throw new Error(`Could not load return suppliers: ${suppliersError.message}`);

  const eligiblePurchases = canManage && productIds.length
    ? await admin.from("purchases").select("id, purchase_number, purchase_date, invoice_number, reference, supplier_id, status")
      .eq("org_id", context.orgId)
      .in("status", ["received", "partially_received"])
      .order("purchase_date", { ascending: false })
      .limit(500)
    : { data: [], error: null };
  if (eligiblePurchases.error) throw new Error(`Could not search purchase history: ${eligiblePurchases.error.message}`);
  const candidatePurchaseIds = (eligiblePurchases.data ?? []).map((purchase) => purchase.id);
  const candidateLines = canManage && candidatePurchaseIds.length && productIds.length
    ? await admin.from("purchase_items").select("id, purchase_id, product_id, quantity_received, unit_price, created_at")
      .in("purchase_id", candidatePurchaseIds)
      .in("product_id", productIds)
      .order("created_at", { ascending: false })
    : { data: [], error: null };
  if (candidateLines.error) throw new Error(`Could not match purchase history: ${candidateLines.error.message}`);

  const purchaseById = new Map([...(matchedPurchases ?? []), ...(eligiblePurchases.data ?? [])].map((purchase) => [purchase.id, purchase]));
  const supplierById = new Map((suppliers ?? []).map((supplier) => [supplier.id, supplier]));
  const locationById = new Map((locationRows ?? []).map((location) => [location.id, location.name]));
  const productById = new Map((products ?? []).map((product) => [product.id, product]));
  const matchedLineById = new Map((matchedPurchaseLines ?? []).map((line) => [line.id, line]));
  const candidateLineRows = candidateLines.data ?? [];
  const candidates = new Map<string, ReturnDetailData["items"][number]["purchaseMatches"]>();
  for (const line of candidateLineRows) {
    const purchase = purchaseById.get(line.purchase_id);
    if (!purchase) continue;
    const supplier = supplierById.get(purchase.supplier_id);
    const list = candidates.get(line.product_id) ?? [];
    list.push({
      purchaseItemId: line.id,
      purchaseId: purchase.id,
      supplierId: purchase.supplier_id,
      supplierName: supplier?.name ?? "Unknown supplier",
      purchaseNumber: purchase.purchase_number,
      purchaseReference: purchase.invoice_number || purchase.reference || `PO-${purchase.purchase_number}`,
      purchaseDate: purchase.purchase_date,
      unitCost: Number(line.unit_price),
      quantity: Number(line.quantity_received),
    });
    candidates.set(line.product_id, list);
  }

  const returnItems: ReturnDetailData["items"] = items.map((item) => {
    const matchedLine = item.purchase_item_id ? matchedLineById.get(item.purchase_item_id) : null;
    const purchase = item.purchase_id ? purchaseById.get(item.purchase_id) : null;
    const supplier = item.supplier_id ? supplierById.get(item.supplier_id) : null;
    return {
      id: item.id,
      productId: item.product_id,
      productName: productById.get(item.product_id)?.name ?? "Unknown product",
      sku: productById.get(item.product_id)?.sku ?? "",
      quantity: item.return_qty,
      unitCost: item.unit_cost,
      value: item.return_value,
      condition: item.condition,
      reason: item.return_reason,
      inspectionNotes: item.inspection_notes,
      originalTransferId: item.original_transfer_id,
      supplierId: item.supplier_id,
      supplierName: supplier?.name ?? null,
      purchaseItemId: item.purchase_item_id,
      purchaseReference: purchase ? purchase.invoice_number || purchase.reference || `PO-${purchase.purchase_number}` : null,
      purchaseUnitCost: matchedLine ? Number(matchedLine.unit_price) : null,
      purchaseMatches: candidates.get(item.product_id) ?? [],
    };
  });
  const relevantLogs = (logs ?? []).filter((log) => log.entity_id === header.id || items.some((item) => item.id === log.entity_id));
  const auditEvents = relevantLogs.map((log) => ({
    id: log.id,
    action: log.action,
    at: log.created_at,
    actorId: log.actor_id,
    description: typeof log.metadata === "object" && log.metadata && "description" in log.metadata
      ? String(log.metadata.description)
      : log.action.replaceAll(".", " ").replaceAll("_", " "),
  }));

  return (
    <BranchProductReturnDetails
      canManage={canManage}
      canAttach={canAttach}
      currency={context.currency || "GHS"}
      data={{
        id: header.id,
        number: header.return_number,
        date: header.return_date,
        createdAt: header.created_at,
        status: header.status,
        sourceLocationId: header.source_location_id,
        sourceLocationName: locationById.get(header.source_location_id) ?? "Unknown branch",
        destinationLocationName: locationById.get(header.destination_location_id) ?? "Unknown returns office",
        requestedBy: requester?.full_name || "Organization member",
        reason: header.return_reason,
        priority: header.priority,
        notes: header.notes,
        items: returnItems,
        auditEvents,
        attachments: (attachmentRows ?? []).flatMap((file) => {
          const url = signedUrlByPath.get(file.storage_path);
          return url ? [{ id: file.id, name: file.file_name, url, contentType: file.content_type, size: file.file_size }] : [];
        }),
      }}
    />
  );
}
