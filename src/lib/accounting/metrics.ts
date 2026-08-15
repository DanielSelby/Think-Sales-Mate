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

interface SaleItemRow {
  quantity: number;
  unit_price: number;
  line_total: number;
  created_at: string;
  product_id: string;
  sale_id: string;
  products:
    | { name: string; cost_price: number | null; category: string | null }
    | { name: string; cost_price: number | null; category: string | null }[]
    | null;
}

export interface DashboardFilters {
  locationId?: string | null;
  category?: string | null;
}

export async function getFinancialSummary(
  orgId: string,
  days: number = 30,
  filters: DashboardFilters = {}
): Promise<FinancialSummary> {
  const { locationId, category } = filters;
  const supabase = await createClient();
  const periodStart = daysAgo(days).toISOString();
  const prevPeriodStart = daysAgo(days * 2).toISOString();
  const todayStart = startOfToday().toISOString();

  // sale_items has no location_id of its own — it only reaches a branch via
  // its parent sale, so a location filter on items has to join sales. A
  // category filter joins products instead. sales/expenses/products carry
  // their own location_id and are filtered directly.
  // NOTE: because this select string is built at runtime (not a literal),
  // supabase-js can't infer its row shape and falls back to an error type —
  // that's why results are cast to SaleItemRow[] below instead of relying
  // on inference.
  const productsJoin = category ? "products!inner(name, cost_price, category)" : "products(name, cost_price, category)";
  const salesJoin = locationId ? ", sales!inner(location_id)" : "";
  const itemsSelect = `quantity, unit_price, line_total, created_at, product_id, sale_id, ${productsJoin}${salesJoin}`;

  let salesQuery = supabase.from("sales").select("total, created_at").eq("org_id", orgId).gte("created_at", periodStart);
  let salesPrevQuery = supabase
    .from("sales")
    .select("total, created_at")
    .eq("org_id", orgId)
    .gte("created_at", prevPeriodStart)
    .lt("created_at", periodStart);
  let itemsQuery = supabase.from("sale_items").select(itemsSelect).eq("org_id", orgId).gte("created_at", periodStart);
  // Only needed to recompute revenue/order-count trends when a category
  // filter is active (see note below on why sales.total can't be reused).
  let itemsPrevQuery = supabase
    .from("sale_items")
    .select(itemsSelect)
    .eq("org_id", orgId)
    .gte("created_at", prevPeriodStart)
    .lt("created_at", periodStart);
  let productsQuery = supabase
    .from("products")
    .select("stock_quantity, unit_price, low_stock_threshold, is_active, category, location_id")
    .eq("org_id", orgId);
  let expenseQuery = supabase
    .from("expenses")
    .select("amount, expense_date")
    .eq("org_id", orgId)
    .gte("expense_date", periodStart.slice(0, 10));
  let expensePrevQuery = supabase
    .from("expenses")
    .select("amount, expense_date")
    .eq("org_id", orgId)
    .gte("expense_date", prevPeriodStart.slice(0, 10))
    .lt("expense_date", periodStart.slice(0, 10));

  if (locationId) {
    salesQuery = salesQuery.eq("location_id", locationId);
    salesPrevQuery = salesPrevQuery.eq("location_id", locationId);
    itemsQuery = itemsQuery.eq("sales.location_id", locationId);
    itemsPrevQuery = itemsPrevQuery.eq("sales.location_id", locationId);
    productsQuery = productsQuery.eq("location_id", locationId);
    expenseQuery = expenseQuery.eq("location_id", locationId);
    expensePrevQuery = expensePrevQuery.eq("location_id", locationId);
  }
  if (category) {
    itemsQuery = itemsQuery.eq("products.category", category);
    itemsPrevQuery = itemsPrevQuery.eq("products.category", category);
    productsQuery = productsQuery.eq("category", category);
  }

  const [
    { data: salesPeriod },
    { data: salesPrevPeriod },
    { data: itemsWithCost },
    { data: itemsPrevPeriod },
    { data: products },
    { data: expenseRows },
    { data: expenseRowsPrev },
    { data: invoiceRows }
  ] = await Promise.all([
    salesQuery,
    salesPrevQuery,
    itemsQuery,
    // Always run this (cheap) rather than making it conditional — a
    // conditional here would otherwise need its "off" branch's type to
    // match itemsQuery's inferred type, which isn't nameable without an
    // explicit generated Database type.
    itemsPrevQuery,
    productsQuery,
    expenseQuery,
    expensePrevQuery,
    supabase.from("invoices").select("amount, status, paid_at").eq("org_id", orgId)
  ]);

  const itemRows = (itemsWithCost ?? []) as unknown as SaleItemRow[];
  const itemPrevRows = (itemsPrevPeriod ?? []) as unknown as SaleItemRow[];

  // IMPORTANT: sales.total is an order's grand total, which can span
  // several categories. Once a category filter is active, "revenue" has to
  // mean the line_total of just that category's items — sales.total is no
  // longer a valid source for revenue30d/salesToday/saleCount/dailySeries,
  // so those get rebuilt from sale_items below instead of from `sales`.
  // Location filtering doesn't have this problem (sales.location_id is
  // exact), so it's applied directly to the `sales` table query above.
  let cogs30d = 0;
  let hasCostData = false;
  const bestSellersMap = new Map<string, BestSeller>();
  const itemRevenueByDay = new Map<string, number>();
  const itemSaleIdsPeriod = new Set<string>();
  let itemRevenue30d = 0;
  let itemRevenueToday = 0;

  for (const item of itemRows) {
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

    if (category) {
      const lineTotal = Number(item.line_total);
      itemRevenue30d += lineTotal;
      itemSaleIdsPeriod.add(item.sale_id);
      if (item.created_at >= todayStart) itemRevenueToday += lineTotal;
      const dayKey = item.created_at.slice(0, 10);
      itemRevenueByDay.set(dayKey, (itemRevenueByDay.get(dayKey) ?? 0) + lineTotal);
    }
  }

  let itemRevenuePrev = 0;
  if (category) {
    for (const item of itemPrevRows) {
      itemRevenuePrev += Number(item.line_total);
    }
  }

  const revenue30d = category ? itemRevenue30d : (salesPeriod ?? []).reduce((sum, s) => sum + Number(s.total), 0);
  const revenuePrev = category ? itemRevenuePrev : (salesPrevPeriod ?? []).reduce((sum, s) => sum + Number(s.total), 0);
  const saleCount30d = category ? itemSaleIdsPeriod.size : (salesPeriod ?? []).length;
  const saleCountPrev = category ? new Set(itemPrevRows.map((i) => i.sale_id)).size : (salesPrevPeriod ?? []).length;

  const salesToday = category
    ? itemRevenueToday
    : (salesPeriod ?? []).filter((s) => s.created_at >= todayStart).reduce((sum, s) => sum + Number(s.total), 0);

  const bestSellers30d = [...bestSellersMap.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 5);
  const grossProfit30d = revenue30d - cogs30d;
  const grossMargin = revenue30d > 0 ? grossProfit30d / revenue30d : 0;
  const grossProfitPrev = revenuePrev * grossMargin;

  const expenses30d = (expenseRows ?? []).reduce((sum, e) => sum + Number(e.amount), 0);
  const expensesPrev = (expenseRowsPrev ?? []).reduce((sum, e) => sum + Number(e.amount), 0);
  const netProfit30d = grossProfit30d - expenses30d;
  const netProfitPrev = grossProfitPrev - expensesPrev;

  // invoices has no location_id or category column, so receivables figures
  // stay org-wide even when a branch/category filter is active.
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
  if (category) {
    for (const [key, amount] of itemRevenueByDay) {
      const bucket = dayBuckets.get(key);
      if (bucket) bucket.revenue += amount;
    }
  } else {
    for (const s of salesPeriod ?? []) {
      const key = s.created_at.slice(0, 10);
      const bucket = dayBuckets.get(key);
      if (bucket) bucket.revenue += Number(s.total);
    }
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

export async function getRecentActivity(
  orgId: string,
  limit: number = 8,
  filters: DashboardFilters = {}
): Promise<ActivityItem[]> {
  const { locationId } = filters;
  const supabase = await createClient();

  let salesQuery = supabase
    .from("sales")
    .select("id, total, customer_name, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(limit);
  let expensesQuery = supabase
    .from("expenses")
    .select("id, amount, category, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(limit);
  const customersQuery = supabase
    .from("customers")
    .select("id, name, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(limit);
  const invoicesQuery = supabase
    .from("invoices")
    .select("id, amount, customer_name, paid_at")
    .eq("org_id", orgId)
    .eq("status", "paid")
    .not("paid_at", "is", null)
    .order("paid_at", { ascending: false })
    .limit(limit);

  if (locationId) {
    salesQuery = salesQuery.eq("location_id", locationId);
    expensesQuery = expensesQuery.eq("location_id", locationId);
  }
  // A category filter only narrows line items, and this feed shows
  // whole sales/expenses/customers/invoices — there's no clean "this sale
  // touched category X" story for an activity row, so category doesn't
  // apply here. New customers and paid invoices aren't branch- or
  // category-scoped in the schema either, so they're always shown as-is.

  const [{ data: sales }, { data: expenses }, { data: customers }, { data: paidInvoices }] = await Promise.all([
    salesQuery,
    expensesQuery,
    customersQuery,
    invoicesQuery
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