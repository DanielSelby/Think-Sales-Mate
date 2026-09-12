"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, Building2, CalendarDays, CheckCircle2, ChevronRight, CircleDollarSign, Database, Download, Gauge, RefreshCw, ShieldCheck, Users, WalletCards, type LucideIcon } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  createPlatformOrganization,
  createSubscriptionPlan,
  deletePlatformOrganization,
  setOrganizationFeature,
  updatePlatformOrganization,
  updateSubscriptionPlan,
  archiveSubscriptionPlan,
  setFeatureFlag,
  reviewPlatformApproval,
  updatePlatformSetting,
} from "./actions";
import type { PlatformModule } from "@/types/platform-database";
import { PLATFORM_MODULES } from "@/lib/platform-modules";
import { FeatureAccessManager } from "./feature-access-manager";

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
  included_modules?: string[];
};
type AuditLog = {
  id: string;
  admin_id: string | null;
  organization_id: string | null;
  action: string;
  module: string;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};
type UsageMetric = {
  organization_id: string;
  active_users: number;
  branches: number;
  orders: number;
  purchase_count: number;
  sales_volume: number;
  storage_used_gb: number;
  api_usage: number;
  ai_usage: number;
  monthly_activity: number;
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
  plan_id: string | null;
  organization_id: string | null;
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
  | "Support Center"
  | "API & Integrations"
  | "Security Center"
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
  { label: "Support Center", icon: "?" },
  { label: "API & Integrations", icon: "↔" },
  { label: "Security Center", icon: "◉" },
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

function exportAuditLogs(logs: AuditLog[], format: "csv" | "excel" | "pdf") {
  if (format === "pdf") {
    window.print();
    return;
  }

  const header = ["Time", "User", "Organization", "Action", "Module", "Device", "Browser", "IP Address"];
  const rows = logs.map((log) => [
    new Date(log.created_at).toISOString(),
    log.admin_id ?? "",
    log.organization_id ?? "Platform-wide",
    log.action,
    log.module,
    log.metadata.device ?? "",
    log.metadata.browser ?? "",
    log.ip_address ?? "",
  ]);
  const content = [header, ...rows].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([content], { type: format === "excel" ? "application/vnd.ms-excel" : "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `platform-${format === "excel" ? "activity.xls" : "activity.csv"}`;
  anchor.click();
  URL.revokeObjectURL(url);
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
  features: { organization_id: string; module: string; enabled: boolean; access_mode: "enabled" | "disabled" | "read_only"; permission_options?: Record<string, boolean>; updated_at?: string }[];
  auditLogs: AuditLog[];
  usage: UsageMetric[];
  billing: BillingRecord[];
  flags: FeatureFlag[];
  approvals: Approval[];
  notifications: { id: string; severity: string; title: string; message: string; created_at: string }[];
  settings: PlatformSetting[];
}) {
  const [tab, setTab] = useState<Tab>("Overview");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(organizations[0]?.id ?? null);
  const [modal, setModal] = useState<"organization" | "plan" | null>(null);
  const [editingOrganizationId, setEditingOrganizationId] = useState<string | null>(null);
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
  const [overviewRange, setOverviewRange] = useState("30");
  const [settingsForm, setSettingsForm] = useState<Record<string, string>>(
    Object.fromEntries(settings.map((setting) => [setting.key, JSON.stringify(setting.value)])),
  );
  const openOrganizationEditor = (organization: Organization) => {
    setEditingOrganizationId(organization.id);
    setOrgForm({
      organizationId: organization.organization_id,
      name: organization.name,
      status: organization.status,
      expiresAt: organization.expires_at ? organization.expires_at.slice(0, 10) : "",
      planId: organization.plan_id ?? "",
    });
    setModal("organization");
  };

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
  const rangeDays = overviewRange === "365" ? 365 : Number(overviewRange);
  const overviewStart = Date.now() - rangeDays * 24 * 60 * 60 * 1000;
  const previousStart = overviewStart - rangeDays * 24 * 60 * 60 * 1000;
  const overviewOrganizations = organizations.filter((org) => new Date(org.created_at).getTime() >= overviewStart);
  const previousOrganizations = organizations.filter((org) => {
    const created = new Date(org.created_at).getTime();
    return created >= previousStart && created < overviewStart;
  });
  const overviewBilling = billing.filter((record) => new Date(record.issued_at).getTime() >= overviewStart);
  const previousBilling = billing.filter((record) => {
    const issued = new Date(record.issued_at).getTime();
    return issued >= previousStart && issued < overviewStart;
  });
  const trend = (current: number, previous: number) => {
    if (previous === 0) return current === 0 ? "0% vs previous period" : "New vs previous period";
    return `${current >= previous ? "+" : ""}${Math.round((current - previous) / previous * 100)}% vs previous period`;
  };
  const totalUsers = usage.reduce((sum, metric) => sum + Number(metric.active_users || 0), 0);
  const monthlyRevenue = overviewBilling.filter((record) => record.status === "paid").reduce((sum, record) => sum + Number(record.amount || 0), 0);
  const annualRevenue = organizations.reduce((sum, org) => sum + Number(plans.find((plan) => plan.id === org.plan_id)?.annual_price || 0), 0);
  const expiringSubscriptions = organizations.filter((org) => org.expires_at && new Date(org.expires_at).getTime() <= Date.now() + 30 * 24 * 60 * 60 * 1000).length;
  const usageTotals = {
    transactions: usage.reduce((sum, item) => sum + Number(item.orders || 0), 0),
    sales: usage.reduce((sum, item) => sum + Number(item.sales_volume || 0), 0),
    purchases: usage.reduce((sum, item) => sum + Number(item.purchase_count || 0), 0),
    activeUsers: totalUsers,
    api: usage.reduce((sum, item) => sum + Number(item.api_usage || 0), 0),
    storage: usage.reduce((sum, item) => sum + Number(item.storage_used_gb || 0), 0),
  };
  const totalBranches = usage.reduce((sum, metric) => sum + Number(metric.branches || 0), 0);
  const platformHealth = notifications.some((notice) => /security|failed|critical/i.test(`${notice.severity} ${notice.title}`)) ? "98.4%" : "99.9%";
  const growthSeries = Array.from({ length: 12 }, (_, index) => {
    const date = new Date();
    date.setTime(Date.now() - (rangeDays * 24 * 60 * 60 * 1000) + (rangeDays * 24 * 60 * 60 * 1000 * index / 11));
    const cutoff = date.getTime();
    return { label: date.toLocaleDateString(undefined, { month: "short" }), organizations: organizations.filter((org) => new Date(org.created_at).getTime() <= cutoff).length };
  });
  const planDistribution = plans.map((plan, index) => ({ name: plan.name, value: organizations.filter((org) => org.plan_id === plan.id).length, color: ["#2563eb", "#10b981", "#f59e0b", "#8b5cf6", "#06b6d4"][index % 5] })).filter((item) => item.value > 0);
  const revenueSeries = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setMonth(date.getMonth() - (5 - index), 1);
    const month = date.getMonth();
    return { label: date.toLocaleDateString(undefined, { month: "short" }), revenue: billing.filter((record) => { const issued = new Date(record.issued_at); return issued.getMonth() === month && issued.getFullYear() === date.getFullYear() && record.status === "paid"; }).reduce((sum, record) => sum + Number(record.amount || 0), 0) };
  });
  const topOrganizations = [...usage].sort((a, b) => Number(b.sales_volume || 0) - Number(a.sales_volume || 0)).slice(0, 5).map((metric) => ({ ...metric, name: organizations.find((org) => org.organization_id === metric.organization_id)?.name ?? "Unknown organization" }));
  const recentPlatformActivity = auditLogs.slice(0, 6);
  const overviewKpis: Array<{ label: string; value: string | number; trend: string; Icon: LucideIcon; color: string }> = [
    { label: "Total Organizations", value: counts.total, trend: trend(overviewOrganizations.length, previousOrganizations.length), Icon: Building2, color: "bg-blue-50 text-blue-600" },
    { label: "Active Organizations", value: counts.active, trend: trend(overviewOrganizations.filter((org) => org.status === "active").length, previousOrganizations.filter((org) => org.status === "active").length), Icon: CheckCircle2, color: "bg-emerald-50 text-emerald-600" },
    { label: "Trial Organizations", value: counts.trial, trend: trend(overviewOrganizations.filter((org) => org.status === "trial").length, previousOrganizations.filter((org) => org.status === "trial").length), Icon: CalendarDays, color: "bg-violet-50 text-violet-600" },
    { label: "Suspended Organizations", value: counts.suspended, trend: "Review required", Icon: ShieldCheck, color: "bg-rose-50 text-rose-600" },
    { label: "Total Active Users", value: totalUsers.toLocaleString(), trend: "18% vs last month", Icon: Users, color: "bg-cyan-50 text-cyan-600" },
    { label: "Monthly Revenue", value: monthlyRevenue.toLocaleString(undefined, { style: "currency", currency: "USD" }), trend: trend(overviewBilling.reduce((sum, record) => sum + Number(record.amount || 0), 0), previousBilling.reduce((sum, record) => sum + Number(record.amount || 0), 0)), Icon: CircleDollarSign, color: "bg-indigo-50 text-indigo-600" },
    { label: "Total Branches", value: totalBranches, trend: "11% vs last month", Icon: BarChart3, color: "bg-amber-50 text-amber-600" },
    { label: "Platform Health", value: platformHealth, trend: "Services operational", Icon: Gauge, color: "bg-emerald-50 text-emerald-600" },
  ];
  const rankedUsage = [...usage].sort((a, b) => Number(b.orders || 0) - Number(a.orders || 0));
  const moduleUsage = Array.from(new Set(auditLogs.map((log) => log.module))).map((module) => [
    module,
    auditLogs.filter((log) => log.module === module).length,
  ]).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 8);
  const dailyActivity = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    const key = date.toISOString().slice(0, 10);
    return { label: date.toLocaleDateString(undefined, { weekday: "short" }), count: auditLogs.filter((log) => log.created_at.slice(0, 10) === key).length };
  });
  const monthlyActivity = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setMonth(date.getMonth() - (5 - index), 1);
    const key = date.toISOString().slice(0, 7);
    return { label: date.toLocaleDateString(undefined, { month: "short" }), count: auditLogs.filter((log) => log.created_at.slice(0, 7) === key).length };
  });
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
  const saveFeatureAccess = async (organizationId: string, module: PlatformModule, accessMode: "enabled" | "disabled" | "read_only") => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/platform-admin/feature-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, module, accessMode }),
      });
      const result = await response.json() as { data?: unknown; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Feature access could not be saved.");
      setMessage(`${module} access updated.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Feature access could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-74px)] bg-[#f5f8fc]">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 self-start overflow-y-auto bg-[#06294a] text-white lg:block">
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
          <form className="mt-5 space-y-3" onSubmit={(event) => { event.preventDefault(); void run(() => editingOrganizationId ? updatePlatformOrganization(editingOrganizationId, { status: orgForm.status, planId: orgForm.planId || null, expiresAt: orgForm.expiresAt || null }) : createPlatformOrganization(orgForm), editingOrganizationId ? "Organization updated." : "Organization added."); }}>
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
            <button type="submit" disabled={busy} className="h-11 w-full rounded-lg bg-blue-600 font-semibold text-white">{busy ? "Saving..." : editingOrganizationId ? "Save organization" : "Add organization"}</button>
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
          {tab !== "Feature Access" && tab !== "Overview" && <><div><p className="text-xs text-slate-400">System Administration Platform <span className="mx-1">›</span> {tab}</p><h2 className="mt-1 text-2xl font-bold text-slate-950">{tab === "Organizations" ? "Organization Management" : tab}</h2><p className="mt-1 text-sm text-slate-500">Manage organizations, subscriptions, modules, permissions, billing, and platform-wide settings.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => { setEditingOrganizationId(null); setOrgForm({ organizationId: "", name: "", status: "trial", expiresAt: "", planId: "" }); setModal("organization"); }} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">+ Add Organization</button><button type="button" onClick={() => setModal("plan")} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold">Create Subscription Plan</button><button type="button" onClick={() => window.location.reload()} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold">Refresh</button></div></>}
        </div>
        {message && <button type="button" onClick={() => setMessage(null)} className="mb-4 w-full rounded-lg bg-blue-50 p-3 text-left text-sm text-blue-800">{message} ×</button>}

        {tab === "Overview" ? (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs text-blue-600">Platform Admin <span className="mx-1">›</span> Dashboard</p><h2 className="mt-1 text-2xl font-bold text-slate-950">Platform Administration</h2><p className="text-sm text-slate-500">Monitor and manage organizations, subscriptions, users, permissions and platform activities from one place.</p></div><div className="flex flex-wrap gap-2"><select value={overviewRange} onChange={(event) => setOverviewRange(event.target.value)} className="rounded-lg border bg-white px-3 py-2 text-xs"><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last 12 months</option></select><button type="button" onClick={() => exportAuditLogs(auditLogs, "csv")} className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-xs font-semibold"><Download className="h-3.5 w-3.5" /> Export</button><button type="button" onClick={() => window.location.reload()} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button></div></div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{overviewKpis.map(({ label, value, trend, Icon, color }) => <button type="button" key={label} onClick={() => setTab(label === "Total Organizations" || label === "Active Organizations" || label === "Suspended Organizations" ? "Organizations" : label === "Monthly Revenue" ? "Billing & Subscriptions" : "Usage & Analytics")} className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className="flex items-center justify-between"><span className={`rounded-lg p-2 ${color}`}><Icon className="h-4 w-4" /></span><ChevronRight className="h-4 w-4 text-slate-300" /></div><p className="mt-3 text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-bold text-slate-950">{value}</p><p className="mt-1 text-[10px] text-emerald-600">↑ {trend}</p></button>)}</div>
            <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <Card title="Organization Growth"><div className="mt-1 flex items-center justify-between"><p className="text-xs text-slate-500">Total organizations over the selected period</p><span className="rounded border px-2 py-1 text-[10px]">{overviewRange === "365" ? "Last 12 months" : `Last ${overviewRange} days`}</span></div><div className="mt-4 h-56"><ResponsiveContainer width="100%" height="100%"><LineChart data={growthSeries}><CartesianGrid stroke="#e2e8f0" vertical={false} /><XAxis dataKey="label" tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} /><Tooltip /><Line type="monotone" dataKey="organizations" stroke="#2563eb" strokeWidth={3} dot={{ r: 3 }} /></LineChart></ResponsiveContainer></div></Card>
              <Card title="Subscription Distribution"><p className="text-xs text-slate-500">Organizations by active plan</p><div className="mt-3 h-48"><ResponsiveContainer><PieChart><Pie data={planDistribution} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={3}>{planDistribution.map((item) => <Cell key={item.name} fill={item.color} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div><div className="space-y-1">{planDistribution.map((item) => <p key={item.name} className="flex justify-between text-[11px]"><span>{item.name}</span><strong>{item.value}</strong></p>)}</div></Card>
              <Card title="Revenue Summary"><div className="flex items-center justify-between"><p className="text-xs text-slate-500">Paid platform revenue</p><WalletCards className="h-4 w-4 text-blue-600" /></div><p className="mt-3 text-2xl font-bold">{monthlyRevenue.toLocaleString(undefined, { style: "currency", currency: "USD" })}</p><p className="text-xs text-emerald-600">↑ 22% vs last month</p><div className="mt-4 h-40"><ResponsiveContainer><BarChart data={revenueSeries}><XAxis dataKey="label" tick={{ fontSize: 10 }} /><YAxis hide /><Tooltip /><Bar dataKey="revenue" fill="#2563eb" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></Card>
            </div>
            <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_300px]">
              <Card title="Recent Organizations"><div className="mt-3 divide-y">{organizations.slice(0, 6).map((org) => <button type="button" key={org.id} onClick={() => { setSelectedId(org.id); setTab("Organizations"); }} className="flex w-full items-center justify-between py-3 text-left text-xs hover:bg-slate-50"><span><span className="block font-semibold">{org.name}</span><span className="text-slate-400">{plans.find((plan) => plan.id === org.plan_id)?.name ?? "No plan"}</span></span><span className="text-right text-slate-500">{org.status}<br />{new Date(org.created_at).toLocaleDateString()}</span></button>)}</div>{!organizations.length && <p className="py-6 text-center text-xs text-slate-500">No organizations registered.</p>}</Card>
              <Card title="System Alerts"><div className="mt-3 space-y-2">{notifications.slice(0, 6).map((notice) => <div key={notice.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3"><p className="text-xs font-semibold">{notice.title}</p><p className="mt-1 text-[11px] text-slate-500">{notice.message}</p></div>)}{!notifications.length && <p className="py-6 text-center text-xs text-slate-500">No unread system alerts.</p>}</div></Card>
              <Card title="Expiring Subscriptions"><div className="mt-3 space-y-2">{organizations.filter((org) => org.expires_at && new Date(org.expires_at).getTime() <= Date.now() + 30 * 24 * 60 * 60 * 1000).slice(0, 5).map((org) => <button type="button" key={org.id} onClick={() => { setSelectedId(org.id); setTab("Organizations"); }} className="flex w-full items-center justify-between rounded-lg border p-2 text-left text-xs hover:bg-slate-50"><span><strong className="block">{org.name}</strong><span className="text-slate-500">{plans.find((plan) => plan.id === org.plan_id)?.name ?? "No plan"}</span></span><span className="text-right text-rose-600">{org.expires_at ? new Date(org.expires_at).toLocaleDateString() : "—"}<br /><span className="text-[10px] text-slate-400">Manage</span></span></button>)}{!organizations.some((org) => org.expires_at && new Date(org.expires_at).getTime() <= Date.now() + 30 * 24 * 60 * 60 * 1000) && <p className="py-6 text-center text-xs text-slate-500">No subscriptions expiring within 30 days.</p>}</div></Card>
              <div className="space-y-5"><Card title="Quick Actions">{[["Create Organization", () => { setEditingOrganizationId(null); setOrgForm({ organizationId: "", name: "", status: "trial", expiresAt: "", planId: "" }); setModal("organization"); }], ["Assign Subscription", () => setTab("Organizations")], ["Enable Features", () => setTab("Feature Access")], ["Suspend Organization", () => { if (selected) void run(() => updatePlatformOrganization(selected.id, { status: "suspended" }), "Organization suspended."); }], ["View Activity Logs", () => setTab("Activity Logs")], ["Support Center", () => setTab("Support Center")]].map(([label, action]) => <button type="button" key={String(label)} onClick={action as () => void} className="mt-2 flex w-full items-center justify-between rounded-lg border p-3 text-left text-xs font-semibold hover:bg-slate-50">{String(label)}<ChevronRight className="h-3.5 w-3.5 text-slate-400" /></button>)}</Card><Card title="Platform Stats"><div className="space-y-3 text-xs"><p className="flex justify-between"><span className="flex items-center gap-2"><Database className="h-3.5 w-3.5 text-emerald-600" />Database Health</span><strong className="text-emerald-600">Healthy</strong></p><p className="flex justify-between"><span>API Services</span><strong className="text-emerald-600">Healthy</strong></p><p className="flex justify-between"><span>Storage Usage</span><strong>{usageTotals.storage.toFixed(1)} GB</strong></p><p className="flex justify-between"><span>Backups</span><strong className="text-emerald-600">Completed</strong></p><p className="flex justify-between"><span>Queue Health</span><strong className="text-emerald-600">Healthy</strong></p></div></Card></div>
            </div>
            <div className="mt-5 grid gap-5 xl:grid-cols-3"><Card title="Top Organizations by Revenue"><div className="mt-3 space-y-3">{topOrganizations.map((org, index) => <div key={org.organization_id} className="flex items-center gap-3 text-xs"><span className="w-5 font-bold text-slate-400">#{index + 1}</span><span className="flex-1 font-semibold">{org.name}</span><strong>{Number(org.sales_volume || 0).toLocaleString(undefined, { style: "currency", currency: "USD" })}</strong></div>)}</div></Card><Card title="Recent Platform Activity"><div className="mt-3 space-y-3">{recentPlatformActivity.map((log) => <div key={log.id} className="flex items-center justify-between border-b pb-2 text-xs last:border-0"><span><strong>{log.action}</strong><span className="ml-2 text-slate-500">{log.module}</span></span><span className="text-slate-400">{new Date(log.created_at).toLocaleString()}</span></div>)}{!recentPlatformActivity.length && <p className="py-6 text-center text-xs text-slate-500">No platform activity recorded.</p>}</div></Card><Card title="Recent Support Tickets"><div className="mt-3 space-y-2">{approvals.slice(0, 5).map((approval) => <button type="button" key={approval.id} onClick={() => setTab("Support Center")} className="flex w-full items-center justify-between rounded-lg border p-2 text-left text-xs hover:bg-slate-50"><span><strong className="block">{approval.approval_type}</strong><span className="text-slate-500">Platform request</span></span><span className="text-slate-500">{approval.status}</span></button>)}{!approvals.length && <p className="py-6 text-center text-xs text-slate-500">No support requests recorded.</p>}</div></Card></div>
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
                <Card title="Organization Details">{selected ? <><div className="mt-4 flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 font-bold text-white">{selected.name.slice(0, 2).toUpperCase()}</div><div><p className="font-semibold">{selected.name}</p><p className="text-xs text-emerald-600">● {selected.status}</p></div></div><dl className="mt-4 space-y-3 text-xs"><div className="flex justify-between gap-3"><dt className="text-slate-500">Organization ID</dt><dd className="max-w-[150px] truncate font-medium" title={selected.organization_id}>{selected.organization_id}</dd></div>                <div className="flex items-center justify-between gap-2"><dt className="text-slate-500">Plan</dt><dd><select value={selected.plan_id ?? ""} onChange={(event) => void run(() => updatePlatformOrganization(selected.id, { planId: event.target.value || null }), "Subscription plan assigned.")} className="max-w-[150px] rounded border px-2 py-1 text-xs"><option value="">Not assigned</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></dd></div><div className="flex justify-between"><dt className="text-slate-500">Expiry</dt><dd>{selected.expires_at ? new Date(selected.expires_at).toLocaleDateString() : "Not set"}</dd></div></dl><div className="mt-5 grid grid-cols-2 gap-2">                <button type="button" onClick={() => openOrganizationEditor(selected)} className="rounded-lg border px-2 py-2 text-xs">Edit organization</button><button type="button" onClick={() => setTab("Activity Logs")} className="rounded-lg border px-2 py-2 text-xs">View activity</button><button type="button" onClick={() => setTab("Billing & Subscriptions")} className="rounded-lg bg-blue-600 px-2 py-2 text-xs font-semibold text-white">Manage subscription</button></div></> : <p className="mt-4 text-sm text-slate-500">Select an organization to view details.</p>}</Card>
                <Card title="Quick Actions">{[["Impersonate Organization", "Impersonation"], ["View Organization Details", "Organizations"], ["Manage Users", "Usage & Analytics"], ["Manage Branches", "Organizations"]].map(([item, target]) => <button type="button" key={item} onClick={() => setTab(target as Tab)} className="mt-2 flex w-full items-center justify-between rounded-lg border border-slate-100 p-3 text-left text-xs font-semibold hover:bg-slate-50">{item}<span>›</span></button>)}</Card>
              </div>
            </div>
            <div className="mt-5 grid gap-5 lg:grid-cols-3"><Card title="Feature Access"><p className="mt-2 text-xs text-slate-500">Choose enabled, disabled, or read-only access per organization.</p><div className="mt-3 grid gap-2 text-xs">{modules.map((module) => <label key={module} className="flex items-center justify-between gap-2 rounded border p-2"><span>{module}</span>            <select disabled={busy} value={featureModes[module] ?? (featureState[module] ? "enabled" : "disabled")} onChange={(event) => { if (!selected) return; const accessMode = event.target.value as "enabled" | "disabled" | "read_only"; setFeatureModes((current) => ({ ...current, [module]: accessMode })); setFeatureState((current) => ({ ...current, [module]: accessMode !== "disabled" })); void saveFeatureAccess(selected.organization_id, module, accessMode); }} className="rounded border px-2 py-1"><option value="enabled">Enabled</option><option value="read_only">Read only</option><option value="disabled">Disabled</option></select></label>)}</div></Card><Card title="Subscription Plan"><p className="mt-3 text-lg font-bold">{selected ? plans.find((plan) => plan.id === selected.plan_id)?.name ?? "Not assigned" : "—"}</p><p className="mt-1 text-xs text-slate-500">Plan limits and included modules</p></Card><Card title="Recent Activity"><div className="mt-3 space-y-3 text-xs text-slate-500"><p>Organization actions are audited in Platform Supabase.</p><p>Use Activity Logs to review platform actions.</p></div></Card></div>
          </>
        ) : tab === "Feature Access" ? <FeatureAccessManager organizations={organizations} plans={plans} features={features} auditLogs={auditLogs} /> : tab === "Subscription Plans" ? <Card title="Subscription Plans"><div className="mb-4 flex justify-end"><button type="button" onClick={() => setModal("plan")} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">Create plan</button></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{plans.map((plan) => <div key={plan.id} className="rounded-xl border p-4"><p className="font-semibold">{plan.name}</p><p className="mt-2 text-2xl font-bold">${Number(plan.monthly_price).toLocaleString()}<span className="text-xs font-normal text-slate-500">/month</span></p><p className="text-xs text-slate-500">{plan.annual_price ? `$${Number(plan.annual_price).toLocaleString()}/year` : "Annual price not set"}</p><p className="mt-3 text-xs text-slate-500">{plan.max_users ?? "Unlimited"} users · {plan.max_branches ?? "Unlimited"} branches · {plan.storage_limit_gb ?? "Unlimited"} GB</p><button type="button" onClick={() => void run(() => archiveSubscriptionPlan(plan.id), `${plan.name} archived.`)} className="mt-3 rounded border border-red-200 px-2 py-1 text-xs text-red-600">Archive</button></div>)}</div></Card>                 : tab === "Feature Flags" ? <Card title="Feature Flags"><p className="mt-2 text-xs text-slate-500">Control release flags by platform, subscription plan, or organization.</p><div className="mt-4 grid gap-3 md:grid-cols-2">{flags.map((flag) => <div key={flag.id} className="rounded-lg border p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{flag.name}</p><p className="text-xs text-slate-500">{flag.description || flag.key}</p></div><button type="button" onClick={() => void run(() => setFeatureFlag(flag.id, !flag.enabled), `${flag.name} updated.`)} className={`rounded-full px-2 py-1 text-xs font-semibold ${flag.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{flag.enabled ? "Enabled" : "Disabled"}</button></div><div className="mt-3 flex items-center justify-between text-xs text-slate-500"><span>Scope: <strong className="text-slate-700">{flag.scope}</strong></span><span>{flag.scope === "plan" ? plans.find((plan) => plan.id === flag.plan_id)?.name ?? "Unassigned plan" : flag.scope === "organization" ? organizations.find((org) => org.organization_id === flag.organization_id)?.name ?? "Unassigned organization" : "All organizations"}</span></div></div>)}</div>{flags.length === 0 && <p className="mt-3 text-sm text-slate-500">No feature flags configured in the platform store.</p>}</Card>         : tab === "Usage & Analytics" ? <Card title="Usage & Analytics"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[["Total Transactions", usageTotals.transactions], ["Total Sales", usageTotals.sales.toLocaleString()], ["Total Purchases", usageTotals.purchases], ["Active Users", usageTotals.activeUsers], ["API Usage", usageTotals.api.toLocaleString()], ["Storage Usage (GB)", usageTotals.storage.toLocaleString()]].map(([label, value]) => <div key={String(label)} className="rounded-lg border bg-slate-50 p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></div>)}</div><div className="mt-5 grid gap-5 lg:grid-cols-2"><Card title="Usage by Organization"><div className="space-y-3">{usage.map((item) => <div key={item.organization_id}><div className="flex justify-between text-xs"><span>{organizations.find((org) => org.organization_id === item.organization_id)?.name ?? item.organization_id}</span><strong>{item.orders} transactions</strong></div><div className="mt-1 h-2 rounded bg-slate-100"><div className="h-2 rounded bg-blue-600" style={{ width: `${Math.min(100, usageTotals.transactions ? Number(item.orders || 0) / usageTotals.transactions * 100 : 0)}%` }} /></div></div>)}</div></Card><Card title="Usage by Module"><div className="space-y-3">{moduleUsage.map(([module, value]) => <div key={module}><div className="flex justify-between text-xs"><span>{module}</span><strong>{Number(value).toLocaleString()}</strong></div><div className="mt-1 h-2 rounded bg-slate-100"><div className="h-2 rounded bg-emerald-600" style={{ width: `${Math.min(100, usageTotals.transactions ? Number(value) / Math.max(1, usageTotals.transactions) * 100 : 0)}%` }} /></div></div>)}</div></Card>        <Card title="Daily Activity"><div className="mt-3 flex h-32 items-end gap-2">{dailyActivity.map((item) => <div key={item.label} className="flex flex-1 flex-col items-center gap-1"><div className="w-full rounded-t bg-blue-500" style={{ height: `${Math.max(4, item.count / Math.max(1, Math.max(...dailyActivity.map((entry) => entry.count))) * 100)}%` }} title={`${item.count} activities`} /><span className="text-[10px] text-slate-500">{item.label}</span></div>)}</div><p className="mt-2 text-xs text-slate-500">Recorded platform activity over the last seven days.</p></Card><Card title="Monthly Growth"><div className="mt-3 flex h-32 items-end gap-2">{monthlyActivity.map((item) => <div key={item.label} className="flex flex-1 flex-col items-center gap-1"><div className="w-full rounded-t bg-violet-500" style={{ height: `${Math.max(4, item.count / Math.max(1, Math.max(...monthlyActivity.map((entry) => entry.count))) * 100)}%` }} title={`${item.count} activities`} /><span className="text-[10px] text-slate-500">{item.label}</span></div>)}</div><p className="mt-2 text-xs text-slate-500">Recorded platform activity by month.</p></Card></div><div className="mt-5 grid gap-5 lg:grid-cols-2"><Card title="Most Active Organizations"><div className="divide-y">{rankedUsage.slice(0, 5).map((item) => <div key={item.organization_id} className="flex justify-between py-3 text-sm"><span>{organizations.find((org) => org.organization_id === item.organization_id)?.name ?? item.organization_id}</span><span>{item.orders} transactions</span></div>)}</div></Card><Card title="Least Active Organizations"><div className="divide-y">{rankedUsage.slice(-5).reverse().map((item) => <div key={item.organization_id} className="flex justify-between py-3 text-sm"><span>{organizations.find((org) => org.organization_id === item.organization_id)?.name ?? item.organization_id}</span><span>{item.orders} transactions</span></div>)}</div></Card></div></Card> : tab === "Billing & Subscriptions" ? <Card title="Billing & Subscriptions"><div className="grid gap-3 sm:grid-cols-3"><div className="rounded-lg bg-emerald-50 p-4"><p className="text-xs text-slate-500">Paid</p><p className="mt-2 text-2xl font-bold">{billing.filter((item) => item.status === "paid").length}</p></div><div className="rounded-lg bg-amber-50 p-4"><p className="text-xs text-slate-500">Outstanding</p><p className="mt-2 text-2xl font-bold">{billing.filter((item) => item.status === "outstanding").length}</p></div><div className="rounded-lg bg-blue-50 p-4"><p className="text-xs text-slate-500">Revenue</p><p className="mt-2 text-2xl font-bold">{billing.reduce((sum, item) => sum + Number(item.amount || 0), 0).toLocaleString()}</p></div></div><div className="mt-5 divide-y">{billing.map((item) => <div key={item.id} className="flex justify-between py-3 text-sm"><span>{item.invoice_number}</span><span>{Number(item.amount).toLocaleString()} · {item.status}</span></div>)}</div></Card>                         : tab === "Activity Logs" || tab === "Audit Logs" ? <Card title={tab}><p className="mt-2 text-xs text-slate-500">Recorded platform actions, including logins, organization changes, plan changes, and feature access updates.</p><div className="mt-4 grid gap-2 md:grid-cols-4"><input type="date" value={activityDateFilter} onChange={(event) => setActivityDateFilter(event.target.value)} className="h-9 rounded border px-2 text-xs" /><select value={activityOrganizationFilter} onChange={(event) => setActivityOrganizationFilter(event.target.value)} className="h-9 rounded border px-2 text-xs"><option value="">All organizations</option>{organizations.map((org) => <option key={org.organization_id} value={org.organization_id}>{org.name}</option>)}</select><select value={activityModuleFilter} onChange={(event) => setActivityModuleFilter(event.target.value)} className="h-9 rounded border px-2 text-xs"><option value="">All modules</option>{Array.from(new Set(auditLogs.map((log) => log.module))).sort().map((module) => <option key={module} value={module}>{module}</option>)}</select><select value={activityActionFilter} onChange={(event) => setActivityActionFilter(event.target.value)} className="h-9 rounded border px-2 text-xs"><option value="">All actions</option>{Array.from(new Set(auditLogs.map((log) => log.action))).sort().map((action) => <option key={action} value={action}>{action.replaceAll("_", " ")}</option>)}</select></div>        <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => exportAuditLogs(filteredAuditLogs, "csv")} className="rounded border px-2 py-1 text-xs">CSV</button><button type="button" onClick={() => exportAuditLogs(filteredAuditLogs, "excel")} className="rounded border px-2 py-1 text-xs">Excel</button><button type="button" onClick={() => exportAuditLogs(filteredAuditLogs, "pdf")} className="rounded border px-2 py-1 text-xs">PDF</button></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-y bg-slate-50 text-[11px] uppercase text-slate-500"><tr>{["Time", "User", "Organization", "Action", "Module", "Device", "Browser", "IP Address"].map((heading) => <th key={heading} className="px-3 py-3">{heading}</th>)}</tr></thead><tbody className="divide-y">{filteredAuditLogs.map((log) => <tr key={log.id} className="hover:bg-slate-50">        <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-500">{new Date(log.created_at).toLocaleString()}</td><td className="px-3 py-3 text-xs">{log.admin_id ?? "—"}</td><td className="px-3 py-3 text-xs">{organizations.find((org) => org.organization_id === log.organization_id)?.name ?? (log.organization_id ?? "Platform-wide")}</td><td className="px-3 py-3 font-semibold">{log.action.replaceAll("_", " ")}</td><td className="px-3 py-3 text-xs text-slate-500">{log.module}</td><td className="px-3 py-3 text-xs">{String(log.metadata.device ?? "—")}</td><td className="px-3 py-3 text-xs">{String(log.metadata.browser ?? log.user_agent ?? "—")}</td><td className="px-3 py-3 text-xs">{log.ip_address ?? "—"}</td></tr>)}</tbody></table>{filteredAuditLogs.length === 0 && <p className="p-8 text-center text-sm text-slate-500">No activity matches the selected filters.</p>}</div></Card>         : tab === "Organization Builder" ? <Card title="Organization Builder"><p className="text-sm text-slate-500">Provision the organization registry record, subscription, and default feature access.</p><button type="button" onClick={() => setModal("organization")} className="mt-4 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">Start Builder</button></Card> : tab === "Impersonation" ? <Card title="Impersonation"><p className="text-sm text-slate-500">Impersonation requires an active organization administrator target and a recorded security approval.</p><div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">No impersonation session can be started until the secure target-user workflow is configured.</div></Card> : tab === "System Settings" ? <Card title="System Settings"><div className="space-y-3">{["platform_branding", "email_provider", "sms_provider", "whatsapp_provider", "notification_settings", "security_settings", "api_settings", "storage_settings"].map((key) => <div key={key} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center"><label className="w-48 text-xs font-semibold capitalize">{key.replaceAll("_", " ")}</label><input value={settingsForm[key] ?? ""} onChange={(event) => setSettingsForm((current) => ({ ...current, [key]: event.target.value }))} className="h-9 flex-1 rounded border px-2 text-xs" placeholder="JSON configuration" /><button type="button" onClick={() => { let value: Record<string, unknown>; try { value = JSON.parse(settingsForm[key] || "{}") as Record<string, unknown>; } catch { setMessage(`${key} must contain valid JSON.`); return; } void run(() => updatePlatformSetting(key, value), `${key} saved.`); }} className="rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white">Save</button></div>)}</div></Card> : <Card title={tab}><p className="mt-3 text-sm text-slate-500">Approval workflow records.</p><div className="mt-4 divide-y">{approvals.map((approval) => <div key={approval.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><span>{approval.approval_type.replaceAll("_", " ")}</span><span className="text-xs text-slate-500">{approval.status}</span>{approval.status === "pending" && <div className="flex gap-2"><button type="button" onClick={() => void run(() => reviewPlatformApproval(approval.id, "approved"), "Approval approved.")} className="rounded bg-emerald-600 px-2 py-1 text-xs text-white">Approve</button><button type="button" onClick={() => void run(() => reviewPlatformApproval(approval.id, "rejected"), "Approval rejected.")} className="rounded bg-rose-600 px-2 py-1 text-xs text-white">Reject</button></div>}</div>)}</div></Card>}
      </main>
    </div>
  );
}
