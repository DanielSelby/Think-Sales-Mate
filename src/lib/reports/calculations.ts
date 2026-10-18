import { createClient } from "@/lib/supabase/server";
import { calculateCustomerOutstandingBalances } from "@/lib/sales/customer-outstanding";

export interface ReportFilters {
  orgId: string;
  dateFrom: string; // ISO date
  dateTo: string; // ISO date
  locationId?: string | null;
  allowedLocationIds?: string[];
  canViewBanking?: boolean;
}

export interface OperationalReportRow {
  label: string;
  secondary?: string;
  quantity?: number;
  amount?: number;
  count?: number;
}

export interface OperationalReportData {
  salesByCustomer: OperationalReportRow[];
  discountAnalysis: OperationalReportRow[];
  customerPurchaseHistory: OperationalReportRow[];
  customerOrderTrends: OperationalReportRow[];
  productSalesTrend: OperationalReportRow[];
  salesByProduct: OperationalReportRow[];
  salesByCategory: OperationalReportRow[];
  salesByBranch: OperationalReportRow[];
  productProfitability: OperationalReportRow[];
  customerProfitability: OperationalReportRow[];
  branchProfitability: OperationalReportRow[];
  categoryProfitability: OperationalReportRow[];
  fastMovingProducts: OperationalReportRow[];
  slowMovingProducts: OperationalReportRow[];
  salesReturns: OperationalReportRow[];
  purchasesBySupplier: OperationalReportRow[];
  supplierPerformance: OperationalReportRow[];
  supplierPaymentHistory: OperationalReportRow[];
  supplierPaymentHistoryAvailable: boolean;
  outstandingSupplierBalances: OperationalReportRow[];
  outstandingBalances: OperationalReportRow[];
  purchasesByProduct: OperationalReportRow[];
  purchaseTaxRecorded: OperationalReportRow[];
  purchaseReturns: OperationalReportRow[];
  expiredItems: OperationalReportRow[];
  damagedItems: OperationalReportRow[];
  currentInventory: OperationalReportRow[];
  inventoryValuation: OperationalReportRow[];
  branchStockValue: OperationalReportRow[];
  reorderReport: OperationalReportRow[];
  branchExpenses: OperationalReportRow[];
  expensesByUser: OperationalReportRow[];
  stockTransferReport: OperationalReportRow[];
  stockAdjustmentReport: OperationalReportRow[];
  inventoryMovementReport: OperationalReportRow[];
  userActivityTimeline: OperationalReportRow[];
  mostActiveUsers: OperationalReportRow[];
  inactiveUsers: OperationalReportRow[];
  userActivityReportsAvailable: boolean;
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
  else if (allowedLocationIds) salesQuery = salesQuery.in("location_id", allowedLocationIds);
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
  else if (allowedLocationIds) expenseQuery = expenseQuery.in("location_id", allowedLocationIds);
  const { data: expenses } = await expenseQuery;

  const totalRevenue = (sales ?? []).reduce((sum, s) => sum + s.total, 0);
  const totalTax = (sales ?? []).reduce((sum, s) => sum + (s.tax_amount ?? 0), 0);
  const totalExpenses = (expenses ?? []).reduce((sum, e) => sum + e.amount, 0);

  const paidExpenses = (expenses ?? []).filter((e) => e.payment_status === "paid").reduce((s, e) => s + e.amount, 0);

  let purchaseQuery = supabase
    .from("purchases")
    .select("total, paid_amount, purchase_date, location_id, status")
    .eq("org_id", orgId)
    .in("status", ["ordered", "partially_received", "received"])
    .gte("purchase_date", dateFrom)
    .lt("purchase_date", dateToExclusive(dateTo));
  if (locationId) purchaseQuery = purchaseQuery.eq("location_id", locationId);
  else if (allowedLocationIds) purchaseQuery = purchaseQuery.in("location_id", allowedLocationIds);
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
  else if (allowedLocationIds) stockQuery = stockQuery.in("location_id", allowedLocationIds);
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
  else if (allowedLocationIds) assetsQuery = assetsQuery.in("location", allowedLocationIds);
  const { data: assets } = await assetsQuery;
  const fixedAssets = (assets ?? []).reduce((s, a) => s + a.current_value, 0);

  let purchasesQuery = supabase
    .from("purchases")
    .select("total, paid_amount, status")
    .eq("org_id", orgId)
    .in("status", ["ordered", "partially_received", "received"])
    .lte("purchase_date", dateTo);
  if (locationId) purchasesQuery = purchasesQuery.eq("location_id", locationId);
  else if (allowedLocationIds) purchasesQuery = purchasesQuery.in("location_id", allowedLocationIds);
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
  else if (filters.allowedLocationIds) salesQuery = salesQuery.in("location_id", filters.allowedLocationIds);

