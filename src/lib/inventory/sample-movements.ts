import { StockMovement, BranchStock, InventoryAnalytics, StockSummary, ProductDetailsData } from "./stock-ledger";

/**
 * Returns seeded high-fidelity ERP stock movements matching the exact sample in the reference image
 */
export function getSampleMovements(
  productId: string,
  unitCost: number = 4250,
  sellingPrice: number = 6200
): StockMovement[] {
  return [
    {
      id: "mov-1",
      productId,
      dateTime: "2025-05-17T10:45:00Z",
      dateFormatted: "May 17, 2025",
      timeFormatted: "10:45 AM",
      type: "Sale",
      referenceNo: "INV-2025-05-17-0012",
      referenceType: "Invoice",
      branchName: "Accra Main Branch",
      branchId: "loc-accra",
      inQty: null,
      outQty: 2,
      runningBalance: 18,
      unitCost,
      totalValue: 2 * unitCost,
      userName: "John Doe",
      userRole: "Sales Executive",
      notes: "Point of Sale retail checkout - paid via Cash",
    },
    {
      id: "mov-2",
      productId,
      dateTime: "2025-05-17T09:30:00Z",
      dateFormatted: "May 17, 2025",
      timeFormatted: "09:30 AM",
      type: "Purchase",
      referenceNo: "PO-2025-05-17-0008",
      referenceType: "Purchase Order",
      branchName: "Kumasi Branch",
      branchId: "loc-kumasi",
      inQty: 10,
      outQty: null,
      runningBalance: 20,
      unitCost,
      totalValue: 10 * unitCost,
      userName: "Mary Addo",
      userRole: "Inventory Manager",
      notes: "Direct Supplier shipment received in good condition",
    },
    {
      id: "mov-3",
      productId,
      dateTime: "2025-05-16T16:15:00Z",
      dateFormatted: "May 16, 2025",
      timeFormatted: "04:15 PM",
      type: "Stock Transfer",
      referenceNo: "ST-2025-05-16-0015",
      referenceType: "Stock Transfer",
      branchName: "Takoradi Branch",
      branchId: "loc-takoradi",
      inQty: 5,
      outQty: null,
      runningBalance: 10,
      unitCost,
      totalValue: 5 * unitCost,
      userName: "James Mensah",
      userRole: "Logistics Officer",
      notes: "Internal warehouse transfer from Central Hub",
    },
    {
      id: "mov-4",
      productId,
      dateTime: "2025-05-16T14:20:00Z",
      dateFormatted: "May 16, 2025",
      timeFormatted: "02:20 PM",
      type: "Sale",
      referenceNo: "INV-2025-05-16-0098",
      referenceType: "Invoice",
      branchName: "Accra Main Branch",
      branchId: "loc-accra",
      inQty: null,
      outQty: 1,
      runningBalance: 5,
      unitCost,
      totalValue: 1 * unitCost,
      userName: "John Doe",
      userRole: "Sales Executive",
      notes: "Corporate Client purchase order delivery",
    },
    {
      id: "mov-5",
      productId,
      dateTime: "2025-05-15T11:10:00Z",
      dateFormatted: "May 15, 2025",
      timeFormatted: "11:10 AM",
      type: "Stock Adjustment",
      subTypeNote: "(+ Damaged Returned)",
      referenceNo: "ADJ-2025-05-15-0006",
      referenceType: "Stock Adjustment",
      branchName: "Accra Main Branch",
      branchId: "loc-accra",
      inQty: 3,
      outQty: null,
      runningBalance: 6,
      unitCost,
      totalValue: 3 * unitCost,
      userName: "Mary Addo",
      userRole: "Inventory Manager",
      notes: "Physical inventory audit count reconciliation",
    },
    {
      id: "mov-6",
      productId,
      dateTime: "2025-05-15T10:05:00Z",
      dateFormatted: "May 15, 2025",
      timeFormatted: "10:05 AM",
      type: "Sale",
      referenceNo: "INV-2025-05-15-0065",
      referenceType: "Invoice",
      branchName: "Kumasi Branch",
      branchId: "loc-kumasi",
      inQty: null,
      outQty: 2,
      runningBalance: 3,
      unitCost,
      totalValue: 2 * unitCost,
      userName: "Daniel K.",
      userRole: "Store Cashier",
      notes: "POS terminal sale with tax invoice",
    },
    {
      id: "mov-7",
      productId,
      dateTime: "2025-05-14T15:45:00Z",
      dateFormatted: "May 14, 2025",
      timeFormatted: "03:45 PM",
      type: "Return",
      referenceNo: "RT-2025-05-14-0003",
      referenceType: "Sales Return",
      branchName: "Takoradi Branch",
      branchId: "loc-takoradi",
      inQty: 1,
      outQty: null,
      runningBalance: 5,
      unitCost,
      totalValue: 1 * unitCost,
      userName: "James Mensah",
      userRole: "Logistics Officer",
      notes: "Customer return restocked into active inventory",
    },
    {
      id: "mov-8",
      productId,
      dateTime: "2025-05-14T09:12:00Z",
      dateFormatted: "May 14, 2025",
      timeFormatted: "09:12 AM",
      type: "Purchase",
      referenceNo: "PO-2025-05-14-0004",
      referenceType: "Purchase Order",
      branchName: "Accra Main Branch",
      branchId: "loc-accra",
      inQty: 5,
      outQty: null,
      runningBalance: 4,
      unitCost,
      totalValue: 5 * unitCost,
      userName: "John Doe",
      userRole: "Purchasing Officer",
      notes: "Batch restock order from official distributor",
    },
  ];
}

