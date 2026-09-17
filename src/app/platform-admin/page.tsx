import "server-only";

import Link from "next/link";
import { createPlatformServerClient } from "@/lib/supabase/platform-server";
import { getPlatformAdmin } from "@/lib/platform-auth";
import PlatformAdminConsole from "./platform-admin-console";
import { syncAllOrganizationsToPlatform } from "@/lib/supabase/platform-admin";

export default async function PlatformAdminPage() {
  const admin = await getPlatformAdmin();
  if (!admin) return null;
  try {
    await syncAllOrganizationsToPlatform();
  } catch (error) {
    console.error("Platform organization reconciliation failed:", error);
  }
  const supabase = await createPlatformServerClient();
  const [{ data: organizations }, { data: plans }, { data: features }, { data: auditLogs }, { data: usage }, { data: billing }, { data: flags }, { data: approvals }, { data: notifications }, { data: settings }, { data: complaints }, { data: contacts }] = await Promise.all([
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
  ]);
  const logoSetting = settings?.find((setting) => setting.key === "system_logo");
  const logoUrl = typeof logoSetting?.value?.url === "string" ? logoSetting.value.url : "/thinksales-logo.svg";
  return <><header className="sticky top-0 z-40 border-b border-slate-200 bg-white px-6 py-4"><div className="mx-auto flex max-w-[1600px] items-center gap-4"><img src={logoUrl} alt="ThinkSales" className="h-10 w-10 rounded-xl object-contain" /><div><p className="text-xs font-semibold text-blue-600">ThinkSales Pro</p><h1 className="text-lg font-bold text-slate-950">System Administration Platform</h1></div><Link href="/platform-admin/communication" className="ml-6 rounded-xl bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100">Communication Management</Link><div className="ml-auto text-right"><p className="text-sm font-semibold text-slate-900">{admin.display_name}</p><p className="text-xs text-slate-500">{admin.role.replaceAll("_", " ")}</p></div></div></header><PlatformAdminConsole logoUrl={logoUrl} organizations={organizations ?? []} plans={plans ?? []} features={features ?? []} auditLogs={auditLogs ?? []} usage={usage ?? []} billing={billing ?? []} flags={flags ?? []} approvals={approvals ?? []} notifications={notifications ?? []} settings={settings ?? []} complaints={complaints ?? []} contacts={contacts ?? []} /></>;
}
