"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  createPlatformOrganization,
  createSubscriptionPlan,
  deletePlatformOrganization,
  setOrganizationFeature,
  updatePlatformOrganization,
} from "./actions";
import type { PlatformModule } from "@/types/platform-database";
import { PLATFORM_MODULES } from "@/lib/platform-modules";

type Organization = {
  id: string;
  organization_id: string;
  name: string;
  plan_id: string | null;
  status: "active" | "trial" | "suspended" | "expired";
  expires_at: string | null;
  updated_at: string;
};
type Plan = {
  id: string;
  name: string;
  max_users: number | null;
  max_branches: number | null;
  storage_limit_gb: number | null;
  monthly_price: number;
  ai_access: boolean;
  api_access: boolean;
};
type AuditLog = {
  id: string;
  admin_id: string | null;
  organization_id: string | null;
  action: string;
  module: string;
  metadata: Record<string, unknown>;
  created_at: string;
};
type Tab =
  | "Overview"
  | "Organizations"
  | "Subscription Plans"
  | "Feature Access"
  | "Organization Builder"
  | "Usage & Analytics"
  | "Activity Logs"
  | "Impersonation"
  | "Billing & Subscriptions"
  | "Audit Logs"
  | "System Settings"
  | "Feature Flags";

const tabs: { label: Tab; icon: string }[] = [
  { label: "Overview", icon: "▦" },
  { label: "Organizations", icon: "▣" },
  { label: "Subscription Plans", icon: "◇" },
  { label: "Feature Access", icon: "◈" },
  { label: "Organization Builder", icon: "＋" },
  { label: "Usage & Analytics", icon: "◒" },
  { label: "Activity Logs", icon: "≡" },
  { label: "Impersonation", icon: "◎" },
  { label: "Billing & Subscriptions", icon: "$" },
  { label: "System Settings", icon: "⚙" },
  { label: "Feature Flags", icon: "⚑" },
  { label: "Audit Logs", icon: "▤" },
];
const modules: PlatformModule[] = PLATFORM_MODULES.map((module) => module.key);

function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      <h3 className="font-semibold text-slate-950">{title}</h3>
      {children}
    </section>
  );
}

