import { createClient } from "@/lib/supabase/server";

export interface ReportFilters {
  orgId: string;
  dateFrom: string; // ISO date
  dateTo: string; // ISO date
  locationId?: string | null;
  allowedLocationIds?: string[];
}

export interface OperationalReportRow {
  label: string;
  secondary?: string;
  quantity?: number;
  amount?: number;
  count?: number;
}

export interface OperationalReportData {
  salesByProduct: OperationalReportRow[];
  salesByCategory: OperationalReportRow[];
  salesByBranch: OperationalReportRow[];
  salesReturns: OperationalReportRow[];
  purchasesBySupplier: OperationalReportRow[];
  purchasesByProduct: OperationalReportRow[];
  purchaseReturns: OperationalReportRow[];
  currentInventory: OperationalReportRow[];
  inventoryValuation: OperationalReportRow[];
  reorderReport: OperationalReportRow[];
  branchExpenses: OperationalReportRow[];
}

function dateToExclusive(date: string) {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

function prevPeriod(dateFrom: string, dateTo: string) {
  const from = new Date(dateFrom);
  const to = new Date(dateTo);
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000) + 1);
  const prevTo = new Date(from.getTime() - 86400000);
  const prevFrom = new Date(prevTo.getTime() - (days - 1) * 86400000);
  return { prevFrom: prevFrom.toISOString().slice(0, 10), prevTo: prevTo.toISOString().slice(0, 10) };
}

function pctChange(current: number, previous: number) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

async function fetchPeriodFigures(filters: ReportFilters) {
  const supabase = await createClient();
  const { orgId, dateFrom, dateTo, locationId, allowedLocationIds } = filters;

  let salesQuery = supabase
    .from("sales")
    .select("id, total, tax_amount, customer_name, sale_date, location_id, status")
    .eq("org_id", orgId)
    .eq("status", "completed")
    .gte("sale_date", dateFrom)
    .lt("sale_date", dateToExclusive(dateTo));
  if (locationId) salesQuery = salesQuery.eq("location_id", locationId);
  else if (allowedLocationIds?.length) salesQuery = salesQuery.in("location_id", allowedLocationIds);
  const { data: sales } = await salesQuery;

  const saleIds = (sales ?? []).map((s) => s.id);
  let saleItems: { sale_id: string; quantity: number; line_total: number; product_id: string }[] = [];
  if (saleIds.length > 0) {
    const { data } = await supabase
      .from("sale_items")
      .select("sale_id, quantity, line_total, product_id")
      .in("sale_id", saleIds);
    saleItems = data ?? [];
  }

  const productIds = [...new Set(saleItems.map((i) => i.product_id))];
  let costByProduct = new Map<string, number>();
  if (productIds.length > 0) {
    const { data: products } = await supabase.from("products").select("id, cost_price, unit_price").in("id", productIds);
    // Falls back to 60% of selling price only when a product genuinely
    // has no cost_price recorded — never silently overrides a real cost.
    costByProduct = new Map((products ?? []).map((p) => [p.id, p.cost_price ?? p.unit_price * 0.6]));
  }

  const cogs = saleItems.reduce((sum, item) => sum + item.quantity * (costByProduct.get(item.product_id) ?? 0), 0);

  let expenseQuery = supabase
    .from("expenses")
    .select("amount, expense_date, category, location_id, payment_status, status")
    .eq("org_id", orgId)
    .in("status", ["approved"])
    .gte("expense_date", dateFrom)
    .lt("expense_date", dateToExclusive(dateTo));
  if (locationId) expenseQuery = expenseQuery.eq("location_id", locationId);
  else if (allowedLocationIds?.length) expenseQuery = expenseQuery.in("location_id", allowedLocationIds);
  const { data: expenses } = await expenseQuery;

  const totalRevenue = (sales ?? []).reduce((sum, s) => sum + s.total, 0);
  const totalTax = (sales ?? []).reduce((sum, s) => sum + (s.tax_amount ?? 0), 0);
  const totalExpenses = (expenses ?? []).reduce((sum, e) => sum + e.amount, 0);

  const paidExpenses = (expenses ?? []).filter((e) => e.payment_status === "paid").reduce((s, e) => s + e.amount, 0);

  let purchaseQuery = supabase
    .from("purchases")
    .select("total, paid_amount, purchase_date, location_id, status")
    .eq("org_id", orgId)
    .neq("status", "cancelled")
    .gte("purchase_date", dateFrom)
    .lt("purchase_date", dateToExclusive(dateTo));
  if (locationId) purchaseQuery = purchaseQuery.eq("location_id", locationId);
  else if (allowedLocationIds?.length) purchaseQuery = purchaseQuery.in("location_id", allowedLocationIds);
  const { data: purchases } = await purchaseQuery;
  const purchasesPaid = (purchases ?? []).reduce((sum, p) => sum + p.paid_amount, 0);

  const grossProfit = totalRevenue - cogs;
  const operatingProfit = grossProfit - totalExpenses;
  const netProfit = operatingProfit;
  const operatingCashFlow = totalRevenue - paidExpenses - purchasesPaid;

  return { sales: sales ?? [], expenses: expenses ?? [], purchases: purchases ?? [], totalRevenue, cogs, totalExpenses, totalTax, grossProfit, operatingProfit, netProfit, operatingCashFlow };
}

