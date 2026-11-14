import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { DashboardShell } from "@/components/nav/dashboard-shell";
import { OrganizationExpiredScreen } from "@/components/organization/organization-access-expiry";
import { getOrganizationExpiryStatus } from "@/lib/organization-access-expiry";
import { createClient } from "@/lib/supabase/server";
import type { DarkStyleKey, ThemeKey } from "@/store/useAppStore";
import {
  getEnabledOrganizationModules,
  getPlatformSystemLogo,
  getPlatformSystemName,
  getPlatformWatermarkConfiguration,
  getProductHubBranding,
} from "@/lib/supabase/platform-admin";
import { getUserRegistrationApplications } from "@/lib/organizations/registration";
import { getOrganizationUsageSummary } from "@/lib/organizations/usage-summary";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId, { allowExpired: true });
  if (!context) {
    const { applications } = await getUserRegistrationApplications();
    if (applications.length) redirect("/registration-status");
    redirect("/onboarding");
  }
  if (getOrganizationExpiryStatus(context.organizationAccessExpiresAt).expired) {
    return (
      <OrganizationExpiredScreen
        organizationName={context.orgName}
        expiryDate={context.organizationAccessExpiresAt!}
        organizations={context.memberships.filter((membership) => membership.orgId !== context.orgId)}
      />
    );
  }
  const supabase = await createClient();
  const roleKey = typeof context.accessPermissions.role_key === "string"
    ? context.accessPermissions.role_key
    : context.role;
  const [{ data: companyProfile }, { data: profile }, roleThemeResult, platformSettings, organizationUsage] = await Promise.all([
    supabase.from("company_profile").select("logo_url").eq("org_id", context.orgId).maybeSingle(),
    supabase.from("profiles").select("full_name, avatar_url, ui_preferences").eq("id", context.userId).maybeSingle(),
    supabase.from("organization_role_themes").select("theme_key").eq("org_id", context.orgId).eq("role_key", roleKey).maybeSingle(),
    Promise.all([
      getEnabledOrganizationModules(context.orgId),
      getPlatformSystemLogo(),
      getPlatformSystemName(),
      getPlatformWatermarkConfiguration(),
      getProductHubBranding(),
    ]).catch((error: unknown) => {
      console.error("Platform navigation settings could not be loaded:", error);
      return [undefined, null, "ThinkSales ERP Pro", null, null] as const;
    }),
    getOrganizationUsageSummary(context.orgId).catch((error: unknown) => {
      console.error("Organization capacity details could not be loaded:", error);
      return null;
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
  const [enabledModules, systemLogoUrl, systemName, watermark, productBranding] = platformSettings;
  const preferences = profile?.ui_preferences;
  const darkStyle: DarkStyleKey = preferences && typeof preferences === "object" && !Array.isArray(preferences) &&
    preferences.dark_style === "think-service" ? "think-service" : "think-sales";

  return (
    <DashboardShell
      userId={context.userId}
      userEmail={context.userEmail}
      orgId={context.orgId}
      currency={context.currency}
      avatarUrl={profile?.avatar_url ?? null}
      darkStyle={darkStyle}
      enabledModules={enabledModules}
      systemLogoUrl={systemLogoUrl}
      systemName={systemName}
      productLogoUrls={productBranding?.productImageUrls}
      productNames={productBranding?.productNames}
      workspaceHubDarkThemeEnabled={productBranding?.darkThemeEnabled}
      workspaceHubDarkSurfaceStyle={productBranding?.darkSurfaceStyle}
      watermark={watermark}
      organizationAccessExpiresAt={context.organizationAccessExpiresAt}
      organizationUsage={organizationUsage}
      orgName={context.orgName}
      logoUrl={companyProfile?.logo_url ?? null}
      userName={profile?.full_name ?? null}
      userRole={context.role}
      allowedLocationIds={[...(context.locationId ? [context.locationId] : []), ...context.secondaryLocationIds]}
      canViewAllBranches={context.branchScope === "all" || context.role === "owner" || context.role === "admin"}
      roleTheme={selectedTheme}
      canChangeTheme={context.role === "owner" || context.role === "admin"}
    >
      {children}
    </DashboardShell>
  );
}