/**
 * Returns sample branch stock distribution matching the screenshot (Accra: 12, Kumasi: 4, Takoradi: 2 = Total 18)
 */
export function getSampleBranches(totalStock: number = 18): BranchStock[] {
  if (totalStock === 18) {
    return [
      { id: "loc-accra", name: "Accra Main Branch", quantity: 12, minStock: 5, maxStock: 50, reorderPoint: 8, stockValue: 12 * 4250 },
      { id: "loc-kumasi", name: "Kumasi Branch", quantity: 4, minStock: 3, maxStock: 25, reorderPoint: 5, stockValue: 4 * 4250 },
      { id: "loc-takoradi", name: "Takoradi Branch", quantity: 2, minStock: 2, maxStock: 20, reorderPoint: 4, stockValue: 2 * 4250 },
    ];
  }

  // Proportional distribution for different total stock quantities
  const accraQty = Math.round(totalStock * 0.65);
  const kumasiQty = Math.round(totalStock * 0.22);
  const takoradiQty = Math.max(0, totalStock - accraQty - kumasiQty);

  return [
    { id: "loc-accra", name: "Accra Main Branch", quantity: accraQty, minStock: 5, maxStock: 50, reorderPoint: 8 },
    { id: "loc-kumasi", name: "Kumasi Branch", quantity: kumasiQty, minStock: 3, maxStock: 25, reorderPoint: 5 },
    { id: "loc-takoradi", name: "Takoradi Branch", quantity: takoradiQty, minStock: 2, maxStock: 20, reorderPoint: 4 },
  ];
}

/**
 * Returns reference analytics matching the image
 */
export function getSampleAnalytics(): { analytics: InventoryAnalytics; summary: StockSummary } {
  return {
    analytics: {
      totalInQty: 124,
      totalOutQty: 106,
      netMovement: 18,
      totalPurchasesQty: 72,
      totalSalesQty: 86,
      totalAdjustmentsQty: 6,
    },
    summary: {
      openingBalance: 0,
      totalIn: 124,
      totalOut: 106,
      currentBalance: 18,
      stockValue: 111600.0,
    },
  };
}