export interface ReportKpis {
  totalRevenue: number;
  totalRevenueChange: number;
  totalExpenses: number;
  totalExpensesChange: number;
  netProfit: number;
  netProfitChange: number;
  grossMargin: number;
  grossMarginChange: number;
  operatingCashFlow: number;
  operatingCashFlowChange: number;
}

export async function getReportKpis(filters: ReportFilters): Promise<ReportKpis> {
  const current = await fetchPeriodFigures(filters);
  const { prevFrom, prevTo } = prevPeriod(filters.dateFrom, filters.dateTo);
  const previous = await fetchPeriodFigures({ ...filters, dateFrom: prevFrom, dateTo: prevTo });

  const currentMargin = current.totalRevenue > 0 ? (current.grossProfit / current.totalRevenue) * 100 : 0;
  const previousMargin = previous.totalRevenue > 0 ? (previous.grossProfit / previous.totalRevenue) * 100 : 0;

  return {
    totalRevenue: current.totalRevenue,
    totalRevenueChange: pctChange(current.totalRevenue, previous.totalRevenue),
    totalExpenses: current.totalExpenses,
    totalExpensesChange: pctChange(current.totalExpenses, previous.totalExpenses),
    netProfit: current.netProfit,
    netProfitChange: pctChange(current.netProfit, previous.netProfit),
    grossMargin: Math.round(currentMargin * 10) / 10,
    grossMarginChange: Math.round((currentMargin - previousMargin) * 10) / 10,
    operatingCashFlow: current.operatingCashFlow,
    operatingCashFlowChange: pctChange(current.operatingCashFlow, previous.operatingCashFlow)
  };
}

export interface ProfitLossLine {
  label: string;
  amount: number;
  pctOfRevenue: number;
  emphasis?: boolean;
}

export async function getProfitAndLoss(filters: ReportFilters): Promise<ProfitLossLine[]> {
  const f = await fetchPeriodFigures(filters);
  const rev = f.totalRevenue || 1;
  const pct = (n: number) => Math.round((n / rev) * 10000) / 100;

  return [
    { label: "Total Revenue", amount: f.totalRevenue, pctOfRevenue: pct(f.totalRevenue) },
    { label: "Cost of Goods Sold", amount: -f.cogs, pctOfRevenue: -pct(f.cogs) },
    { label: "Gross Profit", amount: f.grossProfit, pctOfRevenue: pct(f.grossProfit), emphasis: true },
    { label: "Operating Expenses", amount: -f.totalExpenses, pctOfRevenue: -pct(f.totalExpenses) },
    { label: "Operating Profit", amount: f.operatingProfit, pctOfRevenue: pct(f.operatingProfit), emphasis: true },
    { label: "Other Income", amount: 0, pctOfRevenue: 0 },
    { label: "Other Expenses", amount: 0, pctOfRevenue: 0 },
    { label: "Net Profit", amount: f.netProfit, pctOfRevenue: pct(f.netProfit), emphasis: true }
  ];
}

export interface BalanceSheetSummary {
  currentAssets: number;
  fixedAssets: number;
  otherAssets: number;
  totalAssets: number;
  currentLiabilities: number;
  longTermLiabilities: number;
  totalLiabilities: number;
  ownersEquity: number;
  totalEquity: number;
}

