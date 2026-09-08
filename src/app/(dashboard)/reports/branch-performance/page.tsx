import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { can } from "@/lib/rbac";
import { getBranchPerformance } from "@/lib/reports/branch-performance";
import { BranchPerformanceView } from "@/components/reports/branch-performance-view";

export default async function BranchPerformancePage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const context = await getCurrentOrgContext((await cookies()).get("active_org_id")?.value);
  if (!context) redirect("/onboarding");
  if (!can(context.role, "reports.view")) redirect("/reports");
  const params = await searchParams;
  const now = new Date();
  const from = params.from ?? new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const to = params.to ?? now.toISOString().slice(0, 10);
  const data = await getBranchPerformance(context.orgId, from, to);
  return <BranchPerformanceView currency={context.currency} {...data} />;
}
