import * as XLSX from "xlsx";

export type TransactionType =
  | "Purchase"
  | "Sale"
  | "Stock Transfer In"
  | "Stock Transfer Out"
  | "Stock Transfer"
  | "Stock Adjustment"
  | "Purchase Return"
  | "Sales Return"
  | "Return"
  | "Opening Stock";

export type ReferenceType =
  | "Invoice"
  | "Purchase Order"
  | "Stock Transfer"
  | "Stock Adjustment"
  | "Sales Return"
  | "Purchase Return"
  | "Opening Balance"
  | "Manual Entry";

export interface StockMovement {
  id: string;
  productId: string;
  dateTime: string; // ISO date string or formatted date
  dateFormatted: string; // e.g. "May 17, 2025"
  timeFormatted: string; // e.g. "10:45 AM"
  type: TransactionType;
  subTypeNote?: string; // e.g. "(+ Damaged Returned)", "(- Expired)", "To Takoradi"
  referenceNo: string; // e.g. "INV-2025-05-17-0012"
  referenceType: ReferenceType;
  branchName: string;
  branchId?: string;
  inQty: number | null; // e.g. 10 or null (displays as '-')
  outQty: number | null; // e.g. 2 or null (displays as '-')
  runningBalance: number; // e.g. 18
  unitCost: number; // e.g. 4250.00
  totalValue: number; // e.g. 8500.00
  userName: string; // e.g. "John Doe"
  userRole?: string;
  sourceDocId?: string; // ID of the sale, purchase, transfer, etc.
  notes?: string;
}

export interface InventoryAnalytics {
  totalInQty: number;
  totalOutQty: number;
  netMovement: number;
  totalPurchasesQty: number;
  totalSalesQty: number;
  totalAdjustmentsQty: number;
}

export interface StockSummary {
  openingBalance: number;
  totalIn: number;
  totalOut: number;
  currentBalance: number;
  stockValue: number;
}

export interface BranchStock {
  id: string;
  name: string;
  quantity: number;
  minStock?: number;
  maxStock?: number;
  reorderPoint?: number;
  stockValue?: number;
}

export interface ProductDetailsData {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  category: string | null;
  brand: string | null;
  supplier: string | null;
  unit: string;
  costPrice: number;
  sellingPrice: number;
  taxRate: number;
  stockQuantity: number;
  lowStockThreshold: number;
  isActive: boolean;
  productType: "standard" | "service" | "digital";
  hsnCode?: string | null;
  warrantyMonths?: number | null;
  expiryDate?: string | null;
  createdAt: string;
  imageUrls: string[];
  locationCount: number;
  branches: BranchStock[];
  analytics: InventoryAnalytics;
  summary: StockSummary;
  movements: StockMovement[];
  currency: string;
}

/**
 * Format currency with symbol or ISO code
 */
export function formatLedgerMoney(amount: number, currency: string = "GHS"): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Calculates running balances chronologically for an array of movements
 */
