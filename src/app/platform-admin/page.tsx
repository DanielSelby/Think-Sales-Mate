import { getPlatformAdmin } from "@/lib/platform-auth";
import { createPlatformServerClient } from "@/lib/supabase/platform-server";

const tabs = ["Overview", "Organizations", "Subscription Plans", "Feature Access", "Organization Builder", "Billing & Revenue", "Usage Analytics", "Activity Logs", "Support Center", "Feature Flags", "API & Integrations", "Security Center", "Audit Logs", "System Settings"];

export default async function PlatformAdminPage() {
  const admin = await getPlatformAdmin();
  if (!admin) return null;
  const supabase = await createPlatformServerClient();
  const [{ count: totalOrganizations }, { count: activeOrganizations }, { count: trialOrganizations }, { count: expiredOrganizations }, { data: organizations }] = await Promise.all([
    supabase.from("platform_organizations").select("id", { count: "exact", head: true }),
    supabase.from("platform_organizations").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("platform_organizations").select("id", { count: "exact", head: true }).eq("status", "trial"),
    supabase.from("platform_organizations").select("id", { count: "exact", head: true }).eq("status", "expired"),
    supabase.from("platform_organizations").select("id, organization_id, name, status, expires_at, updated_at").order("updated_at", { ascending: false }).limit(10),
  ]);
  const kpis = [["Total Organizations", totalOrganizations ?? 0], ["Active Organizations", activeOrganizations ?? 0], ["Trial Organizations", trialOrganizations ?? 0], ["Expired Organizations", expiredOrganizations ?? 0], ["Total Active Users", "—"], ["Total Revenue", "—"], ["Total Branches", "—"], ["Platform Health", "Healthy"]];
  return (
    <main className="min-h-screen">
      <header className="border-b border-slate-200 bg-white px-6 py-4"><div className="mx-auto flex max-w-[1600px] items-center gap-4"><img src="/thinksales-logo.svg" alt="ThinkSales" className="h-10 w-10 rounded-xl" /><div><p className="text-xs font-semibold text-blue-600">ThinkSales Pro</p><h1 className="text-lg font-bold text-slate-950">Platform Administration</h1></div><div className="ml-auto text-right"><p className="text-sm font-semibold text-slate-900">{admin.display_name}</p><p className="text-xs text-slate-500">{admin.role.replaceAll("_", " ")}</p></div></div></header>
      <div className="mx-auto grid max-w-[1600px] gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_280px]">
        <section className="space-y-5"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs text-slate-400">Platform Admin <span className="mx-1">›</span> Dashboard</p><h2 className="mt-1 text-2xl font-bold text-slate-950">Platform Administration</h2><p className="mt-1 text-sm text-slate-500">Manage organizations, subscriptions, modules, permissions, billing, and platform-wide settings.</p></div><div className="flex flex-wrap gap-2"><button className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">+ Add Organization</button><button className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold">Create Subscription Plan</button><button className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold">Refresh</button></div></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{kpis.map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-slate-950">{value}</p><p className="mt-1 text-[11px] text-emerald-600">↑ Platform metric</p></div>)}</div>
          <nav className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">{tabs.map((tab, index) => <button key={tab} className={`rounded-lg px-3 py-2 text-xs font-semibold ${index === 0 ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}>{tab}</button>)}</nav>
          <div className="grid gap-5 lg:grid-cols-2"><section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="font-semibold">Organization Growth</h3><div className="mt-6 flex h-48 items-end gap-3 border-b border-slate-100">{[32, 45, 40, 60, 55, 72, 85, 100].map((height, i) => <div key={i} className="flex flex-1 items-end"><div className="w-full rounded-t bg-blue-500" style={{ height: `${height}%` }} /></div>)}</div></section><section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="font-semibold">Recent Organizations</h3><div className="mt-4 divide-y divide-slate-100">{(organizations ?? []).slice(0, 6).map((org) => <div key={org.id} className="flex items-center justify-between py-3 text-sm"><span className="font-medium">{org.name}</span><span className="rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">{org.status}</span></div>)}</div></section></div>
        </section>
        <aside className="space-y-4"><div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><h3 className="font-semibold">Quick Actions</h3>{["New Organization", "New Subscription", "Support Queue", "Revenue Summary", "Platform Status"].map((item) => <button key={item} className="mt-2 flex w-full items-center justify-between rounded-lg border border-slate-100 p-3 text-left text-xs font-semibold hover:bg-slate-50">{item}<span>›</span></button>)}</div><div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><h3 className="font-semibold">Platform Status</h3><p className="mt-4 text-sm font-semibold text-emerald-600">● System Online</p><p className="mt-2 text-xs text-slate-500">Platform services are operating normally.</p></div></aside>
      </div>
    </main>
  );
}
