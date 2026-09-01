import { createClient } from "@/lib/supabase/server";

export interface ReportFilters {
  orgId: string;
  dateFrom: string; // ISO date
  dateTo: string; // ISO date
  locationId?: string | null;
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
  const { orgId, dateFrom, dateTo, locationId } = filters;

  let salesQuery = supabase
    .from("sales")
    .select("id, total, tax_amount, customer_name, sale_date, location_id, status")
    .eq("org_id", orgId)
    .eq("status", "completed")
    .gte("sale_date", dateFrom)
    .lte("sale_date", dateTo);
  if (locationId) salesQuery = salesQuery.eq("location_id", locationId);
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
    .lte("expense_date", dateTo);
  if (locationId) expenseQuery = expenseQuery.eq("location_id", locationId);
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
    .lte("purchase_date", dateTo);
  if (locationId) purchaseQuery = purchaseQuery.eq("location_id", locationId);
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
export async function getBalanceSheet(orgId: string, asOfDate: string): Promise<BalanceSheetSummary> {
  const supabase = await createClient();

  const { data: bankAccounts } = await supabase.from("bank_accounts").select("current_balance").eq("org_id", orgId);
  const cash = (bankAccounts ?? []).reduce((s, a) => s + a.current_balance, 0);

  const { data: stockLevels } = await supabase
    .from("product_stock_levels")
    .select("quantity, products(unit_price)")
    .eq("org_id", orgId);
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

  const { data: assets } = await supabase.from("assets").select("current_value").eq("org_id", orgId).eq("status", "in_use");
  const fixedAssets = (assets ?? []).reduce((s, a) => s + a.current_value, 0);

  const { data: purchases } = await supabase
    .from("purchases")
    .select("total, paid_amount, status")
    .eq("org_id", orgId)
    .neq("status", "cancelled");
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
    .lte("sale_date", filters.dateTo);
  if (filters.locationId) salesQuery = salesQuery.eq("location_id", filters.locationId);

  let expenseQuery = supabase
    .from("expenses")
    .select("amount, expense_date, location_id")
    .eq("org_id", filters.orgId)
    .eq("status", "approved")
    .gte("expense_date", filters.dateFrom)
    .lte("expense_date", filters.dateTo);
  if (filters.locationId) expenseQuery = expenseQuery.eq("location_id", filters.locationId);

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
    .lte("expense_date", filters.dateTo);
  if (filters.locationId) query = query.eq("location_id", filters.locationId);
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
    .lte("sale_date", filters.dateTo);
  if (filters.locationId) query = query.eq("location_id", filters.locationId);
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