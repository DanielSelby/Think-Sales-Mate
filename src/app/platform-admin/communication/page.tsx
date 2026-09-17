import "server-only";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createPlatformServerClient } from "@/lib/supabase/platform-server";
import { getPlatformAdmin } from "@/lib/platform-auth";
import CommunicationManagementWorkspace from "./communication-management-workspace";

export default async function PlatformCommunicationPage() {
  const admin = await getPlatformAdmin();
  if (!admin) return null;

  const supabase = await createPlatformServerClient();
  const [{ data: organizations }, { data: usage }, { data: billing }, { data: logs }, { data: creditAccounts }, { data: creditTransactions }, { data: campaigns }, { data: providers }, { data: alerts }] = await Promise.all([
    supabase.from("platform_organizations").select("id, organization_id, name, plan_id, status, updated_at").order("name"),
    supabase.from("platform_usage_metrics").select("organization_id, monthly_activity, sales_volume, updated_at"),
    supabase.from("platform_billing_records").select("organization_id, amount, status, issued_at").order("issued_at", { ascending: false }).limit(500),
    supabase.from("platform_audit_logs").select("id, organization_id, action, module, metadata, created_at").eq("module", "communication").order("created_at", { ascending: false }).limit(200),
    (supabase.from("platform_communication_accounts") as any).select("*"),
    (supabase.from("platform_communication_credit_transactions") as any).select("*").order("created_at", { ascending: false }).limit(500),
    (supabase.from("platform_communication_campaigns") as any).select("*").order("created_at", { ascending: false }),
    (supabase.from("platform_communication_providers") as any).select("*").order("provider_name"),
    (supabase.from("platform_communication_alerts") as any).select("*").is("resolved_at", null).order("created_at", { ascending: false }),
  ]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-[1600px] items-center gap-4">
          <Link href="/platform-admin" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Back to Platform Administration">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <p className="text-xs font-semibold text-blue-600">Platform Administration</p>
            <h1 className="text-lg font-bold text-slate-950">Communication Management</h1>
          </div>
          <div className="ml-auto text-right">
            <p className="text-sm font-semibold text-slate-900">{admin.display_name}</p>
            <p className="text-xs capitalize text-slate-500">{admin.role.replaceAll("_", " ")}</p>
          </div>
        </div>
      </header>
      <CommunicationManagementWorkspace
        organizations={organizations ?? []}
        usage={usage ?? []}
        billing={billing ?? []}
        logs={logs ?? []}
        creditAccounts={creditAccounts ?? []}
        creditTransactions={creditTransactions ?? []}
        campaigns={campaigns ?? []}
        providers={providers ?? []}
        alerts={alerts ?? []}
      />
    </div>
  );
}
