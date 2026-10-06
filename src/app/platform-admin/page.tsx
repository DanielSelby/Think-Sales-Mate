import "server-only";
import Link from "next/link";

import { createPlatformServerClient } from "@/lib/supabase/platform-server";
import { getPlatformAdmin } from "@/lib/platform-auth";
import PlatformAdminConsole from "./platform-admin-console";
import { syncAllOrganizationsToPlatform } from "@/lib/supabase/platform-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function PlatformAdminPage() {
  const admin = await getPlatformAdmin();
  if (!admin) return null;
  try {
    await syncAllOrganizationsToPlatform();
  } catch (error) {
    console.error("Platform organization reconciliation failed:", error);
  }
  const supabase = await createPlatformServerClient();
  const [{ data: organizations }, { data: plans }, { data: features }, { data: auditLogs }, { data: usage }, { data: billing }, { data: flags }, { data: approvals }, { data: notifications }, { data: settings }, { data: complaints }, { data: contacts }, { data: loginThemes, error: loginThemesError }, { data: loginThemeAssignments, error: loginThemeAssignmentsError }, { data: loginThemeAudit, error: loginThemeAuditError }] = await Promise.all([
    supabase.from("platform_organizations").select("id, organization_id, name, plan_id, status, expires_at, created_at, updated_at, industry, suspended_at, suspension_reason").order("updated_at", { ascending: false }),
    supabase.from("subscription_plans").select("id, name, max_users, max_branches, storage_limit_gb, monthly_price, annual_price, ai_access, api_access, included_modules, is_active, archived_at").eq("is_active", true).order("monthly_price"),
    supabase.from("platform_organization_features").select("organization_id, module, enabled, access_mode, permission_options, updated_at"),
    supabase.from("platform_audit_logs").select("id, admin_id, organization_id, action, module, metadata, ip_address, user_agent, created_at").order("created_at", { ascending: false }).limit(100),
    supabase.from("platform_usage_metrics").select("*").order("updated_at", { ascending: false }),
    supabase.from("platform_billing_records").select("*").order("issued_at", { ascending: false }).limit(100),
    supabase.from("platform_feature_flags").select("*").order("name"),
    supabase.from("platform_approvals").select("*").order("created_at", { ascending: false }).limit(100),
    supabase.from("platform_notifications").select("*").is("read_at", null).order("created_at", { ascending: false }).limit(20),
    supabase.from("platform_settings").select("key, value, updated_at").order("key"),
    supabase.from("platform_complaints").select("*").order("created_at", { ascending: false }),
    supabase.from("platform_support_contacts").select("*").order("name"),
    supabase.from("login_themes").select("id, name, description, preview_image, theme_type, is_active, created_at").order("created_at"),
    supabase.from("platform_organizations").select("organization_id, name, use_global_login_theme, login_theme_id").order("name"),
    supabase.from("platform_audit_logs").select("id, admin_id, organization_id, action, metadata, created_at").eq("module", "login_experience").order("created_at", { ascending: false }).limit(100),
  ]);
  if (loginThemesError || loginThemeAssignmentsError || loginThemeAuditError) {
    throw new Error(`Could not load login experience settings: ${loginThemesError?.message ?? loginThemeAssignmentsError?.message ?? loginThemeAuditError?.message}`);
  }
  const organizationIds = (loginThemeAssignments ?? []).map((organization) => organization.organization_id);
  const organizationClient = createAdminClient();
  const [{ data: loginOrganizations, error: loginOrganizationsError }, { data: loginAdmins, error: loginAdminsError }] = await Promise.all([
    organizationIds.length
      ? organizationClient.from("organizations").select("id, slug").in("id", organizationIds)
      : Promise.resolve({ data: [], error: null }),
    loginThemeAudit?.length
      ? supabase.from("platform_admins").select("id, display_name").in("id", loginThemeAudit.map((entry) => entry.admin_id).filter((id): id is string => Boolean(id)))
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (loginOrganizationsError) console.error("Could not resolve organization login URLs:", loginOrganizationsError);
  if (loginAdminsError) console.error("Could not resolve login theme audit actors:", loginAdminsError);
  const organizationSlugs = new Map((loginOrganizations ?? []).map((organization) => [organization.id, organization.slug]));
  const adminNames = new Map((loginAdmins ?? []).map((platformAdmin) => [platformAdmin.id, platformAdmin.display_name]));
  const resolvedLoginOrganizations = (loginThemeAssignments ?? []).map((organization) => ({
    ...organization,
    slug: organizationSlugs.get(organization.organization_id) ?? null,
  }));
  const resolvedLoginThemeAudit = (loginThemeAudit ?? []).map((entry) => ({
    ...entry,
    admin_name: entry.admin_id ? adminNames.get(entry.admin_id) ?? "Platform Admin" : "Platform Admin",
  }));
  const logoSetting = settings?.find((setting) => setting.key === "system_logo");
  const logoUrl = typeof logoSetting?.value?.url === "string" ? logoSetting.value.url : "/thinksales-logo.svg";
  const globalLoginThemeId = typeof settings?.find((setting) => setting.key === "global_login_theme")?.value?.theme_id === "string"
    ? String(settings.find((setting) => setting.key === "global_login_theme")?.value?.theme_id)
    : "default-thinksales-login";
  return <><header className="sticky top-0 z-40 border-b border-slate-200 bg-white px-6 py-4"><div className="mx-auto flex max-w-[1600px] items-center gap-4"><img src={logoUrl} alt="ThinkSales" className="h-10 w-10 rounded-xl object-contain" /><div><p className="text-xs font-semibold text-blue-600">ThinkSales Pro</p><h1 className="text-lg font-bold text-slate-950">System Administration Platform</h1></div><Link href="/platform-admin/registrations" className="ml-auto rounded-lg border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700">Registration approvals</Link><div className="text-right"><p className="text-sm font-semibold text-slate-900">{admin.display_name}</p><p className="text-xs text-slate-500">{admin.role.replaceAll("_", " ")}</p></div></div></header><PlatformAdminConsole logoUrl={logoUrl} organizations={organizations ?? []} plans={plans ?? []} features={features ?? []} auditLogs={auditLogs ?? []} usage={usage ?? []} billing={billing ?? []} flags={flags ?? []} approvals={approvals ?? []} notifications={notifications ?? []} settings={settings ?? []} complaints={complaints ?? []} contacts={contacts ?? []} loginThemes={loginThemes ?? []} loginThemeAssignments={resolvedLoginOrganizations} globalLoginThemeId={globalLoginThemeId} loginThemeAudit={resolvedLoginThemeAudit} /></>;
}
