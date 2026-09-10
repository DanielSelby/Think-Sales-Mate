import "server-only";

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
  const [{ data: organizations }, { data: plans }, { data: features }, { data: auditLogs }, { data: usage }, { data: billing }, { data: flags }, { data: approvals }, { data: notifications }, { data: settings }] = await Promise.all([
    supabase.from("platform_organizations").select("id, organization_id, name, plan_id, status, expires_at, created_at, updated_at, industry, suspended_at, suspension_reason").order("updated_at", { ascending: false }),
    supabase.from("subscription_plans").select("id, name, max_users, max_branches, storage_limit_gb, monthly_price, annual_price, ai_access, api_access, included_modules, is_active, archived_at").eq("is_active", true).order("monthly_price"),
    supabase.from("platform_organization_features").select("organization_id, module, enabled, access_mode"),
    supabase.from("platform_audit_logs").select("id, admin_id, organization_id, action, module, metadata, created_at").order("created_at", { ascending: false }).limit(100),
    supabase.from("platform_usage_metrics").select("*").order("updated_at", { ascending: false }),
    supabase.from("platform_billing_records").select("*").order("issued_at", { ascending: false }).limit(100),
    supabase.from("platform_feature_flags").select("*").order("name"),
    supabase.from("platform_approvals").select("*").order("created_at", { ascending: false }).limit(100),
    supabase.from("platform_notifications").select("*").is("read_at", null).order("created_at", { ascending: false }).limit(20),
    supabase.from("platform_settings").select("key, value, updated_at").order("key"),
  ]);
  return <><header className="border-b border-slate-200 bg-white px-6 py-4"><div className="mx-auto flex max-w-[1600px] items-center gap-4"><img src="/thinksales-logo.svg" alt="ThinkSales" className="h-10 w-10 rounded-xl" /><div><p className="text-xs font-semibold text-blue-600">ThinkSales Pro</p><h1 className="text-lg font-bold text-slate-950">System Administration Platform</h1></div><div className="ml-auto text-right"><p className="text-sm font-semibold text-slate-900">{admin.display_name}</p><p className="text-xs text-slate-500">{admin.role.replaceAll("_", " ")}</p></div></div></header><PlatformAdminConsole organizations={organizations ?? []} plans={plans ?? []} features={features ?? []} auditLogs={auditLogs ?? []} usage={usage ?? []} billing={billing ?? []} flags={flags ?? []} approvals={approvals ?? []} notifications={notifications ?? []} settings={settings ?? []} /></>;
}
