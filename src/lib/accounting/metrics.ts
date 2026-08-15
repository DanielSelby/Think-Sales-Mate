import { createClient } from "@/lib/supabase/server";

function daysAgo(days: number, from: Date = new Date()) {
  const d = new Date(from);
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
  date: string;
  label: string;
  revenue: number;
  expenses: number;
}

export interface RevenueSlice {
  name: string;
  value: number;
}

export interface Trend {
  pct: number | null;
  direction: "up" | "down" | "flat";
}

export interface FinancialSummary {
  periodDays: number;
  periodLabel: string;
  salesToday: number;
  revenue30d: number;
  saleCount30d: number;
  cogs30d: number;
  grossProfit30d: number;
  hasCostData: boolean;
  expenses30d: number;
  netProfit30d: number;
  cashFlow30d: number;
  cashIn30d: number;
  cashOut30d: number;
  outstandingInvoicesTotal: number;
  outstandingInvoicesCount: number;
  inventoryValue: number;
  totalActiveProducts: number;
  lowStockCount: number;
  outOfStockCount: number;
  avgDailySales: number;
  avgOrderValue: number;
  bestDay: { label: string; revenue: number } | null;
  bestSellers30d: BestSeller[];
  dailySeries30d: DailyPoint[];
  revenueByProduct30d: RevenueSlice[];
  trends: {
    revenue: Trend;
    grossProfit: Trend;
    orders: Trend;
    expenses: Trend;
    netProfit: Trend;
  };
}

function computeTrend(current: number, previous: number): Trend {
  if (previous === 0) {
    if (current === 0) return { pct: null, direction: "flat" };
    return { pct: null, direction: current > 0 ? "up" : "down" };
  }
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  return { pct, direction: pct > 0.5 ? "up" : pct < -0.5 ? "down" : "flat" };
}