// A simplified, single-entry-friendly balance sheet — this app has no
// chart of accounts / general ledger, so it's derived from cash on hand,
// inventory value, unpaid invoices (AR), fixed assets, and unpaid
// purchases (AP), with equity as the balancing figure. Not a substitute
// for a full double-entry balance sheet.
export async function getBalanceSheet(filters: ReportFilters): Promise<BalanceSheetSummary> {
  const supabase = await createClient();
  const { orgId, dateTo, locationId, allowedLocationIds } = filters;

  const { data: bankAccounts } = await supabase.from("bank_accounts").select("current_balance").eq("org_id", orgId);
  const cash = (bankAccounts ?? []).reduce((s, a) => s + a.current_balance, 0);

  let stockQuery = supabase
    .from("product_stock_levels")
    .select("quantity, products(unit_price)")
    .eq("org_id", orgId);
  if (locationId) stockQuery = stockQuery.eq("location_id", locationId);
  else if (allowedLocationIds?.length) stockQuery = stockQuery.in("location_id", allowedLocationIds);
  const { data: stockLevels } = await stockQuery;
  const inventoryValue = (stockLevels ?? []).reduce((sum, row) => {
    const product = Array.isArray(row.products) ? row.products[0] : row.products;
    return sum + row.quantity * (product?.unit_price ?? 0);
  }, 0);

  const { data: invoices } = await supabase
    .from("invoices")
    .select("amount, status")
    .eq("org_id", orgId)
    .in("status", ["sent", "overdue"]);
  const accountsReceivable = (invoices ?? []).reduce((s, i) => s + i.amount, 0);

  let assetsQuery = supabase.from("assets").select("current_value").eq("org_id", orgId).eq("status", "in_use");
  if (locationId) assetsQuery = assetsQuery.eq("location", locationId);
  else if (allowedLocationIds?.length) assetsQuery = assetsQuery.in("location", allowedLocationIds);
  const { data: assets } = await assetsQuery;
  const fixedAssets = (assets ?? []).reduce((s, a) => s + a.current_value, 0);

  let purchasesQuery = supabase
    .from("purchases")
    .select("total, paid_amount, status")
    .eq("org_id", orgId)
    .neq("status", "cancelled")
    .lte("purchase_date", dateTo);
  if (locationId) purchasesQuery = purchasesQuery.eq("location_id", locationId);
  else if (allowedLocationIds?.length) purchasesQuery = purchasesQuery.in("location_id", allowedLocationIds);
  const { data: purchases } = await purchasesQuery;
  const accountsPayable = (purchases ?? []).reduce((s, p) => s + Math.max(0, p.total - p.paid_amount), 0);

  const currentAssets = cash + inventoryValue + accountsReceivable;
  const totalAssets = currentAssets + fixedAssets;
  const currentLiabilities = accountsPayable;
  const totalLiabilities = currentLiabilities;
  const ownersEquity = totalAssets - totalLiabilities;

  return {
    currentAssets,
    fixedAssets,
    otherAssets: 0,
    totalAssets,
    currentLiabilities,
    longTermLiabilities: 0,
    totalLiabilities,
    ownersEquity,
    totalEquity: ownersEquity
  };
}

export interface RevenueExpensePoint {
  label: string;
  revenue: number;
  expenses: number;
}

