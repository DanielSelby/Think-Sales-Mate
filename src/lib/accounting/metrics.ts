import { createClient } from "@/lib/supabase/server";

function daysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

export interface BestSeller {
  name: string;
  quantity: number;
  revenue: number;
}

export interface DailyPoint {
  date: string; // YYYY-MM-DD
  label: string; // short display label, e.g. "Jul 14"
  revenue: number;
  expenses: number;
}

export interface RevenueSlice {
  name: string;
  value: number;
}

export interface FinancialSummary {
  salesToday: number;
  revenue30d: number;
  saleCount30d: number;
  cogs30d: number;
  grossProfit30d: number;
  hasCostData: boolean;
  expenses30d: number;
  netProfit30d: number;
  cashFlow30d: number;
  outstandingInvoicesTotal: number;
  outstandingInvoicesCount: number;
  inventoryValue: number;
  lowStockCount: number;
  bestSellers30d: BestSeller[];
  dailySeries30d: DailyPoint[];
  revenueByProduct30d: RevenueSlice[];
}

/**
 * One query pass that every money-related page reads from, so the
 * dashboard and the Accounting overview can never silently disagree.
 */
export async function getFinancialSummary(orgId: string): Promise<FinancialSummary> {
  const supabase = createClient();
  const since30d = daysAgo(30).toISOString();
  const todayStart = startOfToday().toISOString();

  const [{ data: sales30d }, { data: itemsWithCost }, { data: products }, { data: expenseRows }, { data: invoiceRows }] =
    await Promise.all([
      supabase.from("sales").select("total, created_at").eq("org_id", orgId).gte("created_at", since30d),
      supabase
        .from("sale_items")
        .select("quantity, unit_price, line_total, created_at, product_id, products(name, cost_price)")
        .eq("org_id", orgId)
        .gte("created_at", since30d),
      supabase.from("products").select("stock_quantity, unit_price, low_stock_threshold, is_active").eq("org_id", orgId),
      supabase
        .from("expenses")
        .select("amount, expense_date")
        .eq("org_id", orgId)
        .gte("expense_date", since30d.slice(0, 10)),
      supabase.from("invoices").select("amount, status, paid_at").eq("org_id", orgId)
    ]);

  const revenue30d = (sales30d ?? []).reduce((sum, s) => sum + Number(s.total), 0);
  const salesToday = (sales30d ?? [])
    .filter((s) => s.created_at >= todayStart)
    .reduce((sum, s) => sum + Number(s.total), 0);

  let cogs30d = 0;
  let hasCostData = false;
  const bestSellersMap = new Map<string, BestSeller>();

  for (const item of itemsWithCost ?? []) {
    const product = Array.isArray(item.products) ? item.products[0] : item.products;
    const existing = bestSellersMap.get(item.product_id) ?? {
      name: product?.name ?? "Unknown product",
      quantity: 0,
      revenue: 0
    };
    existing.quantity += item.quantity;
    existing.revenue += Number(item.line_total);
    bestSellersMap.set(item.product_id, existing);

    if (product?.cost_price != null) {
      hasCostData = true;
      cogs30d += Number(product.cost_price) * item.quantity;
    }
  }

  const bestSellers30d = [...bestSellersMap.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 5);
  const grossProfit30d = revenue30d - cogs30d;

  const expenses30d = (expenseRows ?? []).reduce((sum, e) => sum + Number(e.amount), 0);
  const netProfit30d = grossProfit30d - expenses30d;

  const paidInvoices30d = (invoiceRows ?? []).filter(
    (i) => i.status === "paid" && i.paid_at && i.paid_at >= since30d
  );
  const invoicePayments30d = paidInvoices30d.reduce((sum, i) => sum + Number(i.amount), 0);
  const cashFlow30d = revenue30d + invoicePayments30d - expenses30d;

  const outstanding = (invoiceRows ?? []).filter((i) => i.status === "sent" || i.status === "overdue");
  const outstandingInvoicesTotal = outstanding.reduce((sum, i) => sum + Number(i.amount), 0);

  const activeProducts = (products ?? []).filter((p) => p.is_active);
  const inventoryValue = activeProducts.reduce((sum, p) => sum + p.stock_quantity * Number(p.unit_price), 0);
  const lowStockCount = activeProducts.filter((p) => p.stock_quantity <= p.low_stock_threshold).length;

  // Daily Revenue vs Expenses series, last 30 calendar days (including
  // empty days, so the chart's x-axis is continuous).
  const dayBuckets = new Map<string, DailyPoint>();
  for (let i = 29; i >= 0; i--) {
    const d = daysAgo(i);
    const key = dateKey(d);
    dayBuckets.set(key, {
      date: key,
      label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      revenue: 0,
      expenses: 0
    });
  }
  for (const s of sales30d ?? []) {
    const key = s.created_at.slice(0, 10);
    const bucket = dayBuckets.get(key);
    if (bucket) bucket.revenue += Number(s.total);
  }
  for (const e of expenseRows ?? []) {
    const key = e.expense_date.slice(0, 10);
    const bucket = dayBuckets.get(key);
    if (bucket) bucket.expenses += Number(e.amount);
  }
  const dailySeries30d = [...dayBuckets.values()];

  // Revenue by product, top 5 + "Other" — feeds the donut chart.
  const allByRevenue = [...bestSellersMap.values()].sort((a, b) => b.revenue - a.revenue);
  const top5 = allByRevenue.slice(0, 5);
  const otherTotal = allByRevenue.slice(5).reduce((sum, s) => sum + s.revenue, 0);
  const revenueByProduct30d: RevenueSlice[] = top5.map((s) => ({ name: s.name, value: s.revenue }));
  if (otherTotal > 0) revenueByProduct30d.push({ name: "Other", value: otherTotal });

  return {
    salesToday,
    revenue30d,
    saleCount30d: (sales30d ?? []).length,
    cogs30d,
    grossProfit30d,
    hasCostData,
    expenses30d,
    netProfit30d,
    cashFlow30d,
    outstandingInvoicesTotal,
    outstandingInvoicesCount: outstanding.length,
    inventoryValue,
    lowStockCount,
    bestSellers30d,
    dailySeries30d,
    revenueByProduct30d
  };
}