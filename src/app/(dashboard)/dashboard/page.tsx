import { cookies } from "next/headers";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { getFinancialSummary, getRecentActivity } from "@/lib/accounting/metrics";
import { createClient } from "@/lib/supabase/server";
import { DashboardContent } from "@/components/charts/dashboard-content";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: { days?: string } }) {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const days = Number(searchParams.days) || 30;

  const supabase = await createClient();

const [summary, recentActivity, { data: latestInsight }] =
  await Promise.all([
    getFinancialSummary(context.orgId, days),
    getRecentActivity(context.orgId),
    supabase
      .from("ai_insights")
      .select("content, created_at")
      .eq("org_id", context.orgId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  return (
    <DashboardContent
      summary={summary}
      orgName={context.orgName}
      currency={context.currency}
      latestInsight={latestInsight ?? null}
      recentActivity={recentActivity}
    />
  );
}