import { cookies } from "next/headers";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { getFinancialSummary, getRecentActivity, defaultDateRange, type DateRange } from "@/lib/accounting/metrics";
import { createClient } from "@/lib/supabase/server";
import { DashboardContent } from "@/components/charts/dashboard-content";
import type { FilterOption } from "@/components/charts/dashboard-filters";
import { getEnabledOrganizationModules } from "@/lib/supabase/platform-admin";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RestaurantFinancialSummaryData } from "@/components/restaurant/restaurant-financial-summary";

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
  const requestedLocationId = context.masterLocationId ?? params.branch ?? null;
  const category = params.category || null;
  const locationId = context.isBranchScoped && context.allowedLocationIds.length > 0
    ? (requestedLocationId && context.allowedLocationIds.includes(requestedLocationId) ? requestedLocationId : context.allowedLocationIds[0])
    : requestedLocationId;
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

  const branches: FilterOption[] = (locationRows ?? [])
    .filter((l) => !context.isBranchScoped || context.allowedLocationIds.includes(l.id))
    .map((l) => ({ id: l.id, name: l.name }));
  const categories: FilterOption[] = [...new Set((categoryRows ?? []).map((p) => p.category as string))]
    .sort()
    .map((c) => ({ id: c, name: c }));
  let restaurantSummary: RestaurantFinancialSummaryData | undefined;
  const enabledModules = await getEnabledOrganizationModules(context.orgId);
  if (enabledModules.includes("Restaurant") && await canTabPermission("restaurant", "operations", "reports", "view")) {
    const accessibleLocationIds = (locationRows ?? [])
      .filter((location) => !context.isBranchScoped || context.allowedLocationIds.includes(location.id))
      .filter((location) => !locationId || location.id === locationId)
      .map((location) => location.id);
    if (accessibleLocationIds.length > 0) {
      const start = new Date(`${range.from}T00:00:00.000Z`);
      const end = new Date(`${range.to}T00:00:00.000Z`);
      end.setUTCDate(end.getUTCDate() + 1);
      const { data, error } = await createAdminClient().rpc("get_restaurant_financial_summary", {
        p_org_id: context.orgId,
        p_location_ids: accessibleLocationIds,
        p_start_at: start.toISOString(),
        p_end_at: end.toISOString(),
        p_user_id: null,
      });
      if (error) throw new Error(`Could not load Restaurant dashboard summary: ${error.message}`);
      restaurantSummary = data as RestaurantFinancialSummaryData;
    }
  }
  return (
    <DashboardContent
      summary={summary}
      currency={context.currency}
      orgName={context.orgName}
      latestInsight={latestInsight}
      recentActivity={recentActivity}
      branches={branches}
      categories={categories}
      currentRange={range}
      restaurantSummary={restaurantSummary}
    />
  );
}