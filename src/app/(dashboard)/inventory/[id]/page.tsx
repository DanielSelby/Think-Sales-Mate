import { cookies } from "next/headers";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { ProductDetailsView } from "@/components/inventory/product-details/product-details-view";
import {
  ProductDetailsData,
  StockMovement,
  BranchStock,
  calculateRunningBalances,
  computeLedgerAnalytics,
} from "@/lib/inventory/stock-ledger";

export const metadata = {
  title: "Product Details & Stock History · ThinkSales Pro",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { id } = await params;
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const supabase = await createClient();

  // 1. Fetch Product
  const { data: productRow } = await supabase
    .from("products")
    .select(`
      id, sku, barcode, name, description, category, brand, supplier, unit,
      unit_price, cost_price, tax_rate, stock_quantity, low_stock_threshold,
      is_active, product_type, hsn_code, warranty_months, expiry_date,
      created_at, image_urls
    `)
    .eq("id", id)
    .eq("org_id", context.orgId)
    .maybeSingle();

  if (!productRow) {
    return null;
  }

  const product = productRow;

  // 2. Fetch Locations & Per-Location Stock Levels & Profiles
  const [{ data: locationRows }, { data: stockLevelRows }, { data: profileRows }] = await Promise.all([
    supabase
      .from("business_locations")
      .select("id, name, is_primary")
      .eq("org_id", context.orgId)
      .eq("is_active", true)
      .order("is_primary", { ascending: false })
      .order("name"),
    supabase
      .from("product_stock_levels")
      .select("location_id, quantity, business_locations(name)")
      .eq("product_id", product.id)
      .eq("org_id", context.orgId),
    supabase
      .from("profiles")
      .select("id, full_name"),
  ]);

  const profileMap = new Map((profileRows ?? []).map((p) => [p.id, p.full_name]));

  // 3. Fetch Real Transactions from DB across all modules
  const [
    { data: saleItems },
    { data: purchaseItems },
    { data: transferItems },
    { data: adjustmentItems },
    { data: saleReturnItems },
    { data: purchaseReturnItems },
  ] = await Promise.all([
    supabase
      .from("sale_items")
      .select(`
        id, quantity, unit_price, line_total, created_at,
        sales:sale_id ( id, sale_number, reference, sale_date, sold_by, status, business_locations(name) )
      `)
      .eq("product_id", product.id)
      .eq("org_id", context.orgId)
      .order("created_at", { ascending: false })
      .limit(100),

    supabase
      .from("purchase_items")
      .select(`
        id, quantity, quantity_received, unit_price, line_total, created_at,
        purchases:purchase_id ( id, purchase_number, reference, invoice_number, purchase_date, created_by, status, business_locations(name) )
      `)
      .eq("product_id", product.id)
      .eq("org_id", context.orgId)
      .order("created_at", { ascending: false })
      .limit(100),

    supabase
      .from("stock_transfer_items")
      .select(`
        id, quantity, unit_cost, created_at,
        stock_transfers:transfer_id (
          id, transfer_number, reference_no, transfer_date, status, created_by, from_location_id, to_location_id,
          from:from_location_id(id, name),
          to:to_location_id(id, name)
        )
      `)
      .eq("product_id", product.id)
      .eq("org_id", context.orgId)
      .order("created_at", { ascending: false })
      .limit(100),

    supabase
      .from("stock_adjustment_items")
      .select(`
        id, system_stock, counted_stock, unit_cost, created_at,
        stock_adjustments:adjustment_id ( id, adjustment_number, reference_no, adjustment_date, reason, note, created_by, business_locations(name) )
      `)
      .eq("product_id", product.id)
      .eq("org_id", context.orgId)
      .order("created_at", { ascending: false })
      .limit(100),

    supabase
      .from("sale_return_items")
      .select(`
        id, quantity, unit_cost, created_at, created_by,
        sales:sale_id ( id, sale_number, reference, business_locations(name) )
      `)
      .eq("product_id", product.id)
      .eq("org_id", context.orgId)
      .order("created_at", { ascending: false })
      .limit(100),

    supabase
      .from("purchase_return_items")
      .select(`
        id, return_qty, unit_cost, created_at,
        purchase_returns:return_id ( id, return_number, reference, status, business_locations(name) )
      `)
      .eq("product_id", product.id)
      .eq("org_id", context.orgId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  // Build Real DB Movements
  const realMovements: StockMovement[] = [];

  // Map Sales
  for (const item of saleItems ?? []) {
    const sale = Array.isArray(item.sales) ? item.sales[0] : item.sales;
    if (!sale) continue;
    if (sale.status === "cancelled") continue;
    const location = Array.isArray(sale.business_locations) ? sale.business_locations[0] : sale.business_locations;
    const dateObj = new Date(item.created_at || sale.sale_date);
    const sellerName = (sale.sold_by && profileMap.get(sale.sold_by)) || "Store Cashier";

    realMovements.push({
      id: `sale-${item.id}`,
      productId: product.id,
      dateTime: dateObj.toISOString(),
      dateFormatted: dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      timeFormatted: dateObj.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
      type: "Sale",
      referenceNo: sale.reference || `INV-${String(sale.sale_number).padStart(4, "0")}`,
      referenceType: "Invoice",
      branchName: location?.name ?? "Main Branch",
      inQty: null,
      outQty: item.quantity,
      runningBalance: 0,
      unitCost: product.cost_price ?? item.unit_price,
      totalValue: item.quantity * (product.cost_price ?? item.unit_price),
      userName: sellerName,
      sourceDocId: sale.id,
    });
  }

  // Map Purchases
  for (const item of purchaseItems ?? []) {
    const purchase = Array.isArray(item.purchases) ? item.purchases[0] : item.purchases;
    if (!purchase) continue;
    if (purchase.status === "cancelled" || purchase.status === "draft") continue;
    const receivedQty = item.quantity_received > 0 ? item.quantity_received : purchase.status === "received" ? item.quantity : 0;
    if (receivedQty <= 0) continue;

    const location = Array.isArray(purchase.business_locations) ? purchase.business_locations[0] : purchase.business_locations;
    const dateObj = new Date(item.created_at || purchase.purchase_date);
    const buyerName = (purchase.created_by && profileMap.get(purchase.created_by)) || "Procurement";

    realMovements.push({
      id: `purchase-${item.id}`,
      productId: product.id,
      dateTime: dateObj.toISOString(),
      dateFormatted: dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      timeFormatted: dateObj.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
      type: "Purchase",
      referenceNo: purchase.reference || purchase.invoice_number || `PO-${String(purchase.purchase_number).padStart(4, "0")}`,
      referenceType: "Purchase Order",
      branchName: location?.name ?? "Main Warehouse",
      inQty: receivedQty,
      outQty: null,
      runningBalance: 0,
      unitCost: item.unit_price || product.cost_price || 0,
      totalValue: receivedQty * (item.unit_price || product.cost_price || 0),
      userName: buyerName,
      sourceDocId: purchase.id,
    });
  }

  // Map Stock Transfers
  for (const item of transferItems ?? []) {
    const transfer = Array.isArray(item.stock_transfers) ? item.stock_transfers[0] : item.stock_transfers;
    if (!transfer) continue;
    if (transfer.status === "cancelled" || transfer.status === "pending") continue;

    const fromLoc = Array.isArray(transfer.from) ? transfer.from[0] : transfer.from;
    const toLoc = Array.isArray(transfer.to) ? transfer.to[0] : transfer.to;
    const fromName = fromLoc?.name ?? "Source Location";
    const toName = toLoc?.name ?? "Destination Location";
    const dateObj = new Date(item.created_at || transfer.transfer_date);
    const officerName = (transfer.created_by && profileMap.get(transfer.created_by)) || "Logistics Officer";
    const refNo = transfer.reference_no || `ST-${String(transfer.transfer_number).padStart(4, "0")}`;
    const unitCost = item.unit_cost || product.cost_price || 0;

    // 1. Transfer Out from Source
    realMovements.push({
      id: `transfer-out-${item.id}`,
      productId: product.id,
      dateTime: dateObj.toISOString(),
      dateFormatted: dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      timeFormatted: dateObj.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
      type: "Stock Transfer Out",
      subTypeNote: `To ${toName}`,
      referenceNo: refNo,
      referenceType: "Stock Transfer",
      branchName: fromName,
      inQty: null,
      outQty: item.quantity,
      runningBalance: 0,
      unitCost,
      totalValue: item.quantity * unitCost,
      userName: officerName,
      sourceDocId: transfer.id,
      notes: `Transfer to ${toName} (${transfer.status})`,
    });

    // 2. Transfer In to Destination (if completed)
    if (transfer.status === "completed") {
      realMovements.push({
        id: `transfer-in-${item.id}`,
        productId: product.id,
        dateTime: dateObj.toISOString(),
        dateFormatted: dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        timeFormatted: dateObj.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
        type: "Stock Transfer In",
        subTypeNote: `From ${fromName}`,
        referenceNo: refNo,
        referenceType: "Stock Transfer",
        branchName: toName,
        inQty: item.quantity,
        outQty: null,
        runningBalance: 0,
        unitCost,
        totalValue: item.quantity * unitCost,
        userName: officerName,
        sourceDocId: transfer.id,
        notes: `Received from ${fromName}`,
      });
    }
  }

  // Map Adjustments
  for (const item of adjustmentItems ?? []) {
    const adj = Array.isArray(item.stock_adjustments) ? item.stock_adjustments[0] : item.stock_adjustments;
    if (!adj) continue;
    const location = Array.isArray(adj.business_locations) ? adj.business_locations[0] : adj.business_locations;
    const dateObj = new Date(item.created_at || adj.adjustment_date);
    const variance = item.counted_stock - item.system_stock;
    if (variance === 0) continue;

    const auditorName = (adj.created_by && profileMap.get(adj.created_by)) || "Auditor";

    realMovements.push({
      id: `adj-${item.id}`,
      productId: product.id,
      dateTime: dateObj.toISOString(),
      dateFormatted: dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      timeFormatted: dateObj.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
      type: "Stock Adjustment",
      subTypeNote: variance > 0 ? `(+ ${adj.reason || "Discrepancy"})` : `(- ${adj.reason || "Discrepancy"})`,
      referenceNo: adj.reference_no || `ADJ-${String(adj.adjustment_number).padStart(4, "0")}`,
      referenceType: "Stock Adjustment",
      branchName: location?.name ?? "Main Warehouse",
      inQty: variance > 0 ? variance : null,
      outQty: variance < 0 ? Math.abs(variance) : null,
      runningBalance: 0,
      unitCost: item.unit_cost || product.cost_price || 0,
      totalValue: Math.abs(variance) * (item.unit_cost || product.cost_price || 0),
      userName: auditorName,
      sourceDocId: adj.id,
      notes: adj.note || undefined,
    });
  }

  // Map Sale Returns
  for (const item of saleReturnItems ?? []) {
    const sale = Array.isArray(item.sales) ? item.sales[0] : item.sales;
    const location = Array.isArray(sale?.business_locations) ? sale.business_locations[0] : sale?.business_locations;
    const dateObj = new Date(item.created_at);
    const clerkName = (item.created_by && profileMap.get(item.created_by)) || "Store Clerk";

    realMovements.push({
      id: `sale-return-${item.id}`,
      productId: product.id,
      dateTime: dateObj.toISOString(),
      dateFormatted: dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      timeFormatted: dateObj.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
      type: "Sales Return",
      referenceNo: sale?.reference || `SR-${String(sale?.sale_number ?? 0).padStart(4, "0")}`,
      referenceType: "Sales Return",
      branchName: location?.name ?? "Main Branch",
      inQty: item.quantity,
      outQty: null,
      runningBalance: 0,
      unitCost: item.unit_cost || product.cost_price || 0,
      totalValue: item.quantity * (item.unit_cost || product.cost_price || 0),
      userName: clerkName,
      sourceDocId: sale?.id,
    });
  }

  // Map Purchase Returns
  for (const item of purchaseReturnItems ?? []) {
    const pret = Array.isArray(item.purchase_returns) ? item.purchase_returns[0] : item.purchase_returns;
    if (!pret || pret.status !== "approved") continue;
    const location = Array.isArray(pret.business_locations) ? pret.business_locations[0] : pret.business_locations;
    const dateObj = new Date(item.created_at);

    realMovements.push({
      id: `purch-return-${item.id}`,
      productId: product.id,
      dateTime: dateObj.toISOString(),
      dateFormatted: dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      timeFormatted: dateObj.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
      type: "Purchase Return",
      referenceNo: pret.reference || `PR-${String(pret.return_number).padStart(4, "0")}`,
      referenceType: "Purchase Return",
      branchName: location?.name ?? "Main Warehouse",
      inQty: null,
      outQty: item.return_qty,
      runningBalance: 0,
      unitCost: item.unit_cost || product.cost_price || 0,
      totalValue: item.return_qty * (item.unit_cost || product.cost_price || 0),
      userName: "Inventory Manager",
      sourceDocId: pret.id,
    });
  }

  // Build Real Branches list from locationRows and stockLevelRows
  const stockByLocation = new Map((stockLevelRows ?? []).map((sl) => [sl.location_id, sl.quantity]));
  const branches: BranchStock[] = (locationRows ?? []).map((loc) => {
    const qty = stockByLocation.get(loc.id) ?? 0;
    return {
      id: loc.id,
      name: loc.name,
      quantity: qty,
      minStock: product.low_stock_threshold || 5,
      maxStock: 100,
      reorderPoint: (product.low_stock_threshold || 5) + 3,
      stockValue: qty * (product.cost_price || 0),
    };
  });

  const totalCalculatedStock = branches.reduce((sum, b) => sum + b.quantity, 0);
  const currentActualStock = totalCalculatedStock > 0 ? totalCalculatedStock : (product.stock_quantity || 0);

  // If movements don't account for all current stock (e.g. initial stock when product was created),
  // compute an opening stock balance so the ledger running balance equals the real current stock.
  let totalNetMovement = 0;
  for (const m of realMovements) {
    totalNetMovement += (m.inQty ?? 0) - (m.outQty ?? 0);
  }
  const computedOpeningBalance = Math.max(0, currentActualStock - totalNetMovement);

  // If there are no movements yet but there is stock, add an Opening Stock movement
  if (realMovements.length === 0 && currentActualStock > 0) {
    const createdDate = new Date(product.created_at || Date.now());
    realMovements.push({
      id: `open-${product.id}`,
      productId: product.id,
      dateTime: createdDate.toISOString(),
      dateFormatted: createdDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      timeFormatted: createdDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
      type: "Opening Stock",
      referenceNo: `INIT-${product.sku}`,
      referenceType: "Opening Balance",
      branchName: branches.find((b) => b.quantity > 0)?.name || locationRows?.[0]?.name || "Main Warehouse",
      inQty: currentActualStock,
      outQty: null,
      runningBalance: currentActualStock,
      unitCost: product.cost_price || 0,
      totalValue: currentActualStock * (product.cost_price || 0),
      userName: "System Initializer",
      sourceDocId: product.id,
      notes: "Initial inventory stock on catalog creation",
    });
  }

  // Calculate Real Running Balances and Analytics
  const finalMovements = calculateRunningBalances(
    realMovements,
    realMovements.length === 1 && realMovements[0].type === "Opening Stock" ? 0 : computedOpeningBalance
  );

  const analyticsData = computeLedgerAnalytics(
    finalMovements,
    product.cost_price || 0,
    realMovements.length === 1 && realMovements[0].type === "Opening Stock" ? 0 : computedOpeningBalance
  );

  // Ensure stockValue and currentBalance in summary always match real current stock
  const actualStockValue = currentActualStock * (product.cost_price || 0);
  const summary = {
    ...analyticsData.summary,
    currentBalance: currentActualStock,
    stockValue: actualStockValue,
  };

  const initialData: ProductDetailsData = {
    id: product.id,
    sku: product.sku,
    barcode: product.barcode,
    name: product.name,
    description: product.description,
    category: product.category,
    brand: product.brand,
    supplier: product.supplier,
    unit: product.unit || "Piece",
    costPrice: product.cost_price || 0,
    sellingPrice: product.unit_price || 0,
    taxRate: product.tax_rate ?? 0,
    stockQuantity: currentActualStock,
    lowStockThreshold: product.low_stock_threshold || 5,
    isActive: product.is_active ?? true,
    productType: product.product_type || "standard",
    hsnCode: product.hsn_code,
    warrantyMonths: product.warranty_months,
    expiryDate: product.expiry_date,
    createdAt: product.created_at || new Date().toISOString(),
    imageUrls: product.image_urls || [],
    locationCount: branches.filter((b) => b.quantity > 0).length || 1,
    branches,
    analytics: analyticsData.analytics,
    summary,
    movements: finalMovements,
    currency: context.currency || "GHS",
  };

  return <ProductDetailsView initialData={initialData} />;
}