export async function getFinancialSummary(orgId: string, days: number = 30): Promise<FinancialSummary> {
  const supabase = await createClient();
  const periodStart = daysAgo(days).toISOString();
  const prevPeriodStart = daysAgo(days * 2).toISOString();
  const todayStart = startOfToday().toISOString();

  const [
    { data: salesPeriod },
    { data: salesPrevPeriod },
    { data: itemsWithCost },
    { data: products },
    { data: expenseRows },
    { data: expenseRowsPrev },
    { data: invoiceRows }
  ] = await Promise.all([
    supabase.from("sales").select("total, created_at").eq("org_id", orgId).gte("created_at", periodStart),
    supabase
      .from("sales")
      .select("total, created_at")
      .eq("org_id", orgId)
      .gte("created_at", prevPeriodStart)
      .lt("created_at", periodStart),
    supabase
      .from("sale_items")
      .select("quantity, unit_price, line_total, created_at, product_id, products(name, cost_price)")
      .eq("org_id", orgId)
      .gte("created_at", periodStart),
    supabase.from("products").select("stock_quantity, unit_price, low_stock_threshold, is_active").eq("org_id", orgId),
    supabase.from("expenses").select("amount, expense_date").eq("org_id", orgId).gte("expense_date", periodStart.slice(0, 10)),
    supabase
      .from("expenses")
      .select("amount, expense_date")
      .eq("org_id", orgId)
      .gte("expense_date", prevPeriodStart.slice(0, 10))
      .lt("expense_date", periodStart.slice(0, 10)),
    supabase.from("invoices").select("amount, status, paid_at").eq("org_id", orgId)
  ]);

  const revenue30d = (salesPeriod ?? []).reduce((sum, s) => sum + Number(s.total), 0);
  const revenuePrev = (salesPrevPeriod ?? []).reduce((sum, s) => sum + Number(s.total), 0);
  const saleCount30d = (salesPeriod ?? []).length;
  const saleCountPrev = (salesPrevPeriod ?? []).length;

  const salesToday = (salesPeriod ?? [])
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
  const grossMargin = revenue30d > 0 ? grossProfit30d / revenue30d : 0;
  const grossProfitPrev = revenuePrev * grossMargin;

  const expenses30d = (expenseRows ?? []).reduce((sum, e) => sum + Number(e.amount), 0);
  const expensesPrev = (expenseRowsPrev ?? []).reduce((sum, e) => sum + Number(e.amount), 0);
  const netProfit30d = grossProfit30d - expenses30d;
  const netProfitPrev = grossProfitPrev - expensesPrev;

  const paidInvoicesPeriod = (invoiceRows ?? []).filter((i) => i.status === "paid" && i.paid_at && i.paid_at >= periodStart);
  const invoicePayments30d = paidInvoicesPeriod.reduce((sum, i) => sum + Number(i.amount), 0);
  const cashIn30d = revenue30d + invoicePayments30d;
  const cashOut30d = expenses30d;
  const cashFlow30d = cashIn30d - cashOut30d;

  const outstanding = (invoiceRows ?? []).filter((i) => i.status === "sent" || i.status === "overdue");
  const outstandingInvoicesTotal = outstanding.reduce((sum, i) => sum + Number(i.amount), 0);

  const activeProducts = (products ?? []).filter((p) => p.is_active);
  const inventoryValue = activeProducts.reduce((sum, p) => sum + p.stock_quantity * Number(p.unit_price), 0);
  const lowStockCount = activeProducts.filter((p) => p.stock_quantity <= p.low_stock_threshold).length;
  const outOfStockCount = activeProducts.filter((p) => p.stock_quantity === 0).length;

  const dayBuckets = new Map<string, DailyPoint>();
  for (let i = days - 1; i >= 0; i--) {
    const d = daysAgo(i);
    const key = dateKey(d);
    dayBuckets.set(key, {
      date: key,
      label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      revenue: 0,
      expenses: 0
    });
  }
  for (const s of salesPeriod ?? []) {
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

  const bestDayPoint = dailySeries30d.reduce<{ label: string; revenue: number } | null>((best, point) => {
    if (!best || point.revenue > best.revenue) return { label: point.label, revenue: point.revenue };
    return best;
  }, null);
  const bestDay = bestDayPoint && bestDayPoint.revenue > 0 ? bestDayPoint : null;

  const avgDailySales = days > 0 ? revenue30d / days : 0;
  const avgOrderValue = saleCount30d > 0 ? revenue30d / saleCount30d : 0;

  const allByRevenue = [...bestSellersMap.values()].sort((a, b) => b.revenue - a.revenue);
  const top5 = allByRevenue.slice(0, 5);
  const otherTotal = allByRevenue.slice(5).reduce((sum, s) => sum + s.revenue, 0);
  const revenueByProduct30d: RevenueSlice[] = top5.map((s) => ({ name: s.name, value: s.revenue }));
  if (otherTotal > 0) revenueByProduct30d.push({ name: "Other", value: otherTotal });

  const periodLabel = `${new Date(periodStart).toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;

  return {
    periodDays: days,
    periodLabel,
    salesToday,
    revenue30d,
    saleCount30d,
    cogs30d,
    grossProfit30d,
    hasCostData,
    expenses30d,
    netProfit30d,
    cashFlow30d,
    cashIn30d,
    cashOut30d,
    outstandingInvoicesTotal,
    outstandingInvoicesCount: outstanding.length,
    inventoryValue,
    totalActiveProducts: activeProducts.length,
    lowStockCount,
    outOfStockCount,
    avgDailySales,
    avgOrderValue,
    bestDay,
    bestSellers30d,
    dailySeries30d,
    revenueByProduct30d,
    trends: {
      revenue: computeTrend(revenue30d, revenuePrev),
      grossProfit: computeTrend(grossProfit30d, grossProfitPrev),
      orders: computeTrend(saleCount30d, saleCountPrev),
      expenses: computeTrend(expenses30d, expensesPrev),
      netProfit: computeTrend(netProfit30d, netProfitPrev)
    }
  };
}

export interface ActivityItem {
  id: string;
  type: "sale" | "expense" | "customer" | "invoice_paid";
  description: string;
  amount: number | null;
  createdAt: string;
}

export async function getRecentActivity(orgId: string, limit: number = 8): Promise<ActivityItem[]> {
  const supabase = await createClient();

  const [{ data: sales }, { data: expenses }, { data: customers }, { data: paidInvoices }] = await Promise.all([
    supabase
      .from("sales")
      .select("id, total, customer_name, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("expenses")
      .select("id, amount, category, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("customers")
      .select("id, name, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("invoices")
      .select("id, amount, customer_name, paid_at")
      .eq("org_id", orgId)
      .eq("status", "paid")
      .not("paid_at", "is", null)
      .order("paid_at", { ascending: false })
      .limit(limit)
  ]);

  const items: ActivityItem[] = [
    ...(sales ?? []).map((s) => ({
      id: `sale-${s.id}`,
      type: "sale" as const,
      description: `Sale to ${s.customer_name ?? "Walk-in customer"}`,
      amount: Number(s.total),
      createdAt: s.created_at
    })),
    ...(expenses ?? []).map((e) => ({
      id: `expense-${e.id}`,
      type: "expense" as const,
      description: `${e.category} expense recorded`,
      amount: -Number(e.amount),
      createdAt: e.created_at
    })),
    ...(customers ?? []).map((c) => ({
      id: `customer-${c.id}`,
      type: "customer" as const,
      description: `New customer: ${c.name}`,
      amount: null,
      createdAt: c.created_at
    })),
    ...(paidInvoices ?? []).map((i) => ({
      id: `invoice-${i.id}`,
      type: "invoice_paid" as const,
      description: `Invoice paid by ${i.customer_name}`,
      amount: Number(i.amount),
      createdAt: i.paid_at as string
    }))
  ];

  return items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, limit);
}