export function calculateRunningBalances(
  movements: StockMovement[],
  initialOpeningBalance: number = 0
): StockMovement[] {
  // Sort ascending by date to compute forward balance
  const sortedAsc = [...movements].sort(
    (a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime()
  );

  let currentBalance = initialOpeningBalance;

  const withBalancesAsc = sortedAsc.map((m) => {
    const inVal = m.inQty ?? 0;
    const outVal = m.outQty ?? 0;
    currentBalance = currentBalance + inVal - outVal;

    return {
      ...m,
      runningBalance: currentBalance,
    };
  });

  // Return descending (newest first) for ERP ledger display
  return withBalancesAsc.sort(
    (a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime()
  );
}

/**
 * Computes analytics from movement records
 */
export function computeLedgerAnalytics(
  movements: StockMovement[],
  unitCost: number,
  openingBalance: number = 0
): { analytics: InventoryAnalytics; summary: StockSummary } {
  let totalInQty = 0;
  let totalOutQty = 0;
  let totalPurchasesQty = 0;
  let totalSalesQty = 0;
  let totalAdjustmentsQty = 0;

  for (const m of movements) {
    if (m.type === "Opening Stock") continue;

    if (m.inQty && m.inQty > 0) {
      totalInQty += m.inQty;
    }
    if (m.outQty && m.outQty > 0) {
      totalOutQty += m.outQty;
    }

    if (m.type === "Purchase") {
      totalPurchasesQty += m.inQty ?? 0;
    } else if (m.type === "Sale") {
      totalSalesQty += m.outQty ?? 0;
    } else if (m.type === "Stock Adjustment") {
      totalAdjustmentsQty += (m.inQty ?? 0) + (m.outQty ?? 0);
    }
  }

  const netMovement = totalInQty - totalOutQty;
  const currentBalance = openingBalance + netMovement;
  const stockValue = currentBalance * unitCost;

  return {
    analytics: {
      totalInQty,
      totalOutQty,
      netMovement,
      totalPurchasesQty,
      totalSalesQty,
      totalAdjustmentsQty,
    },
    summary: {
      openingBalance,
      totalIn: totalInQty,
      totalOut: totalOutQty,
      currentBalance,
      stockValue,
    },
  };
}

/**
 * Export movements to Excel (.xlsx)
 */
export function exportMovementsToExcel(
  product: ProductDetailsData,
  movements: StockMovement[],
  fileName?: string
) {
  const dataRows = movements.map((m) => ({
    "Date & Time": `${m.dateFormatted} ${m.timeFormatted}`,
    Type: m.subTypeNote ? `${m.type} ${m.subTypeNote}` : m.type,
    "Reference No.": m.referenceNo,
    "Reference Type": m.referenceType,
    "Branch / Warehouse": m.branchName,
    "In Qty": m.inQty ?? "-",
    "Out Qty": m.outQty ?? "-",
    Balance: m.runningBalance,
    [`Unit Cost (${product.currency})`]: m.unitCost,
    [`Total Value (${product.currency})`]: m.totalValue,
    User: m.userName,
  }));

  const worksheet = XLSX.utils.json_to_sheet(dataRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Stock Ledger");

  // Include Product Summary header info sheet
  const summaryRows = [
    { Attribute: "Product Name", Value: product.name },
    { Attribute: "SKU", Value: product.sku },
    { Attribute: "Barcode", Value: product.barcode ?? "N/A" },
    { Attribute: "Category", Value: product.category ?? "N/A" },
    { Attribute: "Brand", Value: product.brand ?? "N/A" },
    { Attribute: "Cost Price", Value: `${product.currency} ${formatLedgerMoney(product.costPrice)}` },
    { Attribute: "Selling Price", Value: `${product.currency} ${formatLedgerMoney(product.sellingPrice)}` },
    { Attribute: "Current Stock", Value: product.stockQuantity },
    { Attribute: "Total Stock Value", Value: `${product.currency} ${formatLedgerMoney(product.summary.stockValue)}` },
    { Attribute: "Export Date", Value: new Date().toLocaleString() },
  ];
  const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Product Summary");

  const finalName = fileName || `${product.sku}_Stock_Ledger_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(workbook, finalName);
}

/**
 * Export movements to CSV (.csv)
 */
export function exportMovementsToCSV(
  product: ProductDetailsData,
  movements: StockMovement[],
  fileName?: string
) {
  const headers = [
    "Date & Time",
    "Type",
    "Reference No.",
    "Reference Type",
    "Branch / Warehouse",
    "In Qty",
    "Out Qty",
    "Balance",
    `Unit Cost (${product.currency})`,
    `Total Value (${product.currency})`,
    "User",
  ];

  const csvRows: string[] = [];
  csvRows.push(headers.join(","));

  for (const m of movements) {
    const row = [
      `"${m.dateFormatted} ${m.timeFormatted}"`,
      `"${m.subTypeNote ? `${m.type} ${m.subTypeNote}` : m.type}"`,
      `"${m.referenceNo}"`,
      `"${m.referenceType}"`,
      `"${m.branchName}"`,
      m.inQty !== null ? String(m.inQty) : '""',
      m.outQty !== null ? String(m.outQty) : '""',
      String(m.runningBalance),
      String(m.unitCost),
      String(m.totalValue),
      `"${m.userName}"`,
    ];
    csvRows.push(row.join(","));
  }

  const csvContent = "data:text/csv;charset=utf-8," + encodeURIComponent(csvRows.join("\n"));
  const link = document.createElement("a");
  link.setAttribute("href", csvContent);
  const finalName = fileName || `${product.sku}_Stock_Ledger_${new Date().toISOString().slice(0, 10)}.csv`;
  link.setAttribute("download", finalName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
