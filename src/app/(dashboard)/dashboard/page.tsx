import { cookies } from "next/headers";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { getFinancialSummary, getRecentActivity } from "@/lib/accounting/metrics";
import { createClient } from "@/lib/supabase/server";
import { DashboardContent } from "@/components/charts/dashboard-content";
import type { FilterOption } from "@/components/charts/dashboard-filters";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams
}: {
  searchParams: { days?: string; branch?: string; category?: string };
}) {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const days = Number(searchParams.days) || 30;
  const locationId = searchParams.branch || null;
  const category = searchParams.category || null;
  const filters = { locationId, category };

  const supabase = await createClient();

  const [summary, recentActivity, { data: latestInsight }, { data: locationRows }, { data: categoryRows }] =
    await Promise.all([
      getFinancialSummary(context.orgId, days, filters),
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

  return (
    <DashboardContent
      summary={summary}
      orgName={context.orgName}
      currency={context.currency}
      latestInsight={latestInsight ?? null}
      recentActivity={recentActivity}
      branches={branches}
      categories={categories}
    />
  );
}