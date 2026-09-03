import { cookies } from "next/headers";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { getFinancialSummary, getRecentActivity, defaultDateRange, type DateRange } from "@/lib/accounting/metrics";
import { createClient } from "@/lib/supabase/server";
import { DashboardContent } from "@/components/charts/dashboard-content";
import type { FilterOption } from "@/components/charts/dashboard-filters";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams
}: {
  // Next 16: searchParams is a Promise on the server — reading it
  // synchronously silently returns undefined for every field, which was
  // why branch/category filters never actually changed anything below.
  searchParams: Promise<{ from?: string; to?: string; branch?: string; category?: string }>;
}) {
  const params = await searchParams;

  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const fallback = defaultDateRange();
  const range: DateRange = {
    from: params.from || fallback.from,
    to: params.to || fallback.to
  };
  const locationId = params.branch || null;
  const category = params.category || null;
  const filters = { locationId, category };

  const supabase = await createClient();

  const [summary, recentActivity, { data: latestInsight }, { data: locationRows }, { data: categoryRows }] =
    await Promise.all([
      getFinancialSummary(context.orgId, range, filters),
      getRecentActivity(context.orgId, 8, filters),
      supabase
        .from("ai_insights")
        .select("content, created_at")
        .eq("org_id", context.orgId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("business_locations").select("id, name").eq("org_id", context.orgId).eq("is_active", true).order("name"),
      // category is a free-text column on products (no lookup table), so
      // the filter's options are just the distinct values in use.
      supabase.from("products").select("category").eq("org_id", context.orgId).not("category", "is", null)
    ]);

  const branches: FilterOption[] = (locationRows ?? []).map((l) => ({ id: l.id, name: l.name }));
  const categories: FilterOption[] = [...new Set((categoryRows ?? []).map((p) => p.category as string))]
    .sort()
    .map((c) => ({ id: c, name: c }));
  const generatedInsight = `Revenue is ${context.currency} ${summary.revenue30d.toFixed(2)} across ${summary.saleCount30d} sales. Net profit is ${context.currency} ${summary.netProfit30d.toFixed(2)} with ${summary.lowStockCount} low-stock item${summary.lowStockCount === 1 ? "" : "s"} requiring attention.`;

  return (
    <DashboardContent
      summary={summary}
      currency={context.currency}
      orgName={context.orgName}
      latestInsight={latestInsight ?? { content: generatedInsight, created_at: new Date().toISOString() }}
      recentActivity={recentActivity}
      branches={branches}
      categories={categories}
      currentRange={range}
    />
  );
}