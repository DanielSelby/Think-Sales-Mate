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
  const [{ data: organizations }, { data: plans }, { data: features }, { data: auditLogs }] = await Promise.all([
    supabase.from("platform_organizations").select("id, organization_id, name, plan_id, status, expires_at, updated_at").order("updated_at", { ascending: false }),
    supabase.from("subscription_plans").select("id, name, max_users, max_branches, storage_limit_gb, monthly_price, ai_access, api_access").eq("is_active", true).order("monthly_price"),
    supabase.from("platform_organization_features").select("organization_id, module, enabled"),
    supabase.from("platform_audit_logs").select("id, admin_id, organization_id, action, module, metadata, created_at").order("created_at", { ascending: false }).limit(100),
  ]);
  return <><header className="border-b border-slate-200 bg-white px-6 py-4"><div className="mx-auto flex max-w-[1600px] items-center gap-4"><img src="/thinksales-logo.svg" alt="ThinkSales" className="h-10 w-10 rounded-xl" /><div><p className="text-xs font-semibold text-blue-600">ThinkSales Pro</p><h1 className="text-lg font-bold text-slate-950">System Administration Platform</h1></div><div className="ml-auto text-right"><p className="text-sm font-semibold text-slate-900">{admin.display_name}</p><p className="text-xs text-slate-500">{admin.role.replaceAll("_", " ")}</p></div></div></header><PlatformAdminConsole organizations={organizations ?? []} plans={plans ?? []} features={features ?? []} auditLogs={auditLogs ?? []} /></>;
}