export async function getRevenueExpenseSeries(
  filters: ReportFilters,
  period: "daily" | "weekly" | "monthly" | "quarterly" | "yearly"
): Promise<RevenueExpensePoint[]> {
  const supabase = await createClient();
  let salesQuery = supabase
    .from("sales")
    .select("total, sale_date, location_id")
    .eq("org_id", filters.orgId)
    .eq("status", "completed")
    .gte("sale_date", filters.dateFrom)
    .lt("sale_date", dateToExclusive(filters.dateTo));
  if (filters.locationId) salesQuery = salesQuery.eq("location_id", filters.locationId);
  else if (filters.allowedLocationIds?.length) salesQuery = salesQuery.in("location_id", filters.allowedLocationIds);

  let expenseQuery = supabase
    .from("expenses")
    .select("amount, expense_date, location_id")
    .eq("org_id", filters.orgId)
    .eq("status", "approved")
    .gte("expense_date", filters.dateFrom)
    .lt("expense_date", dateToExclusive(filters.dateTo));
  if (filters.locationId) expenseQuery = expenseQuery.eq("location_id", filters.locationId);
  else if (filters.allowedLocationIds?.length) expenseQuery = expenseQuery.in("location_id", filters.allowedLocationIds);

  const [{ data: sales }, { data: expenses }] = await Promise.all([salesQuery, expenseQuery]);

  function bucketKey(dateStr: string): string {
    const d = new Date(dateStr);
    if (period === "daily") return d.toISOString().slice(0, 10);
    if (period === "weekly") {
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      return weekStart.toISOString().slice(0, 10);
    }
    if (period === "monthly") return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (period === "quarterly") return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
    return String(d.getFullYear());
  }

  function bucketLabel(key: string): string {
    if (period === "monthly") {
      const [y, m] = key.split("-");
      return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, { month: "short" });
    }
    if (period === "daily" || period === "weekly") {
      return new Date(key).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    }
    return key;
  }

  const buckets = new Map<string, { revenue: number; expenses: number }>();
  for (const s of sales ?? []) {
    const key = bucketKey(s.sale_date);
    const b = buckets.get(key) ?? { revenue: 0, expenses: 0 };
    b.revenue += s.total;
    buckets.set(key, b);
  }
  for (const e of expenses ?? []) {
    const key = bucketKey(e.expense_date);
    const b = buckets.get(key) ?? { revenue: 0, expenses: 0 };
    b.expenses += e.amount;
    buckets.set(key, b);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => ({ label: bucketLabel(key), revenue: v.revenue, expenses: v.expenses }));
}

export interface ExpenseCategorySlice {
  category: string;
  amount: number;
  pct: number;
}