function Modal({ title, children, close }: { title: string; children: React.ReactNode; close: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">{title}</h3>
          <button onClick={close} className="text-xl text-slate-400" aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function PlatformAdminConsole({
  organizations,
  plans,
  features,
  auditLogs,
}: {
  organizations: Organization[];
  plans: Plan[];
  features: { organization_id: string; module: string; enabled: boolean }[];
  auditLogs: AuditLog[];
}) {
  const [tab, setTab] = useState<Tab>("Organizations");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(organizations[0]?.id ?? null);
  const [modal, setModal] = useState<"organization" | "plan" | null>(null);
  const [busy, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [featureState, setFeatureState] = useState<Record<string, boolean>>(
    Object.fromEntries(features.filter((feature) => feature.organization_id === organizations[0]?.organization_id).map((feature) => [feature.module, feature.enabled])),
  );
  const [orgForm, setOrgForm] = useState({
    organizationId: "",
    name: "",
    status: "trial" as Organization["status"],
    expiresAt: "",
    planId: "",
  });
  const [planForm, setPlanForm] = useState({
    name: "",
    maxUsers: "",
    maxBranches: "",
    storageLimitGb: "",
    monthlyPrice: "",
    aiAccess: false,
    apiAccess: false,
  });

  const filteredOrganizations = useMemo(
    () =>
      organizations.filter((org) =>
        `${org.name} ${org.organization_id}`.toLowerCase().includes(search.toLowerCase()),
      ),
    [organizations, search],
  );
  const selected = organizations.find((org) => org.id === selectedId) ?? filteredOrganizations[0];
  useEffect(() => {
    if (!selected) return;
    setFeatureState(Object.fromEntries(features.filter((feature) => feature.organization_id === selected.organization_id).map((feature) => [feature.module, feature.enabled])));
  }, [features, selected]);
  const counts = {
    total: organizations.length,
    active: organizations.filter((org) => org.status === "active").length,
    suspended: organizations.filter((org) => org.status === "suspended").length,
    expired: organizations.filter((org) => org.status === "expired").length,
  };
  const run = (work: () => Promise<unknown>, success: string) =>
    startTransition(async () => {
      try {
        await work();
        setModal(null);
        setMessage(success);
        window.location.reload();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Action failed.");
      }
    });

  return (
    <div className="flex min-h-[calc(100vh-74px)] bg-[#f5f8fc]">
      <aside className="hidden w-56 shrink-0 bg-[#06294a] text-white lg:block">
        <div className="border-b border-white/10 px-4 py-5">
          <div className="flex items-center gap-2">
            <img src="/thinksales-logo.svg" alt="" className="h-8 w-8 rounded-lg" />
            <span className="font-bold">ThinkSales <small className="text-blue-300">Pro</small></span>
          </div>
        </div>
        <nav className="space-y-1 p-3">
          <button className="mb-3 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs text-slate-300 hover:bg-white/10">⌂ Dashboard</button>
          <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-blue-300">System Administration Platform</p>
          {tabs.slice(0, 9).map((item) => (
            <button
              key={item.label}
              onClick={() => setTab(item.label)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs font-semibold ${
                tab === item.label ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-white/10"
              }`}
            >
              <span className="w-4 text-center">{item.icon}</span>{item.label}
            </button>
          ))}
          <div className="my-3 border-t border-white/10" />
          {tabs.slice(9).map((item) => (
            <button key={item.label} onClick={() => setTab(item.label)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs font-semibold ${tab === item.label ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-white/10"}`}>
              <span className="w-4 text-center">{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>
        <div className="mx-3 mt-12 rounded-lg border border-blue-400/30 bg-blue-900/40 p-3 text-center text-[11px] text-blue-100">Need Help?<br /><span className="text-blue-300">Contact support</span></div>
      </aside>

      {modal === "organization" && (
        <Modal title="Add organization" close={() => setModal(null)}>
          <form className="mt-5 space-y-3" onSubmit={(event) => { event.preventDefault(); run(() => createPlatformOrganization(orgForm), "Organization added."); }}>
            <div>
              <input required placeholder="Organization UUID" value={orgForm.organizationId} onChange={(e) => setOrgForm({ ...orgForm, organizationId: e.target.value })} className="h-11 w-full rounded-lg border px-3 text-sm" />
              <p className="mt-1 text-[11px] text-slate-500">Find it in the organization Supabase project: Table Editor → organizations → id.</p>
            </div>
            <input required placeholder="Organization name" value={orgForm.name} onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })} className="h-11 w-full rounded-lg border px-3 text-sm" />
            <div className="grid grid-cols-2 gap-3">
              <select value={orgForm.status} onChange={(e) => setOrgForm({ ...orgForm, status: e.target.value as Organization["status"] })} className="h-11 rounded-lg border px-3 text-sm"><option value="active">Active</option><option value="trial">Trial</option><option value="suspended">Suspended</option><option value="expired">Expired</option></select>
              <select value={orgForm.planId} onChange={(e) => setOrgForm({ ...orgForm, planId: e.target.value })} className="h-11 rounded-lg border px-3 text-sm"><option value="">No plan</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select>
            </div>
            <input type="date" value={orgForm.expiresAt} onChange={(e) => setOrgForm({ ...orgForm, expiresAt: e.target.value })} className="h-11 w-full rounded-lg border px-3 text-sm" />
            <button disabled={busy} className="h-11 w-full rounded-lg bg-blue-600 font-semibold text-white">{busy ? "Saving..." : "Add organization"}</button>
          </form>
        </Modal>
      )}
      {modal === "plan" && (
        <Modal title="Create subscription plan" close={() => setModal(null)}>
          <form className="mt-5 space-y-3" onSubmit={(event) => { event.preventDefault(); run(() => createSubscriptionPlan({ name: planForm.name, maxUsers: Number(planForm.maxUsers) || undefined, maxBranches: Number(planForm.maxBranches) || undefined, storageLimitGb: Number(planForm.storageLimitGb) || undefined, monthlyPrice: Number(planForm.monthlyPrice) || 0, aiAccess: planForm.aiAccess, apiAccess: planForm.apiAccess }), "Subscription plan created."); }}>
            <input required placeholder="Plan name" value={planForm.name} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} className="h-11 w-full rounded-lg border px-3 text-sm" />
            <div className="grid grid-cols-2 gap-3">{(["maxUsers", "maxBranches", "storageLimitGb", "monthlyPrice"] as const).map((field) => <input key={field} type="number" min="0" placeholder={field.replace(/([A-Z])/g, " $1")} value={planForm[field]} onChange={(e) => setPlanForm({ ...planForm, [field]: e.target.value })} className="h-11 rounded-lg border px-3 text-sm" />)}</div>
            <label className="flex gap-2 text-sm"><input type="checkbox" checked={planForm.aiAccess} onChange={(e) => setPlanForm({ ...planForm, aiAccess: e.target.checked })} /> AI access</label>
            <label className="flex gap-2 text-sm"><input type="checkbox" checked={planForm.apiAccess} onChange={(e) => setPlanForm({ ...planForm, apiAccess: e.target.checked })} /> API access</label>
            <button disabled={busy} className="h-11 w-full rounded-lg bg-blue-600 font-semibold text-white">{busy ? "Saving..." : "Create plan"}</button>
          </form>
        </Modal>
      )}

      <main className="min-w-0 flex-1 p-4 md:p-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs text-slate-400">System Administration Platform <span className="mx-1">›</span> {tab}</p><h2 className="mt-1 text-2xl font-bold text-slate-950">{tab === "Organizations" ? "Organization Management" : tab}</h2><p className="mt-1 text-sm text-slate-500">Manage organizations, subscriptions, modules, permissions, billing, and platform-wide settings.</p></div>
          <div className="flex flex-wrap gap-2"><button onClick={() => setModal("organization")} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">+ Add Organization</button><button onClick={() => setModal("plan")} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold">Create Subscription Plan</button><button onClick={() => window.location.reload()} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold">Refresh</button></div>
        </div>
        {message && <button onClick={() => setMessage(null)} className="mb-4 w-full rounded-lg bg-blue-50 p-3 text-left text-sm text-blue-800">{message} ×</button>}

        {tab === "Organizations" ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {[["Total Organizations", counts.total, "bg-blue-50"], ["Active Organizations", counts.active, "bg-emerald-50"], ["Suspended", counts.suspended, "bg-amber-50"], ["Expired Subscriptions", counts.expired, "bg-rose-50"], ["Total Monthly Revenue", "—", "bg-violet-50"]].map(([label, value, color]) => <div key={String(label)} className={`rounded-xl border border-slate-200 ${color} p-4 shadow-sm`}><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-slate-950">{value}</p><p className="mt-1 text-[11px] text-emerald-600">↑ Platform metric</p></div>)}
            </div>
            <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_290px]">
              <Card title="Organizations" className="overflow-hidden">
                <div className="mb-4 flex flex-wrap gap-2"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search organization name..." className="h-10 min-w-[220px] flex-1 rounded-lg border px-3 text-sm" /><select className="h-10 rounded-lg border px-3 text-xs"><option>All Plans</option>{plans.map((plan) => <option key={plan.id}>{plan.name}</option>)}</select><select className="h-10 rounded-lg border px-3 text-xs"><option>All Status</option><option>Active</option><option>Suspended</option><option>Expired</option></select><button className="rounded-lg border px-3 text-xs font-semibold">☷ Filters</button></div>
                <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-y bg-slate-50 text-[11px] uppercase text-slate-500"><tr>{["Organization", "Plan", "Users", "Branches", "Status", "Expiry Date", "Actions"].map((heading) => <th key={heading} className="px-3 py-3">{heading}</th>)}</tr></thead><tbody className="divide-y">{filteredOrganizations.map((org) => <tr key={org.id} onClick={() => setSelectedId(org.id)} className={`cursor-pointer hover:bg-blue-50 ${selected?.id === org.id ? "bg-blue-50/60" : ""}`}><td className="px-3 py-3"><p className="font-semibold">{org.name}</p><p className="text-[10px] text-slate-400">{org.organization_id}</p></td><td className="px-3 py-3">{plans.find((plan) => plan.id === org.plan_id)?.name ?? "—"}</td><td className="px-3 py-3">—</td><td className="px-3 py-3">—</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-[11px] ${org.status === "active" ? "bg-emerald-50 text-emerald-700" : org.status === "suspended" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{org.status}</span></td><td className="px-3 py-3">{org.expires_at ? new Date(org.expires_at).toLocaleDateString() : "—"}</td><td className="px-3 py-3"><button onClick={(event) => { event.stopPropagation(); run(() => updatePlatformOrganization(org.id, { status: org.status === "suspended" ? "active" : "suspended" }), "Organization status updated."); }} className="rounded border px-2 py-1 text-[11px]">{org.status === "suspended" ? "Activate" : "Suspend"}</button><button onClick={(event) => { event.stopPropagation(); if (window.confirm(`Delete ${org.name}?`)) run(() => deletePlatformOrganization(org.id), "Organization deleted."); }} className="ml-1 rounded border border-red-200 px-2 py-1 text-[11px] text-red-600">Delete</button></td></tr>)}</tbody></table>{filteredOrganizations.length === 0 && <p className="p-8 text-center text-sm text-slate-500">No organizations registered yet.</p>}</div>
                <p className="mt-3 text-[11px] text-slate-400">Showing {filteredOrganizations.length} of {organizations.length} organizations</p>
              </Card>
              <div className="space-y-5">
                <Card title="Organization Details">{selected ? <><div className="mt-4 flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 font-bold text-white">{selected.name.slice(0, 2).toUpperCase()}</div><div><p className="font-semibold">{selected.name}</p><p className="text-xs text-emerald-600">● {selected.status}</p></div></div><dl className="mt-4 space-y-3 text-xs"><div className="flex justify-between gap-3"><dt className="text-slate-500">Organization ID</dt><dd className="max-w-[150px] truncate font-medium" title={selected.organization_id}>{selected.organization_id}</dd></div><div className="flex justify-between"><dt className="text-slate-500">Plan</dt><dd>{plans.find((plan) => plan.id === selected.plan_id)?.name ?? "Not assigned"}</dd></div><div className="flex justify-between"><dt className="text-slate-500">Expiry</dt><dd>{selected.expires_at ? new Date(selected.expires_at).toLocaleDateString() : "Not set"}</dd></div></dl><div className="mt-5 grid grid-cols-2 gap-2"><button className="rounded-lg border px-2 py-2 text-xs">View details</button><button className="rounded-lg bg-blue-600 px-2 py-2 text-xs font-semibold text-white">Manage subscription</button></div></> : <p className="mt-4 text-sm text-slate-500">Select an organization to view details.</p>}</Card>
                <Card title="Quick Actions">{["Impersonate Organization", "View Organization Details", "Manage Users", "Manage Branches"].map((item) => <button key={item} onClick={() => setMessage(`${item} is available after selecting an organization.`)} className="mt-2 flex w-full items-center justify-between rounded-lg border border-slate-100 p-3 text-left text-xs font-semibold hover:bg-slate-50">{item}<span>›</span></button>)}</Card>
              </div>
            </div>
            <div className="mt-5 grid gap-5 lg:grid-cols-3"><Card title="Feature Access"><p className="mt-2 text-xs text-slate-500">Changes are saved to the platform entitlement store.</p><div className="mt-3 grid grid-cols-2 gap-2 text-xs">{modules.map((module) => <label key={module} className="flex items-center justify-between rounded border p-2">{module}<input type="checkbox" checked={featureState[module] ?? false} onChange={(event) => { if (!selected) return; const enabled = event.target.checked; setFeatureState((current) => ({ ...current, [module]: enabled })); run(() => setOrganizationFeature(selected.organization_id, module, enabled), `${module} access updated.`); }} /></label>)}</div></Card><Card title="Subscription Plan"><p className="mt-3 text-lg font-bold">{selected ? plans.find((plan) => plan.id === selected.plan_id)?.name ?? "Not assigned" : "—"}</p><p className="mt-1 text-xs text-slate-500">Plan limits and included modules</p></Card><Card title="Recent Activity"><div className="mt-3 space-y-3 text-xs text-slate-500"><p>Organization actions are audited in Platform Supabase.</p><p>Use Audit Logs to review platform actions.</p></div></Card></div>
          </>
        ) : tab === "Subscription Plans" ? <Card title="Subscription Plans"><div className="mb-4 flex justify-end"><button onClick={() => setModal("plan")} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">Create plan</button></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{plans.map((plan) => <div key={plan.id} className="rounded-xl border p-4"><p className="font-semibold">{plan.name}</p><p className="mt-2 text-2xl font-bold">${Number(plan.monthly_price).toLocaleString()}<span className="text-xs font-normal text-slate-500">/month</span></p><p className="mt-3 text-xs text-slate-500">{plan.max_users ?? "Unlimited"} users · {plan.max_branches ?? "Unlimited"} branches · {plan.storage_limit_gb ?? "Unlimited"} GB</p></div>)}</div></Card> : tab === "Activity Logs" || tab === "Audit Logs" ? <Card title={tab}><p className="mt-2 text-xs text-slate-500">Recorded platform actions, including logins, organization changes, plan changes, and feature access updates.</p><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="border-y bg-slate-50 text-[11px] uppercase text-slate-500"><tr>{["Time", "Action", "Module", "Organization", "Details"].map((heading) => <th key={heading} className="px-3 py-3">{heading}</th>)}</tr></thead><tbody className="divide-y">{auditLogs.map((log) => <tr key={log.id} className="hover:bg-slate-50"><td className="whitespace-nowrap px-3 py-3 text-xs text-slate-500">{new Date(log.created_at).toLocaleString()}</td><td className="px-3 py-3 font-semibold">{log.action.replaceAll("_", " ")}</td><td className="px-3 py-3 text-xs text-slate-500">{log.module}</td><td className="px-3 py-3 text-xs">{organizations.find((org) => org.organization_id === log.organization_id)?.name ?? (log.organization_id ?? "Platform-wide")}</td><td className="max-w-[280px] truncate px-3 py-3 text-xs text-slate-500" title={JSON.stringify(log.metadata)}>{Object.entries(log.metadata).map(([key, value]) => `${key}: ${String(value)}`).join(" · ") || "—"}</td></tr>)}</tbody></table>{auditLogs.length === 0 && <p className="p-8 text-center text-sm text-slate-500">No platform activity has been recorded yet.</p>}</div></Card> : <div className="grid gap-5 lg:grid-cols-2"><Card title={tab}><p className="mt-3 text-sm text-slate-500">This workspace is ready for platform {tab.toLowerCase()} data. Use the sidebar to switch modules.</p></Card><Card title="Recent Organizations"><div className="mt-3 divide-y">{organizations.slice(0, 6).map((org) => <div key={org.id} className="flex justify-between py-3 text-sm"><span>{org.name}</span><span className="text-xs text-slate-500">{org.status}</span></div>)}</div></Card></div>}
      </main>
    </div>
  );
}
