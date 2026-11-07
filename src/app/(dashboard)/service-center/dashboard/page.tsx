import { cookies } from "next/headers";
import Link from "next/link";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { ServiceDashboard, type ServiceDashboardData } from "@/components/service-center/service-dashboard";
import type { ServiceJobStatus } from "@/types/database";

export const dynamic = "force-dynamic";
export const metadata = { title: "Service Dashboard · Think Service & Repairs" };

type DateRangeKey = "today" | "last7" | "last30" | "thisMonth" | "lastMonth" | "custom";
type DateRange = { key: DateRangeKey; from: string; to: string };

function dateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function validDate(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && dateString(parsed) === value;
}

function resolveDateRange(params: { range?: string; from?: string; to?: string }): DateRange {
  const today = new Date();
  const to = dateString(today);
  const key = params.range;
  const customFrom = params.from;
  const customTo = params.to;
  if (key === "custom" && customFrom && customTo && validDate(customFrom) && validDate(customTo) && customFrom <= customTo) {
    return { key, from: customFrom, to: customTo };
  }
  if (key === "today") return { key, from: to, to };
  if (key === "last7" || key === "last30") {
    const from = new Date(`${to}T00:00:00.000Z`);
    from.setUTCDate(from.getUTCDate() - (key === "last7" ? 6 : 29));
    return { key, from: dateString(from), to };
  }
  if (key === "thisMonth") {
    return { key, from: dateString(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))), to };
  }
  if (key === "lastMonth") {
    return {
      key,
      from: dateString(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1))),
      to: dateString(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0))),
    };
  }
  return { key: "last30", from: dateString(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 29))), to };
}

