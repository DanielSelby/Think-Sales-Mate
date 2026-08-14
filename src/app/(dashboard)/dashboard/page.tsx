import { cookies } from "next/headers";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { getFinancialSummary } from "@/lib/accounting/metrics";
import { createClient } from "@/lib/supabase/server";
import { DashboardContent } from "@/components/charts/dashboard-content";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const activeOrgId = await (await cookies()).get("active_org_id")?.value;
  const context     = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const supabase = await createClient();
  const summary  = await getFinancialSummary(context.orgId);

  const [
    { data: lowStockRows },
    { data: latestInsight },
    { data: recentSales },
  ] = await Promise.all([
    supabase.from("products")
      .select("name, stock_quantity, low_stock_threshold")
      .eq("org_id", context.orgId)
      .eq("is_active", true),
    supabase.from("ai_insights")
      .select("content, created_at")
      .eq("org_id", context.orgId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("sales")
      .select("id, total, created_at, customer_name")
      .eq("org_id", context.orgId)
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  const lowStockItems = (lowStockRows ?? [])
    .filter(p => p.stock_quantity <= p.low_stock_threshold)
    .slice(0, 5);

  return (
    <DashboardContent
      summary={summary}
      orgName={context.orgName}
      currency={context.currency}
      lowStockItems={lowStockItems}
      latestInsight={latestInsight ?? null}
      recentSales={(recentSales ?? []).map(s => ({
        id:            s.id,
        total:         Number(s.total ?? 0),
        created_at:    s.created_at,
        customer_name: s.customer_name,
      }))}
    />
  );
}