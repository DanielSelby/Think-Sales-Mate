import "server-only";
import Link from "next/link";

import { createPlatformServerClient } from "@/lib/supabase/platform-server";
import { getPlatformAdmin, platformRoleCan } from "@/lib/platform-auth";
import PlatformAdminConsole from "./platform-admin-console";
import PlatformNotificationBell from "./notification-bell";
import type { ManagedOrganization } from "./organization-management";
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
    supabase.from("platform_organizations").select("id, organization_id, name, plan_id, status, expires_at, created_at, updated_at, industry, suspended_at, suspension_reason, owner_user_id, owner_email, registration_state, registration_notes, max_users_override, max_branches_override").order("updated_at", { ascending: false }),
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
  const organizationRecordIds = (organizations ?? []).map((organization) => organization.organization_id);
  const [{ data: loginOrganizations, error: loginOrganizationsError }, { data: loginAdmins, error: loginAdminsError }, { data: coreOrganizations, error: coreOrganizationsError }, { data: companyProfiles, error: companyProfilesError }, { data: organizationMembers, error: organizationMembersError }, { data: businessLocations, error: businessLocationsError }] = await Promise.all([
    organizationIds.length
      ? organizationClient.from("organizations").select("id, slug").in("id", organizationIds)
      : Promise.resolve({ data: [], error: null }),
    loginThemeAudit?.length
      ? supabase.from("platform_admins").select("id, display_name").in("id", loginThemeAudit.map((entry) => entry.admin_id).filter((id): id is string => Boolean(id)))
      : Promise.resolve({ data: [], error: null }),
    organizationRecordIds.length
      ? organizationClient.from("organizations").select("id, created_by").in("id", organizationRecordIds)
      : Promise.resolve({ data: [], error: null }),
    organizationRecordIds.length
      ? organizationClient.from("company_profile").select("org_id, business_type, industry, country, logo_url, contact_name, contact_email, contact_phone, business_email, business_phone").in("org_id", organizationRecordIds)
      : Promise.resolve({ data: [], error: null }),
    organizationRecordIds.length
      ? organizationClient.from("organization_members").select("org_id, user_id, role, status, username, phone, contact_email").in("org_id", organizationRecordIds)
      : Promise.resolve({ data: [], error: null }),
    organizationRecordIds.length
      ? organizationClient.from("business_locations").select("id, org_id, name, country, is_active").in("org_id", organizationRecordIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (coreOrganizationsError || companyProfilesError || organizationMembersError || businessLocationsError) {
    throw new Error(`Could not load organization management details: ${coreOrganizationsError?.message ?? companyProfilesError?.message ?? organizationMembersError?.message ?? businessLocationsError?.message}`);
  }
  const profileIds = [...new Set((organizationMembers ?? []).map((member) => member.user_id).filter((id): id is string => Boolean(id)))];
  const { data: resolvedMemberProfiles, error: resolvedMemberProfilesError } = profileIds.length
    ? await organizationClient.from("profiles").select("id, full_name").in("id", profileIds)
    : { data: [], error: null };
  if (resolvedMemberProfilesError) throw new Error(`Could not load organization user names: ${resolvedMemberProfilesError.message}`);
  if (loginOrganizationsError) console.error("Could not resolve organization login URLs:", loginOrganizationsError);
  if (loginAdminsError) console.error("Could not resolve login theme audit actors:", loginAdminsError);
  const organizationSlugs = new Map((loginOrganizations ?? []).map((organization) => [organization.id, organization.slug]));
  const ownerByOrg = new Map((coreOrganizations ?? []).map((organization) => [organization.id, organization.created_by]));
  const companyByOrg = new Map((companyProfiles ?? []).map((profile) => [profile.org_id, profile]));
  const profileByUser = new Map((resolvedMemberProfiles ?? []).map((profile) => [profile.id, profile.full_name]));
  const membersByOrg = new Map<string, typeof organizationMembers>();
  (organizationMembers ?? []).forEach((member) => {
    const current = membersByOrg.get(member.org_id) ?? [];
    current.push(member);
    membersByOrg.set(member.org_id, current);
  });
  const locationsByOrg = new Map<string, Array<{ id: string; org_id: string; name: string; country: string | null; is_active: boolean }>>();
  (businessLocations ?? []).forEach((location) => {
    const current = locationsByOrg.get(location.org_id) ?? [];
    current.push(location);
    locationsByOrg.set(location.org_id, current);
  });
  const managedOrganizations: ManagedOrganization[] = (organizations ?? []).map((organization) => {
    const ownerUserId = organization.owner_user_id ?? ownerByOrg.get(organization.organization_id) ?? null;
    const members = membersByOrg.get(organization.organization_id) ?? [];
    const ownerMember = members.find((member) => member.user_id === ownerUserId || member.role === "owner");
    const company = companyByOrg.get(organization.organization_id);
    const relatedLocations = locationsByOrg.get(organization.organization_id) ?? [];
    const relatedFeatures = (features ?? []).filter((feature) => feature.organization_id === organization.organization_id);
    const ownerName = (ownerUserId ? profileByUser.get(ownerUserId) : null)
      ?? ownerMember?.username
      ?? company?.contact_name
      ?? null;
    const ownerEmail = organization.owner_email
      ?? ownerMember?.contact_email
      ?? company?.contact_email
      ?? company?.business_email
      ?? null;
    const ownerPhone = ownerMember?.phone
      ?? company?.contact_phone
      ?? company?.business_phone
      ?? null;
    return {
      ...organization,
      owner_user_id: ownerUserId,
      owner_email: ownerEmail,
      registration_state: organization.registration_state ?? (organization.status === "rejected" ? "rejected" : organization.status === "pending" ? "pending" : "approved"),
      registration_notes: organization.registration_notes,
      max_users_override: organization.max_users_override,
      max_branches_override: organization.max_branches_override,
      business_type: company?.business_type ?? company?.industry ?? organization.industry,
      country: company?.country ?? null,
      logo_url: company?.logo_url ?? null,
      owner_name: ownerName,
      owner_phone: ownerPhone,
      branch_count: relatedLocations.length,
      user_count: members.filter((member) => member.status === "active" || member.status === "invited").length,
      read_only: relatedFeatures.some((feature) => feature.access_mode === "read_only"),
      owner_users: members.map((member) => ({
        name: (member.user_id ? profileByUser.get(member.user_id) : null) ?? member.username ?? "Organization user",
        email: member.contact_email ?? (member.user_id === ownerUserId ? ownerEmail : null) ?? "",
        phone: member.phone ?? "",
        status: member.status,
      })),
      branches: relatedLocations.map((location) => ({
        id: location.id,
        name: location.name,
        country: location.country,
        is_active: location.is_active,
      })),
    };
  });
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
  return <><header className="platform-admin-header sticky top-0 z-40 border-b border-slate-200 bg-white px-6 py-4"><div className="mx-auto flex max-w-[1600px] items-center gap-4"><img src={logoUrl} alt="ThinkSales" className="h-10 w-10 rounded-xl object-contain" /><div><p className="text-xs font-semibold text-blue-600">ThinkSales Pro</p><h1 className="text-lg font-bold text-slate-950">System Administration Platform</h1></div><PlatformNotificationBell initialNotifications={notifications ?? []} /><Link href="/platform-admin/registrations" className="ml-auto rounded-lg border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700">Registration approvals</Link><div className="text-right"><p className="text-sm font-semibold text-slate-900">{admin.display_name}</p><p className="text-xs text-slate-500">{admin.role.replaceAll("_", " ")}</p></div></div></header><PlatformAdminConsole asOf={new Date().toISOString()} logoUrl={logoUrl} organizations={organizations ?? []} managedOrganizations={managedOrganizations} canManageOrganizations={platformRoleCan(admin.role, "manage_platform")} auditLogs={auditLogs ?? []} plans={plans ?? []} features={features ?? []} usage={usage ?? []} billing={billing ?? []} flags={flags ?? []} approvals={approvals ?? []} notifications={notifications ?? []} settings={settings ?? []} complaints={complaints ?? []} contacts={contacts ?? []} loginThemes={loginThemes ?? []} loginThemeAssignments={resolvedLoginOrganizations} globalLoginThemeId={globalLoginThemeId} loginThemeAudit={resolvedLoginThemeAudit} /></>;
}