export async function getExpensesByCategory(filters: ReportFilters): Promise<ExpenseCategorySlice[]> {
  const supabase = await createClient();
  let query = supabase
    .from("expenses")
    .select("amount, category, location_id")
    .eq("org_id", filters.orgId)
    .eq("status", "approved")
    .gte("expense_date", filters.dateFrom)
    .lt("expense_date", dateToExclusive(filters.dateTo));
  if (filters.locationId) query = query.eq("location_id", filters.locationId);
  else if (filters.allowedLocationIds?.length) query = query.in("location_id", filters.allowedLocationIds);
  const { data } = await query;

  const map = new Map<string, number>();
  for (const e of data ?? []) {
    map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
  }
  const total = [...map.values()].reduce((s, v) => s + v, 0);
  return [...map.entries()]
    .map(([category, amount]) => ({ category, amount, pct: total > 0 ? Math.round((amount / total) * 1000) / 10 : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

export interface TaxSummary {
  taxCollected: number;
  salesCount: number;
}

export async function getTaxSummary(filters: ReportFilters): Promise<TaxSummary> {
  const f = await fetchPeriodFigures(filters);
  return { taxCollected: f.totalTax, salesCount: f.sales.length };
}

export async function getOperationalReportData(filters: ReportFilters): Promise<OperationalReportData> {
  const supabase = await createClient();
  const { orgId, dateFrom, dateTo, locationId, allowedLocationIds } = filters;
  const applyLocation = <T extends { eq: Function; in: Function }>(query: T, column = "location_id") => {
    if (locationId) return query.eq(column, locationId);
    if (allowedLocationIds?.length) return query.in(column, allowedLocationIds);
    return query;
  };

  let salesQuery = supabase
    .from("sales")
    .select("id, total, location_id, sale_date")
    .eq("org_id", orgId)
    .eq("status", "completed")
    .gte("sale_date", dateFrom)
    .lt("sale_date", dateToExclusive(dateTo));
  salesQuery = applyLocation(salesQuery);
  const { data: sales } = await salesQuery;
  const saleIds = (sales ?? []).map((row) => row.id);
  const { data: saleItems } = saleIds.length
    ? await supabase.from("sale_items").select("sale_id, product_id, quantity, line_total").in("sale_id", saleIds)
    : { data: [] };
  const productIds = [...new Set((saleItems ?? []).map((row) => row.product_id))];
  const { data: products } = productIds.length
    ? await supabase.from("products").select("id, name, category, stock_quantity, cost_price, unit_price, low_stock_threshold").in("id", productIds)
    : { data: [] };
  const productMap = new Map((products ?? []).map((row) => [row.id, row]));
  const salesByProductMap = new Map<string, { quantity: number; amount: number }>();
  const salesByCategoryMap = new Map<string, { quantity: number; amount: number }>();
  for (const item of saleItems ?? []) {
    const product = productMap.get(item.product_id);
    const productName = product?.name ?? "Unknown product";
    const category = product?.category || "Uncategorized";
    const productCurrent = salesByProductMap.get(productName) ?? { quantity: 0, amount: 0 };
    productCurrent.quantity += item.quantity;
    productCurrent.amount += item.line_total;
    salesByProductMap.set(productName, productCurrent);
    const categoryCurrent = salesByCategoryMap.get(category) ?? { quantity: 0, amount: 0 };
    categoryCurrent.quantity += item.quantity;
    categoryCurrent.amount += item.line_total;
    salesByCategoryMap.set(category, categoryCurrent);
  }

  const { data: locations } = await supabase
    .from("business_locations")
    .select("id, name")
    .eq("org_id", orgId);
  const locationMap = new Map((locations ?? []).map((row) => [row.id, row.name]));
  const salesByBranchMap = new Map<string, { count: number; amount: number }>();
  for (const sale of sales ?? []) {
    const name = sale.location_id ? locationMap.get(sale.location_id) ?? "Unassigned" : "Unassigned";
    const current = salesByBranchMap.get(name) ?? { count: 0, amount: 0 };
    current.count += 1;
    current.amount += sale.total;
    salesByBranchMap.set(name, current);
  }

  let purchasesQuery = supabase
    .from("purchases")
    .select("id, total, supplier_id, location_id")
    .eq("org_id", orgId)
    .neq("status", "cancelled")
    .gte("purchase_date", dateFrom)
    .lt("purchase_date", dateToExclusive(dateTo));
  purchasesQuery = applyLocation(purchasesQuery);
  const { data: purchases } = await purchasesQuery;
  const purchaseIds = (purchases ?? []).map((row) => row.id);
  const supplierIds = [...new Set((purchases ?? []).map((row) => row.supplier_id))];
  const [{ data: purchaseItems }, { data: suppliers }] = await Promise.all([
    purchaseIds.length
      ? supabase.from("purchase_items").select("purchase_id, product_id, quantity, line_total").in("purchase_id", purchaseIds)
      : { data: [] },
    supplierIds.length
      ? supabase.from("suppliers").select("id, name").in("id", supplierIds)
      : { data: [] }
  ]);
  const supplierMap = new Map((suppliers ?? []).map((row) => [row.id, row.name]));
  const purchaseProductIds = [...new Set((purchaseItems ?? []).map((row) => row.product_id))];
  const { data: purchaseProducts } = purchaseProductIds.length
    ? await supabase.from("products").select("id, name").in("id", purchaseProductIds)
    : { data: [] };
  const purchaseProductMap = new Map((purchaseProducts ?? []).map((row) => [row.id, row.name]));
  const purchasesBySupplierMap = new Map<string, { count: number; amount: number }>();
  for (const purchase of purchases ?? []) {
    const name = supplierMap.get(purchase.supplier_id) ?? "Unknown supplier";
    const current = purchasesBySupplierMap.get(name) ?? { count: 0, amount: 0 };
    current.count += 1;
    current.amount += purchase.total;
    purchasesBySupplierMap.set(name, current);
  }
  const purchasesByProductMap = new Map<string, { quantity: number; amount: number }>();
  for (const item of purchaseItems ?? []) {
    const name = purchaseProductMap.get(item.product_id) ?? "Unknown product";
    const current = purchasesByProductMap.get(name) ?? { quantity: 0, amount: 0 };
    current.quantity += item.quantity;
    current.amount += item.line_total;
    purchasesByProductMap.set(name, current);
  }

  let saleReturnsQuery = supabase
    .from("sale_return_items")
    .select("product_id, quantity, created_at")
    .eq("org_id", orgId)
    .gte("created_at", dateFrom)
    .lt("created_at", dateToExclusive(dateTo));
  const { data: saleReturns } = await saleReturnsQuery;
  const salesReturnMap = new Map<string, number>();
  for (const item of saleReturns ?? []) {
    const name = productMap.get(item.product_id)?.name ?? "Unknown product";
    salesReturnMap.set(name, (salesReturnMap.get(name) ?? 0) + item.quantity);
  }

  let purchaseReturnsQuery = supabase
    .from("purchase_returns")
    .select("id, total_return_value, supplier_id, location_id, return_date")
    .eq("org_id", orgId)
    .eq("status", "approved")
    .gte("return_date", dateFrom)
    .lt("return_date", dateToExclusive(dateTo));
  purchaseReturnsQuery = applyLocation(purchaseReturnsQuery);
  const { data: purchaseReturns } = await purchaseReturnsQuery;

  let inventoryQuery = supabase
    .from("products")
    .select("id, name, stock_quantity, cost_price, unit_price, low_stock_threshold")
    .eq("org_id", orgId)
    .eq("is_active", true);
  const { data: inventory } = await inventoryQuery;
  const scopedInventory = locationId || allowedLocationIds?.length
    ? await (async () => {
        let stockQuery = supabase.from("product_stock_levels").select("product_id, quantity, location_id").eq("org_id", orgId);
        stockQuery = applyLocation(stockQuery);
        const { data: stock } = await stockQuery;
        const quantities = new Map<string, number>();
        for (const row of stock ?? []) quantities.set(row.product_id, (quantities.get(row.product_id) ?? 0) + row.quantity);
        return (inventory ?? []).map((row) => ({ ...row, stock_quantity: quantities.get(row.id) ?? 0 }));
      })()
    : inventory ?? [];

  return {
    salesByProduct: [...salesByProductMap.entries()].sort((a, b) => b[1].amount - a[1].amount).map(([label, value]) => ({ label, ...value })),
    salesByCategory: [...salesByCategoryMap.entries()].sort((a, b) => b[1].amount - a[1].amount).map(([label, value]) => ({ label, ...value })),
    salesByBranch: [...salesByBranchMap.entries()].sort((a, b) => b[1].amount - a[1].amount).map(([label, value]) => ({ label, ...value })),
    salesReturns: [...salesReturnMap.entries()].sort((a, b) => b[1] - a[1]).map(([label, quantity]) => ({ label, quantity })),
    purchasesBySupplier: [...purchasesBySupplierMap.entries()].sort((a, b) => b[1].amount - a[1].amount).map(([label, value]) => ({ label, ...value })),
    purchasesByProduct: [...purchasesByProductMap.entries()].sort((a, b) => b[1].amount - a[1].amount).map(([label, value]) => ({ label, ...value })),
    purchaseReturns: (purchaseReturns ?? []).map((row) => ({ label: supplierMap.get(row.supplier_id) ?? "Unknown supplier", amount: row.total_return_value })),
    currentInventory: scopedInventory.map((row) => ({ label: row.name, quantity: row.stock_quantity })),
    inventoryValuation: scopedInventory.map((row) => ({ label: row.name, quantity: row.stock_quantity, amount: row.stock_quantity * (row.cost_price ?? row.unit_price ?? 0) })).sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)),
    reorderReport: scopedInventory.filter((row) => row.low_stock_threshold != null && row.stock_quantity <= row.low_stock_threshold).map((row) => ({ label: row.name, quantity: row.stock_quantity, secondary: `Reorder at ${row.low_stock_threshold}` })),
    branchExpenses: []
  };
}

export interface TopCustomerRow {
  rank: number;
  customerName: string;
  revenue: number;
}

export async function getTopCustomers(filters: ReportFilters, limit = 5): Promise<TopCustomerRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("sales")
    .select("customer_name, total, location_id")
    .eq("org_id", filters.orgId)
    .eq("status", "completed")
    .gte("sale_date", filters.dateFrom)
    .lt("sale_date", dateToExclusive(filters.dateTo));
  if (filters.locationId) query = query.eq("location_id", filters.locationId);
  else if (filters.allowedLocationIds?.length) query = query.in("location_id", filters.allowedLocationIds);
  const { data } = await query;

  const map = new Map<string, number>();
  for (const s of data ?? []) {
    const name = s.customer_name || "Walk-in Customer";
    map.set(name, (map.get(name) ?? 0) + s.total);
  }
  return [...map.entries()]
    .map(([customerName, revenue]) => ({ customerName, revenue, rank: 0 }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit)
    .map((row, i) => ({ ...row, rank: i + 1 }));
}