  let expenseQuery = supabase
    .from("expenses")
    .select("amount, expense_date, location_id")
    .eq("org_id", filters.orgId)
    .eq("status", "approved")
    .gte("expense_date", filters.dateFrom)
    .lt("expense_date", dateToExclusive(filters.dateTo));
  if (filters.locationId) expenseQuery = expenseQuery.eq("location_id", filters.locationId);
  else if (filters.allowedLocationIds) expenseQuery = expenseQuery.in("location_id", filters.allowedLocationIds);

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
  else if (filters.allowedLocationIds) query = query.in("location_id", filters.allowedLocationIds);
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
    if (allowedLocationIds) return query.in(column, allowedLocationIds);
    return query;
  };

  let salesQuery = supabase
    .from("sales")
    .select("id, total, location_id, sale_date, customer_id, customer_name, discount_amount")
    .eq("org_id", orgId)
    .eq("status", "completed")
    .gte("sale_date", dateFrom)
    .lt("sale_date", dateToExclusive(dateTo));
  salesQuery = applyLocation(salesQuery);
  const { data: sales } = await salesQuery;
  const salesById = new Map((sales ?? []).map((sale) => [sale.id, sale]));
  const saleIds = (sales ?? []).map((row) => row.id);
  const { data: saleItems } = saleIds.length
    ? await supabase.from("sale_items").select("sale_id, product_id, quantity, line_total").in("sale_id", saleIds)
    : { data: [] };
  let productsQuery = supabase.from("products")
    .select("id, name, category, stock_quantity, cost_price, unit_price, low_stock_threshold, expiry_date, location_id, created_at")
    .eq("org_id", orgId);
  const { data: products } = await productsQuery;
  const productMap = new Map((products ?? []).map((row) => [row.id, row]));
  const productNameMap = new Map((products ?? []).map((row) => [row.id, row.name]));
  const { data: locations } = await supabase
    .from("business_locations")
    .select("id, name")
    .eq("org_id", orgId);
  const locationMap = new Map((locations ?? []).map((row) => [row.id, row.name]));
  const salesByCustomerMap = new Map<string, { label: string; count: number; amount: number }>();
  const orderTrendsMap = new Map<string, { count: number; amount: number }>();
  const productSalesTrendsMap = new Map<string, { productId: string; period: string; quantity: number; revenue: number }>();
  const salesByProductMap = new Map<string, { quantity: number; amount: number }>();
  const salesByCategoryMap = new Map<string, { quantity: number; amount: number }>();
  const productProfitMap = new Map<string, { quantity: number; revenue: number; cost: number; costMissing: boolean }>();
  const customerProfitMap = new Map<string, { label: string; quantity: number; revenue: number; cost: number; costMissing: boolean }>();
  const branchProfitMap = new Map<string, { revenue: number; cost: number; costMissing: boolean }>();
  const categoryProfitMap = new Map<string, { revenue: number; cost: number; costMissing: boolean }>();
  for (const sale of sales ?? []) {
    const label = sale.customer_name || "Walk-in Customer";
    const key = sale.customer_id ?? `name:${label}`;
    const current = salesByCustomerMap.get(key) ?? { label, count: 0, amount: 0 };
    current.count += 1;
    current.amount += sale.total;
    salesByCustomerMap.set(key, current);
    const trendKey = sale.sale_date.slice(0, 7);
    const trend = orderTrendsMap.get(trendKey) ?? { count: 0, amount: 0 };
    trend.count += 1;
    trend.amount += sale.total;
    orderTrendsMap.set(trendKey, trend);
    const branchName = sale.location_id ? locationMap.get(sale.location_id) ?? "Unassigned" : "Unassigned";
    const branchCurrent = branchProfitMap.get(branchName) ?? { revenue: 0, cost: 0, costMissing: false };
    branchCurrent.revenue += sale.total;
    branchProfitMap.set(branchName, branchCurrent);
  }
  for (const item of saleItems ?? []) {
    const product = productMap.get(item.product_id);
    const productName = product?.name ?? "Unknown product";
    const category = product?.category || "Uncategorized";
    const sale = salesById.get(item.sale_id);
    const cost = item.quantity * (product?.cost_price ?? 0);
    const productProfit = productProfitMap.get(item.product_id) ?? { quantity: 0, revenue: 0, cost: 0, costMissing: false };
    productProfit.quantity += item.quantity;
    productProfit.revenue += item.line_total;
    productProfit.cost += cost;
    productProfit.costMissing ||= product?.cost_price == null;
    productProfitMap.set(item.product_id, productProfit);
    if (sale) {
      const period = sale.sale_date.slice(0, 7);
      const trendKey = `${item.product_id}:${period}`;
      const trend = productSalesTrendsMap.get(trendKey) ?? { productId: item.product_id, period, quantity: 0, revenue: 0 };
      trend.quantity += item.quantity;
      trend.revenue += item.line_total;
      productSalesTrendsMap.set(trendKey, trend);
    }
    const productCurrent = salesByProductMap.get(productName) ?? { quantity: 0, amount: 0 };
    productCurrent.quantity += item.quantity;
    productCurrent.amount += item.line_total;
    salesByProductMap.set(productName, productCurrent);
    const categoryCurrent = salesByCategoryMap.get(category) ?? { quantity: 0, amount: 0 };
    categoryCurrent.quantity += item.quantity;
    categoryCurrent.amount += item.line_total;
    salesByCategoryMap.set(category, categoryCurrent);
    const categoryProfit = categoryProfitMap.get(category) ?? { revenue: 0, cost: 0, costMissing: false };
    categoryProfit.revenue += item.line_total;
    categoryProfit.cost += cost;
    categoryProfit.costMissing ||= product?.cost_price == null;
    categoryProfitMap.set(category, categoryProfit);
    if (sale) {
      const customerLabel = sale.customer_name || "Walk-in Customer";
      const customerKey = sale.customer_id ?? `name:${customerLabel}`;
      const customerProfit = customerProfitMap.get(customerKey) ?? { label: customerLabel, quantity: 0, revenue: 0, cost: 0, costMissing: false };
      customerProfit.quantity += item.quantity;
      customerProfit.revenue += item.line_total;
      customerProfit.cost += cost;
      customerProfit.costMissing ||= product?.cost_price == null;
      customerProfitMap.set(customerKey, customerProfit);
      const locationName = sale.location_id ? locationMap.get(sale.location_id) ?? "Unassigned" : "Unassigned";
      const branchProfitRow = branchProfitMap.get(locationName) ?? { revenue: 0, cost: 0, costMissing: false };
      branchProfitRow.cost += cost;
      branchProfitRow.costMissing ||= product?.cost_price == null;
      branchProfitMap.set(locationName, branchProfitRow);
    }
  }

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
    .select("id, total, paid_amount, tax_amount, supplier_id, location_id, purchase_date, expected_delivery_date, received_at")
    .eq("org_id", orgId)
    .in("status", ["ordered", "partially_received", "received"])
    .gte("purchase_date", dateFrom)
    .lt("purchase_date", dateToExclusive(dateTo));
  purchasesQuery = applyLocation(purchasesQuery);
  const { data: purchases } = await purchasesQuery;
  const purchasesById = new Map((purchases ?? []).map((purchase) => [purchase.id, purchase]));
  let balancePurchasesQuery = supabase
    .from("purchases")
    .select("id, total, paid_amount, supplier_id, location_id")
    .eq("org_id", orgId)
    .in("status", ["ordered", "partially_received", "received"])
    .lte("purchase_date", dateTo);
  balancePurchasesQuery = applyLocation(balancePurchasesQuery);
  const { data: balancePurchases } = await balancePurchasesQuery;
  const purchaseIds = (purchases ?? []).map((row) => row.id);
  const supplierIds = [...new Set([...(purchases ?? []).map((row) => row.supplier_id), ...(balancePurchases ?? []).map((row) => row.supplier_id)])];
  const [{ data: purchaseItems }, { data: suppliers }] = await Promise.all([
    purchaseIds.length
      ? supabase.from("purchase_items").select("purchase_id, product_id, quantity, quantity_received, line_total").in("purchase_id", purchaseIds)
      : { data: [] },
    supplierIds.length
      ? supabase.from("suppliers").select("id, name").in("id", supplierIds)
      : { data: [] }
  ]);
  const supplierMap = new Map((suppliers ?? []).map((row) => [row.id, row.name]));
  let supplierPaymentHistory: OperationalReportRow[] = [];
  if (filters.canViewBanking) {
    const { data: bankTransactions } = await supabase
      .from("bank_transactions")
      .select("amount, transaction_date, description")
      .eq("org_id", orgId)
      .eq("type", "withdrawal")
      .gte("transaction_date", dateFrom)
      .lte("transaction_date", dateTo);
    const purchaseIdsFromTransactions = [...new Set((bankTransactions ?? []).flatMap((transaction) => {
      const match = transaction.description?.match(/supplier payment for purchase ([0-9a-f-]{36})/i);
      return match ? [match[1]] : [];
    }))];
    let paidPurchasesQuery = supabase
      .from("purchases")
      .select("id, supplier_id, location_id")
      .eq("org_id", orgId)
      .in("id", purchaseIdsFromTransactions);
    paidPurchasesQuery = applyLocation(paidPurchasesQuery);
    const { data: paidPurchases } = purchaseIdsFromTransactions.length
      ? await paidPurchasesQuery
      : { data: [] };
    const paidPurchaseMap = new Map((paidPurchases ?? []).map((purchase) => [purchase.id, purchase]));
    const paymentSupplierIds = [...new Set((paidPurchases ?? []).map((purchase) => purchase.supplier_id))];
    const { data: paymentSuppliers } = paymentSupplierIds.length
      ? await supabase.from("suppliers").select("id, name").in("id", paymentSupplierIds)
      : { data: [] };
    for (const supplier of paymentSuppliers ?? []) supplierMap.set(supplier.id, supplier.name);
    const paymentRows = new Map<string, { label: string; date: string; count: number; amount: number }>();
    for (const transaction of bankTransactions ?? []) {
      const match = transaction.description?.match(/supplier payment for purchase ([0-9a-f-]{36})/i);
      const purchase = match ? paidPurchaseMap.get(match[1]) : undefined;
      if (!purchase) continue;
      const supplier = supplierMap.get(purchase.supplier_id) ?? "Unknown supplier";
      const key = `${purchase.supplier_id}:${transaction.transaction_date}`;
      const row = paymentRows.get(key) ?? { label: supplier, date: transaction.transaction_date, count: 0, amount: 0 };
      row.count += 1;
      row.amount += transaction.amount;
      paymentRows.set(key, row);
    }
    supplierPaymentHistory = [...paymentRows.values()]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((row) => ({ label: row.label, secondary: row.date, count: row.count, amount: row.amount }));
  }
  const supplierPerformanceMap = new Map<string, { label: string; purchases: number; products: Set<string>; value: number; onTime: number; deliveryTotal: number }>();
  const outstandingSupplierMap = new Map<string, number>();
  let totalPurchaseTaxPaidEstimate = 0;
  for (const purchase of purchases ?? []) {
    const supplierName = supplierMap.get(purchase.supplier_id) ?? "Unknown supplier";
    const stats = supplierPerformanceMap.get(purchase.supplier_id) ?? { label: supplierName, purchases: 0, products: new Set<string>(), value: 0, onTime: 0, deliveryTotal: 0 };
    stats.purchases += 1;
    stats.value += purchase.total;
    if (purchase.received_at && purchase.expected_delivery_date) {
      stats.deliveryTotal += 1;
      if (purchase.received_at.slice(0, 10) <= purchase.expected_delivery_date) stats.onTime += 1;
    }
    supplierPerformanceMap.set(purchase.supplier_id, stats);
    if (purchase.total > 0) totalPurchaseTaxPaidEstimate += purchase.tax_amount * Math.min(purchase.paid_amount, purchase.total) / purchase.total;
  }
  for (const purchase of balancePurchases ?? []) {
    const supplierName = supplierMap.get(purchase.supplier_id) ?? "Unknown supplier";
    const due = Math.max(0, purchase.total - purchase.paid_amount);
    outstandingSupplierMap.set(supplierName, (outstandingSupplierMap.get(supplierName) ?? 0) + due);
  }
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
    const purchase = purchasesById.get(item.purchase_id);
    const supplierStats = purchase ? supplierPerformanceMap.get(purchase.supplier_id) : undefined;
    supplierStats?.products.add(item.product_id);
    const current = purchasesByProductMap.get(name) ?? { quantity: 0, amount: 0 };
    current.quantity += item.quantity;
    current.amount += item.line_total;
    purchasesByProductMap.set(name, current);
  }

  let saleReturnsQuery = supabase
    .from("sale_return_items")
    .select("product_id, quantity, created_at, sale_id")
    .eq("org_id", orgId)
    .gte("created_at", dateFrom)
    .lt("created_at", dateToExclusive(dateTo));
  const { data: saleReturns } = await saleReturnsQuery;
  const returnedProductIds = [...new Set((saleReturns ?? []).map((row) => row.product_id))];
  const missingReturnedProductIds = returnedProductIds.filter((id) => !productNameMap.has(id));
  if (missingReturnedProductIds.length) {
    const { data: returnedProducts } = await supabase
      .from("products")
      .select("id, name")
      .in("id", missingReturnedProductIds);
    for (const product of returnedProducts ?? []) productNameMap.set(product.id, product.name);
  }
  const returnSaleIds = [...new Set((saleReturns ?? []).map((row) => row.sale_id))];
  let scopedReturnSaleIds = new Set(returnSaleIds);
  if (returnSaleIds.length && (locationId || allowedLocationIds)) {
    let returnSalesQuery = supabase
      .from("sales")
      .select("id")
      .eq("org_id", orgId)
      .in("id", returnSaleIds);
    returnSalesQuery = applyLocation(returnSalesQuery);
    const { data: returnSales } = await returnSalesQuery;
    scopedReturnSaleIds = new Set((returnSales ?? []).map((row) => row.id));
  }
  const salesReturnMap = new Map<string, number>();
  for (const item of saleReturns ?? []) {
    if (!scopedReturnSaleIds.has(item.sale_id)) continue;
    const name = productNameMap.get(item.product_id) ?? "Unknown product";
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

  const inventoryMovementRows: OperationalReportRow[] = [];
  for (const item of saleItems ?? []) {
    const sale = salesById.get(item.sale_id);
    inventoryMovementRows.push({
      label: productNameMap.get(item.product_id) ?? "Unknown product",
      secondary: `Sale · ${sale?.sale_date ?? ""}`,
      quantity: -item.quantity
    });
  }
  for (const item of purchaseItems ?? []) {
    const purchase = purchasesById.get(item.purchase_id);
    inventoryMovementRows.push({
      label: purchaseProductMap.get(item.product_id) ?? "Unknown product",
      secondary: `Purchase · ${purchase?.purchase_date ?? ""}`,
      quantity: item.quantity_received
    });
  }
  for (const item of saleReturns ?? []) {
    if (!scopedReturnSaleIds.has(item.sale_id)) continue;
    inventoryMovementRows.push({
      label: productNameMap.get(item.product_id) ?? "Unknown product",
      secondary: `Sale return · ${item.created_at.slice(0, 10)}`,
      quantity: item.quantity
    });
  }
  const purchaseReturnIds = (purchaseReturns ?? []).map((row) => row.id);
  const { data: purchaseReturnItems } = purchaseReturnIds.length
    ? await supabase.from("purchase_return_items").select("return_id, product_id, return_qty").in("return_id", purchaseReturnIds)
    : { data: [] };
  const purchaseReturnsById = new Map((purchaseReturns ?? []).map((row) => [row.id, row]));
  for (const item of purchaseReturnItems ?? []) {
    const purchaseReturn = purchaseReturnsById.get(item.return_id);
    inventoryMovementRows.push({
      label: productNameMap.get(item.product_id) ?? "Unknown product",
      secondary: `Purchase return · ${purchaseReturn?.return_date ?? ""}`,
      quantity: -item.return_qty
    });
  }

  let balanceSalesQuery = supabase
    .from("sales")
    .select("id, customer_id, customer_name, sale_number, total, amount_paid")
    .eq("org_id", orgId)
    .in("status", ["completed", "returned"])
    .lte("sale_date", dateTo);
  balanceSalesQuery = applyLocation(balanceSalesQuery);
  let balancePaymentsQuery = supabase
    .from("customer_credit_payments")
    .select("invoice_id, amount, invoice_location_id")
    .eq("org_id", orgId)
    .lte("payment_date", dateTo);
  balancePaymentsQuery = applyLocation(balancePaymentsQuery, "invoice_location_id");
  const [{ data: balanceSales }, { data: balancePayments }, { data: legacyInvoices }] = await Promise.all([
    balanceSalesQuery,
    balancePaymentsQuery,
    locationId || allowedLocationIds
      ? Promise.resolve({ data: [] })
      : supabase.from("invoices").select("customer_name, amount").eq("org_id", orgId).in("status", ["sent", "overdue"]).lte("created_at", dateToExclusive(dateTo))
  ]);
  const customerBalances = calculateCustomerOutstandingBalances(balanceSales ?? [], balancePayments ?? [], legacyInvoices ?? []);
  const balanceCustomerIds = [...customerBalances.byCustomerId.keys()];
  const { data: balanceCustomers } = balanceCustomerIds.length
    ? await supabase.from("customers").select("id, name").in("id", balanceCustomerIds)
    : { data: [] };
  const balanceCustomerNames = new Map((balanceCustomers ?? []).map((customer) => [customer.id, customer.name]));
  const outstandingBalanceRows = [
    ...[...customerBalances.byCustomerId.entries()].map(([id, amount]) => ({ label: balanceCustomerNames.get(id) ?? "Customer", amount })),
    ...[...customerBalances.byCustomerName.entries()].map(([name, amount]) => ({ label: name, amount }))
  ].sort((a, b) => b.amount - a.amount);

  let stockAdjustmentsQuery = supabase
    .from("stock_adjustments")
    .select("id, adjustment_number, adjustment_date, location_id, reason, status")
    .eq("org_id", orgId)
    .eq("status", "completed")
    .gte("adjustment_date", dateFrom)
    .lte("adjustment_date", dateTo);
  stockAdjustmentsQuery = applyLocation(stockAdjustmentsQuery);
  const { data: stockAdjustments } = await stockAdjustmentsQuery;
  const adjustmentIds = (stockAdjustments ?? []).map((row) => row.id);
  const { data: adjustmentItems } = adjustmentIds.length
    ? await supabase.from("stock_adjustment_items").select("adjustment_id, product_id, system_stock, counted_stock, reason").in("adjustment_id", adjustmentIds)
    : { data: [] };
  const adjustmentNumberMap = new Map((stockAdjustments ?? []).map((row) => [row.id, row.adjustment_number]));
  const adjustmentsById = new Map((stockAdjustments ?? []).map((row) => [row.id, row]));
  const damagedItemsMap = new Map<string, { quantity: number; count: number }>();
  for (const item of adjustmentItems ?? []) {
    const reason = item.reason ?? adjustmentsById.get(item.adjustment_id)?.reason ?? "";
    if (!/damage|defect|expired|spoiled/i.test(reason)) continue;
    const label = productNameMap.get(item.product_id) ?? "Unknown product";
    const current = damagedItemsMap.get(label) ?? { quantity: 0, count: 0 };
    current.quantity += Math.abs(item.counted_stock - item.system_stock);
    current.count += 1;
    damagedItemsMap.set(label, current);
  }
  for (const item of adjustmentItems ?? []) {
    const adjustment = adjustmentsById.get(item.adjustment_id);
    inventoryMovementRows.push({
      label: productNameMap.get(item.product_id) ?? "Unknown product",
      secondary: `Adjustment #${adjustmentNumberMap.get(item.adjustment_id) ?? "—"} · ${adjustment?.adjustment_date ?? ""}`,
      quantity: item.counted_stock - item.system_stock
    });
  }

  let transfersQuery = supabase
    .from("stock_transfers")
    .select("id, transfer_number, status, from_location_id, to_location_id, created_at")
    .eq("org_id", orgId)
    .gte("created_at", dateFrom)
    .lt("created_at", dateToExclusive(dateTo));
  const { data: transfers } = await transfersQuery;
  const scopedTransfers = (transfers ?? []).filter((transfer) => {
    const branchIds = locationId ? [locationId] : allowedLocationIds;
    return !branchIds || branchIds.includes(transfer.from_location_id) || branchIds.includes(transfer.to_location_id);
  });
  const transferIds = scopedTransfers.map((row) => row.id);
  const { data: transferItems } = transferIds.length
    ? await supabase.from("stock_transfer_items").select("transfer_id, product_id, quantity").in("transfer_id", transferIds)
    : { data: [] };
  const transferItemsMap = new Map<string, number>();
  const transfersById = new Map(scopedTransfers.map((transfer) => [transfer.id, transfer]));
  const scopedBranchId = locationId ?? (allowedLocationIds?.length === 1 ? allowedLocationIds[0] : undefined);
  for (const item of transferItems ?? []) {
    const label = productNameMap.get(item.product_id) ?? "Unknown product";
    transferItemsMap.set(item.transfer_id, (transferItemsMap.get(item.transfer_id) ?? 0) + item.quantity);
    const transfer = transfersById.get(item.transfer_id);
    inventoryMovementRows.push({
      label,
      secondary: `Transfer #${transfer?.transfer_number ?? "—"} · ${locationMap.get(transfer?.from_location_id ?? "") ?? "Unknown"} → ${locationMap.get(transfer?.to_location_id ?? "") ?? "Unknown"}`,
      quantity: !transfer || transfer.status === "cancelled" || transfer.status === "pending"
        ? 0
        : scopedBranchId === transfer.from_location_id
          ? -item.quantity
          : scopedBranchId === transfer.to_location_id
            ? item.quantity
            : 0
    });
  }

  let branchExpensesQuery = supabase
    .from("expenses")
    .select("amount, location_id, recorded_by")
    .eq("org_id", orgId)
    .eq("status", "approved")
    .gte("expense_date", dateFrom)
    .lt("expense_date", dateToExclusive(dateTo));
  branchExpensesQuery = applyLocation(branchExpensesQuery);
  const { data: branchExpenses } = await branchExpensesQuery;
  const branchExpensesMap = new Map<string, number>();
  const expensesByUserMap = new Map<string, number>();
  const expenseUserIds = [...new Set((branchExpenses ?? []).map((expense) => expense.recorded_by))];
  const { data: expenseUsers } = expenseUserIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", expenseUserIds)
    : { data: [] };
  const expenseUserMap = new Map((expenseUsers ?? []).map((user) => [user.id, user.full_name || "Unknown user"]));
  for (const expense of branchExpenses ?? []) {
    const label = expense.location_id ? locationMap.get(expense.location_id) ?? "Unassigned" : "Unassigned";
    branchExpensesMap.set(label, (branchExpensesMap.get(label) ?? 0) + expense.amount);
    const user = expenseUserMap.get(expense.recorded_by) ?? "Unknown user";
    expensesByUserMap.set(user, (expensesByUserMap.get(user) ?? 0) + expense.amount);
  }

  const userActivityReportsAvailable = !locationId && allowedLocationIds === undefined;
  let userActivityTimeline: OperationalReportRow[] = [];
  let mostActiveUsers: OperationalReportRow[] = [];
  let inactiveUsers: OperationalReportRow[] = [];
  if (userActivityReportsAvailable) {
    const [{ data: auditLogs }, { data: members }] = await Promise.all([
      supabase
        .from("audit_logs")
        .select("actor_id, action, entity_type, created_at")
        .eq("org_id", orgId)
        .gte("created_at", dateFrom)
        .lt("created_at", dateToExclusive(dateTo))
        .order("created_at", { ascending: false })
        .limit(10000),
      supabase.from("organization_members").select("user_id").eq("org_id", orgId).eq("status", "active")
    ]);
    const actorIds = [...new Set([
      ...(auditLogs ?? []).map((row) => row.actor_id).filter((id): id is string => Boolean(id)),
      ...(members ?? []).flatMap((member) => member.user_id ? [member.user_id] : [])
    ])];
    const { data: activityProfiles } = actorIds.length
      ? await supabase.from("profiles").select("id, full_name").in("id", actorIds)
      : { data: [] };
    const activityProfileMap = new Map((activityProfiles ?? []).map((profile) => [profile.id, profile.full_name || "Unknown user"]));
    const activityCounts = new Map<string, number>();
    for (const row of auditLogs ?? []) {
      if (row.actor_id) activityCounts.set(row.actor_id, (activityCounts.get(row.actor_id) ?? 0) + 1);
    }
    userActivityTimeline = (auditLogs ?? []).slice(0, 100).map((row) => ({
      label: row.actor_id ? activityProfileMap.get(row.actor_id) ?? "Unknown user" : "System",
      secondary: `${row.action} · ${row.entity_type} · ${new Date(row.created_at).toLocaleString()}`,
      count: 1
    }));
    mostActiveUsers = [...activityCounts.entries()]
      .map(([userId, count]) => ({ label: activityProfileMap.get(userId) ?? "Unknown user", count }))
      .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
      .slice(0, 50);
    inactiveUsers = (members ?? [])
      .filter((member): member is typeof member & { user_id: string } => Boolean(member.user_id))
      .filter((member) => !activityCounts.has(member.user_id))
      .map((member) => ({ label: activityProfileMap.get(member.user_id) ?? "Unknown user", secondary: "No recorded audit activity in this period" }));
  }

  let inventoryQuery = supabase
    .from("products")
    .select("id, name, stock_quantity, cost_price, unit_price, low_stock_threshold, expiry_date")
    .eq("org_id", orgId)
    .eq("is_active", true);
  const { data: inventory } = await inventoryQuery;
  let stockLevelsQuery = supabase.from("product_stock_levels")
    .select("product_id, quantity, location_id")
    .eq("org_id", orgId);
  stockLevelsQuery = applyLocation(stockLevelsQuery);
  const { data: stockLevels } = await stockLevelsQuery;
  const stockQuantitiesByProduct = new Map<string, number>();
  const stockValueByBranch = new Map<string, { amount: number; missingCost: boolean }>();
  for (const level of stockLevels ?? []) {
    const product = (inventory ?? []).find((row) => row.id === level.product_id);
    if (!product) continue;
    stockQuantitiesByProduct.set(level.product_id, (stockQuantitiesByProduct.get(level.product_id) ?? 0) + level.quantity);
    const branch = locationMap.get(level.location_id) ?? "Unassigned";
    const value = stockValueByBranch.get(branch) ?? { amount: 0, missingCost: false };
    if (product.cost_price == null) value.missingCost ||= level.quantity > 0;
    else value.amount += level.quantity * product.cost_price;
    stockValueByBranch.set(branch, value);
  }
  const scopedInventory = locationId || allowedLocationIds
    ? await (async () => {
        return (inventory ?? []).map((row) => ({ ...row, stock_quantity: stockQuantitiesByProduct.get(row.id) ?? 0 }));
      })()
    : inventory ?? [];
  const inventoryStock = new Map(scopedInventory.map((row) => [row.id, row.stock_quantity]));
  const expiringInventory = scopedInventory.filter((row) => row.expiry_date && row.expiry_date <= dateTo && (inventoryStock.get(row.id) ?? 0) > 0);
  const fastMoving = [...productProfitMap.entries()]
    .map(([id, row]) => ({ id, row, product: productMap.get(id) }))
    .filter(({ product }) => product && (inventoryStock.get(product.id) ?? 0) > 0)
    .sort((a, b) => b.row.quantity - a.row.quantity)
    .slice(0, 50);
  const slowMoving = scopedInventory
    .filter((product) => product.stock_quantity > 0)
    .map((product) => ({ product, sold: productProfitMap.get(product.id)?.quantity ?? 0 }))
    .sort((a, b) => a.sold - b.sold)
    .slice(0, 50);
  const supplierPerformanceRows = [...supplierPerformanceMap.values()]
    .sort((a, b) => b.value - a.value)
    .map((row) => ({
      label: row.label,
      count: row.purchases,
      quantity: row.products.size,
      amount: row.value,
      secondary: `${row.purchases} purchases · ${row.products.size} products · ${row.deliveryTotal ? `${Math.round(row.onTime / row.deliveryTotal * 100)}% on-time` : "no delivery-date data"}`
    }));

  return {
    salesByCustomer: [...salesByCustomerMap.values()]
      .sort((a, b) => b.amount - a.amount)
      .map(({ label, count, amount }) => ({ label, count, amount })),
    customerPurchaseHistory: [...(sales ?? [])]
      .sort((a, b) => b.sale_date.localeCompare(a.sale_date))
      .slice(0, 100)
      .map((sale) => ({ label: sale.customer_name || "Walk-in Customer", secondary: sale.sale_date, count: 1, amount: sale.total })),
    customerOrderTrends: [...orderTrendsMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, value]) => ({ label, count: value.count, amount: value.amount })),
    productSalesTrend: [...productSalesTrendsMap.values()]
      .map((row) => ({ label: `${productNameMap.get(row.productId) ?? "Unknown product"} · ${row.period}`, quantity: row.quantity, amount: row.revenue }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    discountAnalysis: [{
      label: "Discounted sales",
      count: (sales ?? []).filter((sale) => sale.discount_amount > 0).length,
      amount: (sales ?? []).reduce((sum, sale) => sum + sale.discount_amount, 0)
    }],
    salesByProduct: [...salesByProductMap.entries()].sort((a, b) => b[1].amount - a[1].amount).map(([label, value]) => ({ label, ...value })),
    salesByCategory: [...salesByCategoryMap.entries()].sort((a, b) => b[1].amount - a[1].amount).map(([label, value]) => ({ label, ...value })),
    salesByBranch: [...salesByBranchMap.entries()].sort((a, b) => b[1].amount - a[1].amount).map(([label, value]) => ({ label, ...value })),
    productProfitability: [...productProfitMap.entries()].map(([id, row]) => ({
      label: productNameMap.get(id) ?? "Unknown product",
      quantity: row.quantity,
      amount: row.costMissing ? undefined : row.revenue - row.cost,
      secondary: row.costMissing ? `Revenue ${row.revenue.toFixed(2)} · cost data incomplete` : `Revenue ${row.revenue.toFixed(2)} · estimated cost ${row.cost.toFixed(2)}`
    })).sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)),
    customerProfitability: [...customerProfitMap.values()].map((row) => ({
      label: row.label,
      quantity: row.quantity,
      amount: row.costMissing ? undefined : row.revenue - row.cost,
      secondary: row.costMissing ? `Revenue ${row.revenue.toFixed(2)} · cost data incomplete` : `Revenue ${row.revenue.toFixed(2)} · estimated cost ${row.cost.toFixed(2)}`
    })).sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)),
    branchProfitability: [...branchProfitMap.entries()].map(([label, row]) => ({
      label,
      amount: row.costMissing ? undefined : row.revenue - row.cost - (branchExpensesMap.get(label) ?? 0),
      secondary: row.costMissing
        ? `Revenue ${row.revenue.toFixed(2)} · COGS data incomplete · expenses ${(branchExpensesMap.get(label) ?? 0).toFixed(2)}`
        : `Revenue ${row.revenue.toFixed(2)} · estimated COGS ${row.cost.toFixed(2)} · expenses ${(branchExpensesMap.get(label) ?? 0).toFixed(2)}`
    })).sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)),
    categoryProfitability: [...categoryProfitMap.entries()].map(([label, row]) => ({
      label,
      amount: row.costMissing ? undefined : row.revenue - row.cost,
      secondary: row.costMissing ? `Revenue ${row.revenue.toFixed(2)} · cost data incomplete` : `Revenue ${row.revenue.toFixed(2)} · estimated cost ${row.cost.toFixed(2)}`
    })).sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)),
    fastMovingProducts: fastMoving.map(({ id, row }) => ({ label: productNameMap.get(id) ?? "Unknown product", quantity: row.quantity, amount: row.revenue })),
    slowMovingProducts: slowMoving.map(({ product, sold }) => ({ label: product.name, quantity: sold, secondary: `${product.stock_quantity} in stock · ${sold ? `${sold} sold` : "no sales"} in selected period` })),
    salesReturns: [...salesReturnMap.entries()].sort((a, b) => b[1] - a[1]).map(([label, quantity]) => ({ label, quantity })),
    purchasesBySupplier: [...purchasesBySupplierMap.entries()].sort((a, b) => b[1].amount - a[1].amount).map(([label, value]) => ({ label, ...value })),
    supplierPerformance: supplierPerformanceRows,
    supplierPaymentHistory,
    supplierPaymentHistoryAvailable: filters.canViewBanking === true,
    outstandingSupplierBalances: [...outstandingSupplierMap.entries()].map(([label, amount]) => ({ label, amount })).filter((row) => row.amount > 0).sort((a, b) => b.amount - a.amount),
    purchaseTaxRecorded: [{ label: "Estimated tax portion paid", count: (purchases ?? []).filter((purchase) => purchase.paid_amount > 0).length, amount: totalPurchaseTaxPaidEstimate }],
    purchasesByProduct: [...purchasesByProductMap.entries()].sort((a, b) => b[1].amount - a[1].amount).map(([label, value]) => ({ label, ...value })),
    expiredItems: expiringInventory.map((row) => ({ label: row.name, quantity: row.stock_quantity, secondary: `Expired ${row.expiry_date}` })),
    damagedItems: [...damagedItemsMap.entries()].map(([label, row]) => ({ label, quantity: row.quantity, count: row.count })).sort((a, b) => (b.quantity ?? 0) - (a.quantity ?? 0)),
    purchaseReturns: (purchaseReturns ?? []).map((row) => ({ label: supplierMap.get(row.supplier_id) ?? "Unknown supplier", amount: row.total_return_value })),
    currentInventory: scopedInventory.map((row) => ({ label: row.name, quantity: row.stock_quantity })),
    inventoryValuation: scopedInventory.map((row) => ({
      label: row.name,
      quantity: row.stock_quantity,
      amount: row.cost_price == null ? undefined : row.stock_quantity * row.cost_price,
      secondary: row.cost_price == null ? "Cost price missing" : undefined
    })).sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)),
    branchStockValue: [...stockValueByBranch.entries()].map(([label, value]) => ({
      label,
      amount: value.missingCost ? undefined : value.amount,
      secondary: value.missingCost ? "Some stocked products have no cost price" : undefined
    })).sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)),
    reorderReport: scopedInventory.filter((row) => row.low_stock_threshold != null && row.stock_quantity <= row.low_stock_threshold).map((row) => ({ label: row.name, quantity: row.stock_quantity, secondary: `Reorder at ${row.low_stock_threshold}` })),
    outstandingBalances: outstandingBalanceRows,
    branchExpenses: [...branchExpensesMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, amount]) => ({ label, amount })),
    expensesByUser: [...expensesByUserMap.entries()].map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount),
    stockTransferReport: scopedTransfers.map((transfer) => ({
      label: `Transfer #${transfer.transfer_number}`,
      secondary: `${locationMap.get(transfer.from_location_id) ?? "Unknown"} → ${locationMap.get(transfer.to_location_id) ?? "Unknown"} · ${transfer.status}`,
      quantity: transferItemsMap.get(transfer.id) ?? 0
    })),
    stockAdjustmentReport: (stockAdjustments ?? []).map((adjustment) => ({
      label: `Adjustment #${adjustment.adjustment_number}`,
      secondary: `${adjustment.adjustment_date} · ${adjustment.reason ?? "No reason"}`,
      count: (adjustmentItems ?? []).filter((item) => item.adjustment_id === adjustment.id).length
    })),
    inventoryMovementReport: inventoryMovementRows,
    userActivityTimeline,
    mostActiveUsers,
    inactiveUsers,
    userActivityReportsAvailable
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
    .select("customer_id, customer_name, total, location_id")
    .eq("org_id", filters.orgId)
    .eq("status", "completed")
    .gte("sale_date", filters.dateFrom)
    .lt("sale_date", dateToExclusive(filters.dateTo));
  if (filters.locationId) query = query.eq("location_id", filters.locationId);
  else if (filters.allowedLocationIds) query = query.in("location_id", filters.allowedLocationIds);
  const { data } = await query;

  const map = new Map<string, { customerName: string; revenue: number }>();
  for (const s of data ?? []) {
    const name = s.customer_name || "Walk-in Customer";
    const key = s.customer_id ?? `name:${name}`;
    const current = map.get(key) ?? { customerName: name, revenue: 0 };
    current.revenue += s.total;
    map.set(key, current);
  }
  return [...map.values()]
    .map(({ customerName, revenue }) => ({ customerName, revenue, rank: 0 }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit)
    .map((row, i) => ({ ...row, rank: i + 1 }));
}