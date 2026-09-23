import { cookies } from "next/headers";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import {
  getReportKpis,
  getProfitAndLoss,
  getBalanceSheet,
  getRevenueExpenseSeries,
  getExpensesByCategory,
  getTopCustomers,
  getTaxSummary,
  getOperationalReportData
} from "@/lib/reports/calculations";
import { getRecentReports } from "@/app/(dashboard)/reports/actions";
import { ReportsDashboard } from "@/components/reports/reports-dashboard";

function defaultDateRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: from.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
}

function periodDateRange(period: string) {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const from = new Date(now);
  if (period === "today") return { from: to, to };
  if (period === "yesterday") {
    from.setDate(now.getDate() - 1);
    const value = from.toISOString().slice(0, 10);
    return { from: value, to: value };
  }
  if (period === "weekly") from.setDate(now.getDate() - 6);
  else if (period === "monthly") from.setDate(now.getDate() - 29);
  else if (period === "quarterly") from.setMonth(now.getMonth() - 2, 1);
  else if (period === "yearly") from.setMonth(0, 1);
  return { from: from.toISOString().slice(0, 10), to };
}

export default async function ReportsPage({
  searchParams
}: {
  searchParams: { from?: string; to?: string; location?: string; period?: string };
}) {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const defaults = defaultDateRange();
  const isoDate = /^\d{4}-\d{2}-\d{2}$/;
  const requestedPeriod = ["today", "yesterday", "weekly", "monthly", "quarterly", "yearly", "custom"].includes(searchParams.period ?? "")
    ? searchParams.period!
    : "monthly";
  const hasValidRange = Boolean(
    searchParams.from &&
    searchParams.to &&
    isoDate.test(searchParams.from) &&
    isoDate.test(searchParams.to) &&
    searchParams.from <= searchParams.to
  );
  const requestedRange = hasValidRange
    ? { from: searchParams.from!, to: searchParams.to! }
    : periodDateRange(requestedPeriod);
  const dateFrom = requestedRange.from || defaults.from;
  const dateTo = requestedRange.to || defaults.to;
  const hasLocationFilter = typeof searchParams.location === "string";
  const requestedLocationId = hasLocationFilter
    ? (searchParams.location !== "all" ? searchParams.location : null)
    : context.masterLocationId;
  const locationId: string | null = context.isBranchScoped
    ? (requestedLocationId && context.allowedLocationIds.includes(requestedLocationId) ? requestedLocationId : null)
    : (requestedLocationId ?? null);
  const period = (requestedPeriod === "today" || requestedPeriod === "yesterday" || requestedPeriod === "custom"
    ? "daily"
    : requestedPeriod) as "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

  const filters = {
    orgId: context.orgId,
    dateFrom,
    dateTo,
    locationId,
    allowedLocationIds: context.isBranchScoped ? context.allowedLocationIds : undefined
  };

  const supabase = await createClient();
  let locationsQuery = supabase
    .from("business_locations")
    .select("id, name")
    .eq("org_id", context.orgId)
    .eq("is_active", true)
    .order("name");
  if (context.isBranchScoped) locationsQuery = locationsQuery.in("id", context.allowedLocationIds);
  const { data: locationRows } = await locationsQuery;

  const [kpis, profitAndLoss, balanceSheet, revenueExpenseSeries, expensesByCategory, topCustomers, taxSummary, operationalReports, recentReports] =
    await Promise.all([
      getReportKpis(filters),
      getProfitAndLoss(filters),
      getBalanceSheet(context.orgId, dateTo),
      getRevenueExpenseSeries(filters, period),
      getExpensesByCategory(filters),
      getTopCustomers(filters),
      getTaxSummary(filters),
      getOperationalReportData(filters),
      getRecentReports()
    ]);

  return (
    <ReportsDashboard
      orgName={context.orgName}
      currency={context.currency}
      canExport={can(context.role, "reports.export")}
      locations={(locationRows ?? []).map((l) => ({ id: l.id, name: l.name }))}
      filters={{ dateFrom, dateTo, locationId, period }}
      kpis={kpis}
      profitAndLoss={profitAndLoss}
      balanceSheet={balanceSheet}
      revenueExpenseSeries={revenueExpenseSeries}
      expensesByCategory={expensesByCategory}
      topCustomers={topCustomers}
      taxSummary={taxSummary}
      operationalReports={operationalReports}
      recentReports={recentReports}
    />
  );
}