"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createPlatformOrganization,
  createSubscriptionPlan,
  deletePlatformOrganization,
  setOrganizationFeature,
  updatePlatformOrganization,
  updateSubscriptionPlan,
  archiveSubscriptionPlan,
  setFeatureFlag,
  setOrganizationFeatureAccess,
  reviewPlatformApproval,
  updatePlatformSetting,
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
  created_at: string;
  industry: string | null;
  updated_at: string;
};
type Plan = {
  id: string;
  name: string;
  max_users: number | null;
  max_branches: number | null;
  storage_limit_gb: number | null;
  monthly_price: number;
  annual_price: number | null;
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
type UsageMetric = {
  organization_id: string;
  active_users: number;
  branches: number;
  orders: number;
  sales_volume: number;
  storage_used_gb: number;
  api_usage: number;
  updated_at: string;
};
type BillingRecord = {
  id: string;
  organization_id: string;
  invoice_number: string;
  amount: number;
  status: "paid" | "outstanding" | "refunded" | "void";
  issued_at: string;
  due_at: string | null;
};
type FeatureFlag = {
  id: string;
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  scope: "platform" | "plan" | "organization";
};
type Approval = {
  id: string;
  organization_id: string | null;
  approval_type: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  created_at: string;
};
type PlatformSetting = { key: string; value: Record<string, unknown>; updated_at: string };
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
  usage,
  billing,
  flags,
  approvals,
  notifications,
  settings,
}: {
  organizations: Organization[];
  plans: Plan[];
  features: { organization_id: string; module: string; enabled: boolean; access_mode: "enabled" | "disabled" | "read_only" }[];
  auditLogs: AuditLog[];
  usage: UsageMetric[];
  billing: BillingRecord[];
  flags: FeatureFlag[];
  approvals: Approval[];
  notifications: { id: string; severity: string; title: string; message: string; created_at: string }[];
  settings: PlatformSetting[];
}) {
  const [tab, setTab] = useState<Tab>("Organizations");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(organizations[0]?.id ?? null);
  const [modal, setModal] = useState<"organization" | "plan" | null>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [featureState, setFeatureState] = useState<Record<string, boolean>>(
    Object.fromEntries(features.filter((feature) => feature.organization_id === organizations[0]?.organization_id).map((feature) => [feature.module, feature.enabled])),
  );
  const [featureModes, setFeatureModes] = useState<Record<string, "enabled" | "disabled" | "read_only">>(
    Object.fromEntries(features.filter((feature) => feature.organization_id === organizations[0]?.organization_id).map((feature) => [feature.module, feature.access_mode ?? (feature.enabled ? "enabled" : "disabled")])),
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
    annualPrice: "",
    aiAccess: false,
    apiAccess: false,
  });
  const [planFilter, setPlanFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [activityOrganizationFilter, setActivityOrganizationFilter] = useState("");
  const [activityModuleFilter, setActivityModuleFilter] = useState("");
  const [activityActionFilter, setActivityActionFilter] = useState("");
  const [activityDateFilter, setActivityDateFilter] = useState("");
  const [settingsForm, setSettingsForm] = useState<Record<string, string>>(
    Object.fromEntries(settings.map((setting) => [setting.key, JSON.stringify(setting.value)])),
  );

  const filteredOrganizations = useMemo(
    () =>
      organizations.filter((org) =>
        `${org.name} ${org.organization_id}`.toLowerCase().includes(search.toLowerCase())
        && (!planFilter || org.plan_id === planFilter)
        && (!statusFilter || org.status === statusFilter),
      ),
    [organizations, search, planFilter, statusFilter],
  );
  const selected = organizations.find((org) => org.id === selectedId) ?? filteredOrganizations[0];
  const filteredAuditLogs = useMemo(
    () => auditLogs.filter((log) => {
      const organizationMatches = !activityOrganizationFilter || log.organization_id === activityOrganizationFilter;
      const moduleMatches = !activityModuleFilter || log.module === activityModuleFilter;
      const actionMatches = !activityActionFilter || log.action === activityActionFilter;
      const dateMatches = !activityDateFilter || log.created_at.slice(0, 10) === activityDateFilter;
      return organizationMatches && moduleMatches && actionMatches && dateMatches;
    }),
    [auditLogs, activityOrganizationFilter, activityModuleFilter, activityActionFilter, activityDateFilter],
  );
  useEffect(() => {
    if (!selected) return;
    setFeatureState(Object.fromEntries(features.filter((feature) => feature.organization_id === selected.organization_id).map((feature) => [feature.module, feature.enabled])));
    setFeatureModes(Object.fromEntries(features.filter((feature) => feature.organization_id === selected.organization_id).map((feature) => [feature.module, feature.access_mode ?? (feature.enabled ? "enabled" : "disabled")])));
  }, [features, selected]);
  const counts = {
    total: organizations.length,
    active: organizations.filter((org) => org.status === "active").length,
    suspended: organizations.filter((org) => org.status === "suspended").length,
    expired: organizations.filter((org) => org.status === "expired").length,
    trial: organizations.filter((org) => org.status === "trial").length,
  };
  const totalUsers = usage.reduce((sum, metric) => sum + Number(metric.active_users || 0), 0);
  const monthlyRevenue = organizations.reduce((sum, org) => sum + Number(plans.find((plan) => plan.id === org.plan_id)?.monthly_price || 0), 0);
  const annualRevenue = organizations.reduce((sum, org) => sum + Number(plans.find((plan) => plan.id === org.plan_id)?.annual_price || 0), 0);
  const expiringSubscriptions = organizations.filter((org) => org.expires_at && new Date(org.expires_at).getTime() <= Date.now() + 30 * 24 * 60 * 60 * 1000).length;
  const run = async (work: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await work();
      setModal(null);
      setMessage(success);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  };

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
          <button type="button" onClick={() => setTab("Overview")} className="mb-3 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs text-slate-300 hover:bg-white/10">⌂ Dashboard</button>
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
          <form className="mt-5 space-y-3" onSubmit={(event) => { event.preventDefault(); void run(() => createPlatformOrganization(orgForm), "Organization added."); }}>
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
          <form className="mt-5 space-y-3" onSubmit={(event) => { event.preventDefault(); void run(() => createSubscriptionPlan({ name: planForm.name, maxUsers: Number(planForm.maxUsers) || undefined, maxBranches: Number(planForm.maxBranches) || undefined, storageLimitGb: Number(planForm.storageLimitGb) || undefined, monthlyPrice: Number(planForm.monthlyPrice) || 0, annualPrice: Number(planForm.annualPrice) || undefined, aiAccess: planForm.aiAccess, apiAccess: planForm.apiAccess, includedModules: modules }), "Subscription plan created."); }}>
            <input required placeholder="Plan name" value={planForm.name} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} className="h-11 w-full rounded-lg border px-3 text-sm" />
            <div className="grid grid-cols-2 gap-3">{(["maxUsers", "maxBranches", "storageLimitGb", "monthlyPrice", "annualPrice"] as const).map((field) => <input key={field} type="number" min="0" placeholder={field.replace(/([A-Z])/g, " $1")} value={planForm[field]} onChange={(e) => setPlanForm({ ...planForm, [field]: e.target.value })} className="h-11 rounded-lg border px-3 text-sm" />)}</div>
            <label className="flex gap-2 text-sm"><input type="checkbox" checked={planForm.aiAccess} onChange={(e) => setPlanForm({ ...planForm, aiAccess: e.target.checked })} /> AI access</label>
            <label className="flex gap-2 text-sm"><input type="checkbox" checked={planForm.apiAccess} onChange={(e) => setPlanForm({ ...planForm, apiAccess: e.target.checked })} /> API access</label>
            <button disabled={busy} className="h-11 w-full rounded-lg bg-blue-600 font-semibold text-white">{busy ? "Saving..." : "Create plan"}</button>
          </form>
        </Modal>
      )}

      <main className="min-w-0 flex-1 p-4 md:p-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs text-slate-400">System Administration Platform <span className="mx-1">›</span> {tab}</p><h2 className="mt-1 text-2xl font-bold text-slate-950">{tab === "Organizations" ? "Organization Management" : tab}</h2><p className="mt-1 text-sm text-slate-500">Manage organizations, subscriptions, modules, permissions, billing, and platform-wide settings.</p></div>
          <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setModal("organization")} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">+ Add Organization</button><button type="button" onClick={() => setModal("plan")} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold">Create Subscription Plan</button><button type="button" onClick={() => router.refresh()} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold">Refresh</button></div>
        </div>
        {message && <button type="button" onClick={() => setMessage(null)} className="mb-4 w-full rounded-lg bg-blue-50 p-3 text-left text-sm text-blue-800">{message} ×</button>}

        {tab === "Overview" ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["Total Organizations", counts.total, "bg-blue-50"],
                ["Active Organizations", counts.active, "bg-emerald-50"],
                ["Trial Organizations", counts.trial, "bg-violet-50"],
                ["Suspended Organizations", counts.suspended, "bg-amber-50"],
                ["Total Users", totalUsers, "bg-cyan-50"],
                ["Monthly Revenue", monthlyRevenue.toLocaleString(undefined, { style: "currency", currency: "USD" }), "bg-indigo-50"],
                ["Annual Revenue", annualRevenue.toLocaleString(undefined, { style: "currency", currency: "USD" }), "bg-fuchsia-50"],
                ["Expiring in 30 Days", expiringSubscriptions, "bg-rose-50"],
              ].map(([label, value, color]) => <div key={String(label)} className={`rounded-xl border border-slate-200 ${color} p-4 shadow-sm`}><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-slate-950">{value}</p></div>)}
            </div>
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <Card title="Recent Signups"><div className="mt-3 divide-y">{organizations.slice(0, 6).map((org) => <div key={org.id} className="flex items-center justify-between py-3 text-sm"><span className="font-medium">{org.name}</span><span className="text-xs text-slate-500">{new Date(org.created_at).toLocaleDateString()}</span></div>)}</div></Card>
              <Card title="System Alerts"><div className="mt-3 space-y-3">{notifications.length ? notifications.map((notice) => <div key={notice.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3"><p className="text-sm font-semibold">{notice.title}</p><p className="mt-1 text-xs text-slate-500">{notice.message}</p></div>) : <p className="text-sm text-slate-500">No unread system alerts.</p>}</div></Card>
            </div>
          </>
        ) : tab === "Organizations" ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {[["Total Organizations", counts.total, "bg-blue-50"], ["Active Organizations", counts.active, "bg-emerald-50"], ["Trial Organizations", counts.trial, "bg-violet-50"], ["Suspended", counts.suspended, "bg-amber-50"], ["Expiring Subscriptions", expiringSubscriptions, "bg-rose-50"]].map(([label, value, color]) => <div key={String(label)} className={`rounded-xl border border-slate-200 ${color} p-4 shadow-sm`}><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-slate-950">{value}</p></div>)}
            </div>
            <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_290px]">
              <Card title="Organizations" className="overflow-hidden">
                <div className="mb-4 flex flex-wrap gap-2"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search organization name..." className="h-10 min-w-[220px] flex-1 rounded-lg border px-3 text-sm" /><select value={planFilter} onChange={(e) => setPlanFilter(e.target.value)} className="h-10 rounded-lg border px-3 text-xs"><option value="">All Plans</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-10 rounded-lg border px-3 text-xs"><option value="">All Status</option><option value="active">Active</option><option value="trial">Trial</option><option value="suspended">Suspended</option><option value="expired">Expired</option></select></div>
                <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-y bg-slate-50 text-[11px] uppercase text-slate-500"><tr>{["Organization", "Plan", "Users", "Branches", "Status", "Expiry Date", "Actions"].map((heading) => <th key={heading} className="px-3 py-3">{heading}</th>)}</tr></thead><tbody className="divide-y">{filteredOrganizations.map((org) => <tr key={org.id} onClick={() => setSelectedId(org.id)} className={`cursor-pointer hover:bg-blue-50 ${selected?.id === org.id ? "bg-blue-50/60" : ""}`}><td className="px-3 py-3"><p className="font-semibold">{org.name}</p><p className="text-[10px] text-slate-400">{org.organization_id}</p></td><td className="px-3 py-3">{plans.find((plan) => plan.id === org.plan_id)?.name ?? "—"}</td><td className="px-3 py-3">—</td><td className="px-3 py-3">—</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-[11px] ${org.status === "active" ? "bg-emerald-50 text-emerald-700" : org.status === "suspended" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{org.status}</span></td><td className="px-3 py-3">{org.expires_at ? new Date(org.expires_at).toLocaleDateString() : "—"}</td><td className="px-3 py-3"><button type="button" onClick={(event) => { event.stopPropagation(); void run(() => updatePlatformOrganization(org.id, { status: org.status === "suspended" ? "active" : "suspended" }), "Organization status updated."); }} className="rounded border px-2 py-1 text-[11px]">{org.status === "suspended" ? "Activate" : "Suspend"}</button><button type="button" onClick={(event) => { event.stopPropagation(); if (window.confirm(`Delete ${org.name}?`)) void run(() => deletePlatformOrganization(org.id), "Organization deleted."); }} className="ml-1 rounded border border-red-200 px-2 py-1 text-[11px] text-red-600">Delete</button></td></tr>)}</tbody></table>{filteredOrganizations.length === 0 && <p className="p-8 text-center text-sm text-slate-500">No organizations registered yet.</p>}</div>
                <p className="mt-3 text-[11px] text-slate-400">Showing {filteredOrganizations.length} of {organizations.length} organizations</p>
              </Card>
              <div className="space-y-5">
                <Card title="Organization Details">{selected ? <><div className="mt-4 flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 font-bold text-white">{selected.name.slice(0, 2).toUpperCase()}</div><div><p className="font-semibold">{selected.name}</p><p className="text-xs text-emerald-600">● {selected.status}</p></div></div><dl className="mt-4 space-y-3 text-xs"><div className="flex justify-between gap-3"><dt className="text-slate-500">Organization ID</dt><dd className="max-w-[150px] truncate font-medium" title={selected.organization_id}>{selected.organization_id}</dd></div><div className="flex justify-between"><dt className="text-slate-500">Plan</dt><dd>{plans.find((plan) => plan.id === selected.plan_id)?.name ?? "Not assigned"}</dd></div><div className="flex justify-between"><dt className="text-slate-500">Expiry</dt><dd>{selected.expires_at ? new Date(selected.expires_at).toLocaleDateString() : "Not set"}</dd></div></dl><div className="mt-5 grid grid-cols-2 gap-2"><button type="button" onClick={() => setTab("Activity Logs")} className="rounded-lg border px-2 py-2 text-xs">View activity</button><button type="button" onClick={() => setTab("Billing & Subscriptions")} className="rounded-lg bg-blue-600 px-2 py-2 text-xs font-semibold text-white">Manage subscription</button></div></> : <p className="mt-4 text-sm text-slate-500">Select an organization to view details.</p>}</Card>
                <Card title="Quick Actions">{[["Impersonate Organization", "Impersonation"], ["View Organization Details", "Organizations"], ["Manage Users", "Usage & Analytics"], ["Manage Branches", "Organizations"]].map(([item, target]) => <button type="button" key={item} onClick={() => setTab(target as Tab)} className="mt-2 flex w-full items-center justify-between rounded-lg border border-slate-100 p-3 text-left text-xs font-semibold hover:bg-slate-50">{item}<span>›</span></button>)}</Card>
              </div>
            </div>
            <div className="mt-5 grid gap-5 lg:grid-cols-3"><Card title="Feature Access"><p className="mt-2 text-xs text-slate-500">Choose enabled, disabled, or read-only access per organization.</p><div className="mt-3 grid gap-2 text-xs">{modules.map((module) => <label key={module} className="flex items-center justify-between gap-2 rounded border p-2"><span>{module}</span><select value={featureModes[module] ?? (featureState[module] ? "enabled" : "disabled")} onChange={(event) => { if (!selected) return; const accessMode = event.target.value as "enabled" | "disabled" | "read_only"; setFeatureModes((current) => ({ ...current, [module]: accessMode })); setFeatureState((current) => ({ ...current, [module]: accessMode !== "disabled" })); void run(() => setOrganizationFeatureAccess(selected.organization_id, module, accessMode), `${module} access updated.`); }} className="rounded border px-2 py-1"><option value="enabled">Enabled</option><option value="read_only">Read only</option><option value="disabled">Disabled</option></select></label>)}</div></Card><Card title="Subscription Plan"><p className="mt-3 text-lg font-bold">{selected ? plans.find((plan) => plan.id === selected.plan_id)?.name ?? "Not assigned" : "—"}</p><p className="mt-1 text-xs text-slate-500">Plan limits and included modules</p></Card><Card title="Recent Activity"><div className="mt-3 space-y-3 text-xs text-slate-500"><p>Organization actions are audited in Platform Supabase.</p><p>Use Activity Logs to review platform actions.</p></div></Card></div>
          </>
        ) : tab === "Subscription Plans" ? <Card title="Subscription Plans"><div className="mb-4 flex justify-end"><button type="button" onClick={() => setModal("plan")} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">Create plan</button></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{plans.map((plan) => <div key={plan.id} className="rounded-xl border p-4"><p className="font-semibold">{plan.name}</p><p className="mt-2 text-2xl font-bold">${Number(plan.monthly_price).toLocaleString()}<span className="text-xs font-normal text-slate-500">/month</span></p><p className="text-xs text-slate-500">{plan.annual_price ? `$${Number(plan.annual_price).toLocaleString()}/year` : "Annual price not set"}</p><p className="mt-3 text-xs text-slate-500">{plan.max_users ?? "Unlimited"} users · {plan.max_branches ?? "Unlimited"} branches · {plan.storage_limit_gb ?? "Unlimited"} GB</p><button type="button" onClick={() => void run(() => archiveSubscriptionPlan(plan.id), `${plan.name} archived.`)} className="mt-3 rounded border border-red-200 px-2 py-1 text-xs text-red-600">Archive</button></div>)}</div></Card>         : tab === "Feature Flags" ? <Card title="Feature Flags"><div className="divide-y">{flags.map((flag) => <div key={flag.id} className="flex items-center justify-between gap-4 py-4"><div><p className="font-semibold">{flag.name}</p><p className="text-xs text-slate-500">{flag.description}</p></div><button type="button" onClick={() => void run(() => setFeatureFlag(flag.id, !flag.enabled), `${flag.name} updated.`)} className={`rounded-full px-2 py-1 text-xs font-semibold ${flag.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{flag.enabled ? "Enabled" : "Disabled"} · {flag.scope}</button></div>)}</div>{flags.length === 0 && <p className="mt-3 text-sm text-slate-500">No feature flags configured.</p>}</Card> : tab === "Usage & Analytics" ? <Card title="Usage & Analytics"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Transactions", usage.reduce((sum, item) => sum + Number(item.orders || 0), 0)], ["Sales Volume", usage.reduce((sum, item) => sum + Number(item.sales_volume || 0), 0).toLocaleString()], ["Active Users", totalUsers], ["Storage Used (GB)", usage.reduce((sum, item) => sum + Number(item.storage_used_gb || 0), 0).toLocaleString()]].map(([label, value]) => <div key={String(label)} className="rounded-lg border bg-slate-50 p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></div>)}</div><div className="mt-5 divide-y">{usage.map((item) => <div key={item.organization_id} className="flex justify-between py-3 text-sm"><span>{organizations.find((org) => org.organization_id === item.organization_id)?.name ?? item.organization_id}</span><span className="text-xs text-slate-500">{item.active_users} users · {item.orders} transactions</span></div>)}</div></Card> : tab === "Billing & Subscriptions" ? <Card title="Billing & Subscriptions"><div className="grid gap-3 sm:grid-cols-3"><div className="rounded-lg bg-emerald-50 p-4"><p className="text-xs text-slate-500">Paid</p><p className="mt-2 text-2xl font-bold">{billing.filter((item) => item.status === "paid").length}</p></div><div className="rounded-lg bg-amber-50 p-4"><p className="text-xs text-slate-500">Outstanding</p><p className="mt-2 text-2xl font-bold">{billing.filter((item) => item.status === "outstanding").length}</p></div><div className="rounded-lg bg-blue-50 p-4"><p className="text-xs text-slate-500">Revenue</p><p className="mt-2 text-2xl font-bold">{billing.reduce((sum, item) => sum + Number(item.amount || 0), 0).toLocaleString()}</p></div></div><div className="mt-5 divide-y">{billing.map((item) => <div key={item.id} className="flex justify-between py-3 text-sm"><span>{item.invoice_number}</span><span>{Number(item.amount).toLocaleString()} · {item.status}</span></div>)}</div></Card>         : tab === "Activity Logs" || tab === "Audit Logs" ? <Card title={tab}><p className="mt-2 text-xs text-slate-500">Recorded platform actions, including logins, organization changes, plan changes, and feature access updates.</p><div className="mt-4 grid gap-2 md:grid-cols-4"><input type="date" value={activityDateFilter} onChange={(event) => setActivityDateFilter(event.target.value)} className="h-9 rounded border px-2 text-xs" /><select value={activityOrganizationFilter} onChange={(event) => setActivityOrganizationFilter(event.target.value)} className="h-9 rounded border px-2 text-xs"><option value="">All organizations</option>{organizations.map((org) => <option key={org.organization_id} value={org.organization_id}>{org.name}</option>)}</select><select value={activityModuleFilter} onChange={(event) => setActivityModuleFilter(event.target.value)} className="h-9 rounded border px-2 text-xs"><option value="">All modules</option>{Array.from(new Set(auditLogs.map((log) => log.module))).sort().map((module) => <option key={module} value={module}>{module}</option>)}</select><select value={activityActionFilter} onChange={(event) => setActivityActionFilter(event.target.value)} className="h-9 rounded border px-2 text-xs"><option value="">All actions</option>{Array.from(new Set(auditLogs.map((log) => log.action))).sort().map((action) => <option key={action} value={action}>{action.replaceAll("_", " ")}</option>)}</select></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="border-y bg-slate-50 text-[11px] uppercase text-slate-500"><tr>{["Time", "Action", "Module", "Organization", "Details"].map((heading) => <th key={heading} className="px-3 py-3">{heading}</th>)}</tr></thead><tbody className="divide-y">{filteredAuditLogs.map((log) => <tr key={log.id} className="hover:bg-slate-50"><td className="whitespace-nowrap px-3 py-3 text-xs text-slate-500">{new Date(log.created_at).toLocaleString()}</td><td className="px-3 py-3 font-semibold">{log.action.replaceAll("_", " ")}</td><td className="px-3 py-3 text-xs text-slate-500">{log.module}</td><td className="px-3 py-3 text-xs">{organizations.find((org) => org.organization_id === log.organization_id)?.name ?? (log.organization_id ?? "Platform-wide")}</td><td className="max-w-[280px] truncate px-3 py-3 text-xs text-slate-500" title={JSON.stringify(log.metadata)}>{Object.entries(log.metadata).map(([key, value]) => `${key}: ${String(value)}`).join(" · ") || "—"}</td></tr>)}</tbody></table>{filteredAuditLogs.length === 0 && <p className="p-8 text-center text-sm text-slate-500">No activity matches the selected filters.</p>}</div></Card>         : tab === "Organization Builder" ? <Card title="Organization Builder"><p className="text-sm text-slate-500">Provision the organization registry record, subscription, and default feature access.</p><button type="button" onClick={() => setModal("organization")} className="mt-4 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">Start Builder</button></Card> : tab === "Impersonation" ? <Card title="Impersonation"><p className="text-sm text-slate-500">Impersonation requires an active organization administrator target and a recorded security approval.</p><div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">No impersonation session can be started until the secure target-user workflow is configured.</div></Card> : tab === "System Settings" ? <Card title="System Settings"><div className="space-y-3">{["platform_branding", "email_provider", "sms_provider", "whatsapp_provider", "notification_settings", "security_settings", "api_settings", "storage_settings"].map((key) => <div key={key} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center"><label className="w-48 text-xs font-semibold capitalize">{key.replaceAll("_", " ")}</label><input value={settingsForm[key] ?? ""} onChange={(event) => setSettingsForm((current) => ({ ...current, [key]: event.target.value }))} className="h-9 flex-1 rounded border px-2 text-xs" placeholder="JSON configuration" /><button type="button" onClick={() => { let value: Record<string, unknown>; try { value = JSON.parse(settingsForm[key] || "{}") as Record<string, unknown>; } catch { setMessage(`${key} must contain valid JSON.`); return; } void run(() => updatePlatformSetting(key, value), `${key} saved.`); }} className="rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white">Save</button></div>)}</div></Card> : <Card title={tab}><p className="mt-3 text-sm text-slate-500">Approval workflow records.</p><div className="mt-4 divide-y">{approvals.map((approval) => <div key={approval.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><span>{approval.approval_type.replaceAll("_", " ")}</span><span className="text-xs text-slate-500">{approval.status}</span>{approval.status === "pending" && <div className="flex gap-2"><button type="button" onClick={() => void run(() => reviewPlatformApproval(approval.id, "approved"), "Approval approved.")} className="rounded bg-emerald-600 px-2 py-1 text-xs text-white">Approve</button><button type="button" onClick={() => void run(() => reviewPlatformApproval(approval.id, "rejected"), "Approval rejected.")} className="rounded bg-rose-600 px-2 py-1 text-xs text-white">Reject</button></div>}</div>)}</div></Card>}
      </main>
    </div>
  );
}
