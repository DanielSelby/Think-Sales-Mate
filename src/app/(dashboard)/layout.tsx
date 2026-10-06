import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { DashboardShell } from "@/components/nav/dashboard-shell";
import { createClient } from "@/lib/supabase/server";
import type { ThemeKey } from "@/store/useAppStore";
import { getEnabledOrganizationModules, getPlatformSystemLogo, getPlatformSystemName } from "@/lib/supabase/platform-admin";
import { getUserRegistrationApplications } from "@/lib/organizations/registration";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context     = await getCurrentOrgContext(activeOrgId);
  if (!context) {
    const { applications } = await getUserRegistrationApplications();
    if (applications.length) redirect("/registration-status");
    redirect("/onboarding");
  }
  const supabase = await createClient();
  const roleKey = typeof context.accessPermissions.role_key === "string"
    ? context.accessPermissions.role_key
    : context.role;
  const [{ data: companyProfile }, { data: profile }, roleThemeResult, platformSettings] = await Promise.all([
    supabase.from("company_profile").select("logo_url").eq("org_id", context.orgId).maybeSingle(),
    supabase.from("profiles").select("full_name, avatar_url").eq("id", context.userId).maybeSingle(),
    supabase.from("organization_role_themes").select("theme_key").eq("org_id", context.orgId).eq("role_key", roleKey).maybeSingle(),
    Promise.all([
      getEnabledOrganizationModules(context.orgId),
      getPlatformSystemLogo(),
      getPlatformSystemName(),
    ]).catch((error: unknown) => {
      console.error("Platform navigation settings could not be loaded:", error);
      return [undefined, null, "ThinkSales ERP Pro"] as const;
    }),
  ]);
  const { data: roleTheme, error: roleThemeError } = roleThemeResult;
  let selectedTheme = roleTheme?.theme_key as ThemeKey | null;
  if (roleThemeError && /organization_role_themes|schema cache|relation .* does not exist/i.test(roleThemeError.message)) {
    const { data: member } = await supabase
      .from("organization_members")
      .select("access_permissions")
      .eq("org_id", context.orgId)
      .eq("user_id", context.userId)
      .eq("status", "active")
      .maybeSingle();
    const fallbackTheme = (member?.access_permissions as Record<string, unknown> | null)?.role_theme;
    selectedTheme = typeof fallbackTheme === "string" ? fallbackTheme as ThemeKey : null;
  }
  const [enabledModules, systemLogoUrl, systemName] = platformSettings;

  return (
    <DashboardShell userId={context.userId} userEmail={context.userEmail} orgId={context.orgId} currency={context.currency} avatarUrl={profile?.avatar_url ?? null} enabledModules={enabledModules} systemLogoUrl={systemLogoUrl} systemName={systemName} orgName={context.orgName} logoUrl={companyProfile?.logo_url ?? null} userName={profile?.full_name ?? null} userRole={context.role} allowedLocationIds={[...(context.locationId ? [context.locationId] : []), ...context.secondaryLocationIds]} canViewAllBranches={context.branchScope === "all" || context.role === "owner" || context.role === "admin"} roleTheme={selectedTheme} canChangeTheme={context.role === "owner" || context.role === "admin"}>
      {children}
    </DashboardShell>
  );
}