function previousRange(range: DateRange) {
  if (range.key === "lastMonth") {
    const selectedMonth = new Date(`${range.from}T00:00:00.000Z`);
    return {
      from: dateString(new Date(Date.UTC(selectedMonth.getUTCFullYear(), selectedMonth.getUTCMonth() - 1, 1))),
      to: dateString(new Date(Date.UTC(selectedMonth.getUTCFullYear(), selectedMonth.getUTCMonth(), 0))),
    };
  }
  const length = Math.floor(
    (new Date(`${range.to}T00:00:00.000Z`).getTime() - new Date(`${range.from}T00:00:00.000Z`).getTime()) / 86_400_000,
  ) + 1;
  const end = new Date(`${range.from}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - length + 1);
  return { from: dateString(start), to: dateString(end) };
}

async function loadAllRows<T>(
  loadPage: (start: number, end: number) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
    count: number | null;
  }>,
  label: string,
): Promise<T[]> {
  const pageSize = 1000;
  const first = await loadPage(0, pageSize - 1);
  if (first.error) throw new Error(`Unable to load ${label}: ${first.error.message}`);
  const rows = [...(first.data ?? [])];
  const total = first.count ?? rows.length;
  for (let start = pageSize; start < total; start += pageSize) {
    const page = await loadPage(start, Math.min(start + pageSize - 1, total - 1));
    if (page.error) throw new Error(`Unable to load ${label}: ${page.error.message}`);
    rows.push(...(page.data ?? []));
  }
  if (rows.length !== total) throw new Error(`Incomplete ${label}: expected ${total} rows but loaded ${rows.length}.`);
  return rows;
}

function dateInRange(value: string, from: string, to: string) {
  const day = value.slice(0, 10);
  return day >= from && day <= to;
}

function bucketLabel(value: string, granularity: "day" | "week" | "month") {
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (granularity === "month") return value.slice(0, 7);
  if (granularity === "week") {
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() - day + 1);
  }
  return dateString(date);
}

const terminalStatuses = new Set<ServiceJobStatus>(["completed", "closed", "cancelled"]);
const statusGroups: Array<{ key: string; label: string; color: string; statuses: ServiceJobStatus[] }> = [
  { key: "new", label: "New", color: "#2563eb", statuses: ["received", "inspection", "awaiting_quotation", "awaiting_customer_approval", "approved"] },
  { key: "in_progress", label: "In Progress", color: "#f59e0b", statuses: ["in_progress"] },
  { key: "awaiting_parts", label: "Awaiting Parts", color: "#10b981", statuses: ["awaiting_parts"] },
  { key: "quality_check", label: "Quality Check", color: "#8b5cf6", statuses: ["quality_check"] },
  { key: "ready", label: "Ready for Pickup", color: "#06b6d4", statuses: ["ready_for_collection", "awaiting_payment"] },
  { key: "completed", label: "Completed", color: "#94a3b8", statuses: ["completed", "closed"] },
  { key: "other", label: "Other", color: "#ef4444", statuses: ["rejected", "cancelled"] },
];

export default async function ServiceDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const [canViewJobs, canCreateJobs, canEditJobs, canViewAppointments, canCreateAppointments, canViewAccounting, canViewInventory, canCreateCustomers] =
    await Promise.all([
      canPermission("service_jobs", "view"),
      canPermission("service_jobs", "create"),
      canPermission("service_jobs", "edit"),
      canPermission("service_appointments", "view"),
      canPermission("service_appointments", "create"),
      canPermission("accounting", "view"),
      canPermission("inventory", "view"),
      canPermission("crm", "create"),
    ]);

  if (!canViewJobs) {
    return (
      <div role="alert" className="mx-auto max-w-2xl rounded-xl border border-dashed border-ledger-200 bg-white p-10 text-center text-sm text-ledger-600 dark:border-ledger-700 dark:bg-ink-900 dark:text-ledger-300">
        You do not have permission to view the Service Center dashboard.
      </div>
    );
  }

  const params = await searchParams;
  const range = resolveDateRange(params);
  const previous = previousRange(range);
  const supabase = await createClient();
  const allowedLocationIds = context.isBranchScoped
    ? Array.from(new Set(context.allowedLocationIds))
    : context.masterLocationId
      ? [context.masterLocationId]
      : null;
  const hasNoLocations = allowedLocationIds?.length === 0;
  const applyLocationScope = <T extends { in: (column: string, values: string[]) => T }>(query: T): T =>
    allowedLocationIds && !hasNoLocations ? query.in("location_id", allowedLocationIds) : query;

  const loadJobs = (start: number, end: number) => {
    let query = supabase.from("service_jobs")
      .select("id, job_number, location_id, customer_id, asset_id, status, created_at", { count: "exact" })
      .eq("org_id", context.orgId)
      .gte("created_at", `${previous.from}T00:00:00.000Z`)
      .lte("created_at", `${range.to}T23:59:59.999Z`)
      .order("created_at", { ascending: true })
      .range(start, end);
    query = applyLocationScope(query);
    return query;
  };

  const [jobs, productsResult, stockResult, paymentRows] = await Promise.all([
    hasNoLocations ? Promise.resolve([]) : loadAllRows(loadJobs, "service jobs"),
    canViewInventory && !hasNoLocations
      ? (() => {
          let query = supabase.from("products")
            .select("id, name, sku, image_urls, location_id, stock_quantity, low_stock_threshold")
            .eq("org_id", context.orgId)
            .eq("is_active", true)
            .eq("track_inventory", true)
            .eq("product_type", "standard")
            .eq("status", "active")
            .order("name")
            .limit(2000);
          if (allowedLocationIds) {
            query = query.or(`location_id.is.null,location_id.in.(${allowedLocationIds.join(",")})`);
          }
          return query;
        })()
      : Promise.resolve({ data: [], error: null }),
    canViewInventory && !hasNoLocations
      ? (() => {
          let query = supabase.from("product_stock_levels")
            .select("product_id, location_id, quantity")
            .eq("org_id", context.orgId);
          if (allowedLocationIds) query = query.in("location_id", allowedLocationIds);
          return query;
        })()
      : Promise.resolve({ data: [], error: null }),
    canViewAccounting && !hasNoLocations
      ? loadAllRows((start, end) => {
          let query = supabase.from("service_invoice_payments")
            .select("amount, payment_date", { count: "exact" })
            .eq("org_id", context.orgId)
            .gte("payment_date", previous.from)
            .lte("payment_date", range.to)
            .range(start, end);
          query = applyLocationScope(query);
          return query;
        }, "service payment records")
      : Promise.resolve([]),
  ]);
  if (productsResult.error) throw new Error(`Unable to load service inventory products: ${productsResult.error.message}`);
  if (stockResult.error) throw new Error(`Unable to load branch inventory stock: ${stockResult.error.message}`);

  const jobRows = jobs.filter((job) => dateInRange(job.created_at, previous.from, range.to));
  const currentJobs = jobRows.filter((job) => dateInRange(job.created_at, range.from, range.to));
  const priorJobs = jobRows.filter((job) => dateInRange(job.created_at, previous.from, previous.to));
  const invoiceRows = canViewAccounting && !hasNoLocations
    ? await loadAllRows((start, end) => supabase.from("invoices")
        .select("source_service_job_id, amount, status, created_at", { count: "exact" })
        .eq("org_id", context.orgId)
        .not("source_service_job_id", "is", null)
        .gte("created_at", `${previous.from}T00:00:00.000Z`)
        .lte("created_at", `${range.to}T23:59:59.999Z`)
        .neq("status", "void")
        .range(start, end), "service invoices")
    : [];
  const invoiceJobIds = Array.from(new Set(invoiceRows.flatMap((invoice) => invoice.source_service_job_id ? [invoice.source_service_job_id] : [])));
  const invoiceJobLocations = new Map<string, string>();
  for (let offset = 0; offset < invoiceJobIds.length; offset += 100) {
    let query = supabase.from("service_jobs")
      .select("id, location_id")
      .eq("org_id", context.orgId)
      .in("id", invoiceJobIds.slice(offset, offset + 100));
    query = applyLocationScope(query);
    const { data: linkedJobs, error: linkedJobsError } = await query;
    if (linkedJobsError) throw new Error(`Unable to verify service invoice branch scope: ${linkedJobsError.message}`);
    for (const job of linkedJobs ?? []) invoiceJobLocations.set(job.id, job.location_id);
  }
  const scopedInvoiceRows = invoiceRows.filter((invoice) => invoice.source_service_job_id && invoiceJobLocations.has(invoice.source_service_job_id));

  const currentInvoices = scopedInvoiceRows.filter((invoice) => dateInRange(invoice.created_at, range.from, range.to));
  const priorInvoices = scopedInvoiceRows.filter((invoice) => dateInRange(invoice.created_at, previous.from, previous.to));
  const currentPayments = paymentRows.filter((payment) => dateInRange(payment.payment_date, range.from, range.to));
  const priorPayments = paymentRows.filter((payment) => dateInRange(payment.payment_date, previous.from, previous.to));
  const countPending = (rows: typeof currentJobs) => rows.filter((job) => !terminalStatuses.has(job.status)).length;
  const groupedStatuses = statusGroups.map((group) => ({
    ...group,
    count: currentJobs.filter((job) => group.statuses.includes(job.status)).length,
  }));
  const days = Math.ceil((new Date(`${range.to}T00:00:00.000Z`).getTime() - new Date(`${range.from}T00:00:00.000Z`).getTime()) / 86_400_000) + 1;
  const granularity = days <= 31 ? "day" : days <= 180 ? "week" : "month";
  const series = new Map<string, { label: string; jobs: number; pending: number; revenue: number; payments: number }>();
  const addPoint = (date: string) => {
    const key = bucketLabel(date, granularity);
    if (!series.has(key)) series.set(key, { label: key, jobs: 0, pending: 0, revenue: 0, payments: 0 });
    return series.get(key)!;
  };
  for (const job of currentJobs) {
    const point = addPoint(job.created_at);
    point.jobs += 1;
    if (!terminalStatuses.has(job.status)) point.pending += 1;
  }
  for (const invoice of currentInvoices) addPoint(invoice.created_at).revenue += Number(invoice.amount ?? 0);
  for (const payment of currentPayments) addPoint(payment.payment_date).payments += Number(payment.amount ?? 0);

  const recentJobs = [...currentJobs].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8);
  const recentCustomerIds = Array.from(new Set(recentJobs.map((job) => job.customer_id)));
  const recentAssetIds = Array.from(new Set(recentJobs.flatMap((job) => job.asset_id ? [job.asset_id] : [])));
  const [customersResult, assetsResult] = await Promise.all([
    recentCustomerIds.length
      ? supabase.from("customers").select("id, name").eq("org_id", context.orgId).in("id", recentCustomerIds)
      : Promise.resolve({ data: [], error: null }),
    recentAssetIds.length
      ? (() => {
          let query = supabase.from("service_assets").select("id, location_id, asset_type").eq("org_id", context.orgId).in("id", recentAssetIds);
          query = applyLocationScope(query);
          return query;
        })()
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (customersResult.error) throw new Error(`Unable to load recent service job customers: ${customersResult.error.message}`);
  if (assetsResult.error) throw new Error(`Unable to load recent service equipment: ${assetsResult.error.message}`);
  const customers = new Map((customersResult.data ?? []).map((customer) => [customer.id, customer.name]));
  const assets = new Map((assetsResult.data ?? []).map((asset) => [asset.id, asset.asset_type]));

  const products = productsResult.data ?? [];
  const stockByProduct = new Map<string, number>();
  for (const row of stockResult.data ?? []) {
    stockByProduct.set(row.product_id, (stockByProduct.get(row.product_id) ?? 0) + Number(row.quantity ?? 0));
  }
  const lowStock = products.flatMap((product) => {
    if (allowedLocationIds && product.location_id && !allowedLocationIds.includes(product.location_id)) return [];
    const quantity = stockByProduct.has(product.id)
      ? stockByProduct.get(product.id)!
      : allowedLocationIds
        ? 0
        : Number(product.stock_quantity ?? 0);
    const threshold = Number(product.low_stock_threshold ?? 5) || 5;
    return quantity <= threshold
      ? [{ id: product.id, name: product.name, sku: product.sku, imageUrl: product.image_urls?.[0] ?? null, quantity, threshold }]
      : [];
  }).sort((a, b) => a.quantity - b.quantity).slice(0, 5);

  const data: ServiceDashboardData = {
    range,
    previous,
    kpis: {
      jobs: currentJobs.length,
      previousJobs: priorJobs.length,
      revenue: currentInvoices.reduce((total, invoice) => total + Number(invoice.amount ?? 0), 0),
      previousRevenue: priorInvoices.reduce((total, invoice) => total + Number(invoice.amount ?? 0), 0),
      payments: currentPayments.reduce((total, payment) => total + Number(payment.amount ?? 0), 0),
      previousPayments: priorPayments.reduce((total, payment) => total + Number(payment.amount ?? 0), 0),
      pendingJobs: countPending(currentJobs),
    },
    chart: [...series.values()].sort((a, b) => a.label.localeCompare(b.label)),
    statuses: groupedStatuses,
    statusTotal: currentJobs.length,
    recentJobs: recentJobs.map((job) => ({
      id: job.id,
      number: job.job_number,
      customer: customers.get(job.customer_id) ?? "Customer",
      serviceType: job.asset_id ? assets.get(job.asset_id) ?? "Equipment repair" : "Repair service",
      status: job.status,
      createdAt: job.created_at,
    })),
    lowStock,
    permissions: {
      canViewAccounting,
      canViewInventory,
      canCreateCustomers,
      canCreateJobs,
      canEditJobs,
      canViewAppointments,
      canCreateAppointments,
    },
    currency: context.currency,
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-5">
      <nav aria-label="Service Center" className="flex flex-wrap gap-2 text-sm">
        <Link href="/service-center/dashboard" className="rounded-full bg-blue-100 px-3 py-1.5 font-medium text-blue-800 dark:bg-blue-950/50 dark:text-blue-200">Dashboard</Link>
        <Link href="/service-center" className="rounded-full bg-white px-3 py-1.5 text-ledger-600 hover:bg-ledger-100 dark:bg-ink-900 dark:text-ledger-300">Service Jobs</Link>
        <Link href="/service-center/reports" className="rounded-full bg-white px-3 py-1.5 text-ledger-600 hover:bg-ledger-100 dark:bg-ink-900 dark:text-ledger-300">Reports</Link>
      </nav>
      <ServiceDashboard data={data} />
    </div>
  );
}
