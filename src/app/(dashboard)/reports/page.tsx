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
  getTaxSummary
} from "@/lib/reports/calculations";
import { getRecentReports } from "@/app/(dashboard)/reports/actions";
import { ReportsDashboard } from "@/components/reports/reports-dashboard";

function defaultDateRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: from.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
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
  const dateFrom = searchParams.from || defaults.from;
  const dateTo = searchParams.to || defaults.to;
  const locationId = searchParams.location && searchParams.location !== "all" ? searchParams.location : null;
  const requestedPeriod = searchParams.period || "monthly";
  const period = (requestedPeriod === "today" || requestedPeriod === "yesterday" || requestedPeriod === "custom"
    ? "daily"
    : requestedPeriod) as "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

  const filters = { orgId: context.orgId, dateFrom, dateTo, locationId };

  const supabase = await createClient();
  const { data: locationRows } = await supabase
    .from("business_locations")
    .select("id, name")
    .eq("org_id", context.orgId)
    .eq("is_active", true)
    .order("name");

  const [kpis, profitAndLoss, balanceSheet, revenueExpenseSeries, expensesByCategory, topCustomers, taxSummary, recentReports] =
    await Promise.all([
      getReportKpis(filters),
      getProfitAndLoss(filters),
      getBalanceSheet(context.orgId, dateTo),
      getRevenueExpenseSeries(filters, period),
      getExpensesByCategory(filters),
      getTopCustomers(filters),
      getTaxSummary(filters),
      getRecentReports()
    ]);

  return (
    <ReportsDashboard
      orgName={context.orgName}
      currency={context.currency}
      canExport={can(context.role, "reports.view")}
      locations={(locationRows ?? []).map((l) => ({ id: l.id, name: l.name }))}
      filters={{ dateFrom, dateTo, locationId, period }}
      kpis={kpis}
      profitAndLoss={profitAndLoss}
      balanceSheet={balanceSheet}
      revenueExpenseSeries={revenueExpenseSeries}
      expensesByCategory={expensesByCategory}
      topCustomers={topCustomers}
      taxSummary={taxSummary}
      recentReports={recentReports}
    />
  );
}