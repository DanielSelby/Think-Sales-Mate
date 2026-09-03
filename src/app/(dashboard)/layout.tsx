import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { DashboardShell } from "@/components/nav/dashboard-shell";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context     = await getCurrentOrgContext(activeOrgId);
  if (!context) redirect("/onboarding");
  const supabase = await createClient();
  const { data: companyProfile } = await supabase
    .from("company_profile")
    .select("logo_url")
    .eq("org_id", context.orgId)
    .maybeSingle();

  return (
    <DashboardShell orgName={context.orgName} logoUrl={companyProfile?.logo_url ?? null}>
      {children}
    </DashboardShell>
  );
}