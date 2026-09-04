import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { DashboardShell } from "@/components/nav/dashboard-shell";
import { createClient } from "@/lib/supabase/server";
import type { ThemeKey } from "@/store/useAppStore";

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
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", context.userId)
    .maybeSingle();
  const { data: roleTheme } = await supabase
    .from("organization_role_themes")
    .select("theme_key")
    .eq("org_id", context.orgId)
    .eq("role_key", context.role)
    .maybeSingle();
  const selectedTheme = roleTheme?.theme_key as ThemeKey | null;

  return (
    <DashboardShell orgName={context.orgName} logoUrl={companyProfile?.logo_url ?? null} userName={profile?.full_name ?? null} userRole={context.role} roleTheme={selectedTheme} canChangeTheme={context.role === "owner" || context.role === "admin"}>
      {children}
    </DashboardShell>
  );
}