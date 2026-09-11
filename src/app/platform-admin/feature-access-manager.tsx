"use client";

import { useMemo, useRef, useState } from "react";
import { NAV_ITEMS, SETTINGS_CHILDREN } from "@/components/nav/navigation";

type AccessMode = "enabled" | "disabled" | "read_only";
type Organization = { id: string; organization_id: string; name: string; plan_id: string | null };
type Plan = { id: string; name: string; included_modules?: string[] };
type FeatureRecord = {
  organization_id: string;
  module: string;
  enabled: boolean;
  access_mode: AccessMode;
  permission_options?: Record<string, boolean>;
  updated_at?: string;
};

type FeatureDefinition = { name: string; children?: string[] };
type ModuleDefinition = { name: string; features: FeatureDefinition[] };

const DETAIL_MODULES: ModuleDefinition[] = [
  { name: "Sales", features: [{ name: "Sales Dashboard", children: ["View Dashboard", "Sales Analytics", "Quick Stats"] }, { name: "Sales Transactions", children: ["New Sale", "Sales List", "Sales History", "Sales Returns", "Sales Documents", "Drafts", "Quotations", "Proformas", "Credit Notes", "Customer Payments", "Customer Owing Page"] }, { name: "Sales Analytics" }] },
  { name: "Inventory", features: [{ name: "Products", children: ["Product List", "Add Product", "Edit Product", "Delete Product", "Product Merge", "Duplicate Product Prevention", "Smart Product Detection", "Product History", "Barcode Management", "SKU Management"] }, { name: "Stock Transfer", children: ["Create Transfer", "Approve Transfer", "Reject Transfer", "Transfer History", "In Transit", "Completed Transfers"] }, { name: "Stock Adjustment", children: ["New Adjustment", "Adjustment History", "Stock Taking", "Cycle Count", "Variance Review"] }, { name: "Warehouses", children: ["Add Warehouse", "Edit Warehouse", "Delete Warehouse"] }] },
  { name: "Purchases", features: [{ name: "Purchases", children: ["Purchase Orders", "Purchase List", "Purchase Returns", "Goods Received", "Supplier Management", "Supplier Payments", "Purchase Analytics"] }] },
  { name: "POS", features: [{ name: "POS", children: ["Open POS", "Close POS", "Refund", "Void Sale", "Cash Drawer", "Barcode Scan", "Mobile Scanner", "Discount Approval"] }] },
  { name: "CRM", features: [{ name: "Customer Management", children: ["Customer List", "Customer Profile", "Customer Timeline", "Customer Credit Management", "Customer Owing Page", "Payment History", "Loyalty Program"] }, { name: "Leads", children: ["Lead Management", "Lead Pipeline", "Lead Assignment", "Lead Conversion"] }, { name: "Opportunities", children: ["Opportunities", "Follow Ups", "Activities"] }] },
  { name: "Customer Ordering", features: [{ name: "Customer Portal", children: ["Customer Login", "Place Order", "Order Tracking", "Choose Location", "Customer Pricing", "Reorder Products", "View Invoices"] }] },
  { name: "Communication", features: [{ name: "Communication", children: ["Chat", "File Sharing", "Voice Notes", "Voice Calls", "Video Calls", "Screen Sharing", "Announcements", "Mentions", "Pinned Messages", "Message Templates", "Template Approval Workflow", "Automated Thank You Messages"] }] },
  { name: "Accounting", features: [{ name: "General Ledger", children: ["Chart of Accounts", "Journal Entries", "Trial Balance"] }, { name: "Financial Statements", children: ["Profit & Loss", "Balance Sheet", "Cash Flow"] }, { name: "Accounts Receivable", children: ["Customer Balances", "Customer Owing", "Customer Statements"] }, { name: "Accounts Payable", children: ["Supplier Balances", "Supplier Statements"] }, { name: "Banking", children: ["Reconciliation", "Bank Accounts"] }] },
  { name: "HRM & Payroll", features: [{ name: "HRM", children: ["Employees", "Attendance", "Leave", "Payroll", "Performance Reviews", "Department Management"] }] },
  { name: "Users", features: [{ name: "User Management", children: ["Add User", "Manual User Accounts", "Invite Users", "Reset Password", "Roles", "Permissions", "Access Matrix", "Audit Logs"] }] },
  { name: "Reports", features: [{ name: "Reports", children: ["Financial Reports", "Sales Reports", "Purchase Reports", "Inventory Reports", "Customer Reports", "HR Reports", "Export Reports"] }] },
  { name: "Settings", features: [{ name: "Settings", children: ["Company Settings", "Branch Settings", "Currency Settings", "Tax Settings", "Email Settings", "SMS Settings", "Notification Settings"] }] },
];

function mergeFeatures(base: FeatureDefinition[], generated: FeatureDefinition[]) {
  const merged: FeatureDefinition[] = base.map((feature) => ({ ...feature, children: feature.children ? [...feature.children] : undefined }));
  generated.forEach((feature) => {
    const existing = merged.find((item) => item.name === feature.name);
    if (!existing) {
      merged.push(feature);
      return;
    }
    existing.children = [...new Set([...(existing.children ?? []), ...(feature.children ?? [])])];
  });
  return merged;
}

// The shared navigation catalog is the source of truth so new application
// modules and pages appear here automatically after they are added.
const navigationModules: ModuleDefinition[] = NAV_ITEMS.map((item) => {
  const detail = DETAIL_MODULES.find((module) => module.name === item.label);
  const generatedFeatures: FeatureDefinition[] = item.children?.length
    ? [{ name: item.label, children: item.children.map((child) => child.label) }]
    : [{ name: item.label }];
  return {
    name: item.label,
    features: mergeFeatures(detail?.features ?? [], generatedFeatures),
  };
});

const MODULES: ModuleDefinition[] = navigationModules
  .concat(
    DETAIL_MODULES.filter((module) => !navigationModules.some((item) => item.name === module.name)),
  )
  .map((module) => module.name === "Settings"
    ? {
        ...module,
        features: mergeFeatures(module.features, [{ name: "Settings", children: SETTINGS_CHILDREN.map((child) => child.label) }]),
      }
    : module);

const options = ["requireApproval", "hiddenFromMenu"] as const;
type PermissionOption = (typeof options)[number];

function featureKeys(module: ModuleDefinition) {
  return module.features.flatMap((feature) => [feature.name, ...(feature.children ?? [])]).map((name) => `${module.name}:${name}`);
}

export function FeatureAccessManager({ organizations, plans, features, auditLogs }: { organizations: Organization[]; plans: Plan[]; features: FeatureRecord[]; auditLogs: Array<{ organization_id: string | null; module: string; created_at: string }> }) {
  const [organizationId, setOrganizationId] = useState(organizations[0]?.organization_id ?? "");
  const [planId, setPlanId] = useState(organizations[0]?.plan_id ?? "");
  const [search, setSearch] = useState("");
  const [activeModule, setActiveModule] = useState(MODULES[0].name);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState<Record<string, FeatureRecord>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [detailsTab, setDetailsTab] = useState<"permissions" | "plans" | "override" | "audit">("permissions");
  const importRef = useRef<HTMLInputElement>(null);
  const organization = organizations.find((item) => item.organization_id === organizationId);
  const selectedPlan = plans.find((item) => item.id === (planId || organization?.plan_id));
  const records = useMemo(() => {
    const result: Record<string, FeatureRecord> = {};
    features.filter((item) => item.organization_id === organizationId).forEach((item) => { result[item.module] = item; });
    MODULES.forEach((module) => {
      const parent = result[module.name];
      if (!parent) return;
      featureKeys(module).forEach((key) => {
        if (!result[key]) result[key] = { ...parent, module: key };
      });
    });
    return { ...result, ...draft };
  }, [draft, features, organizationId]);
  const visibleModules = MODULES.filter((module) => module.name.toLowerCase().includes(search.toLowerCase()) || module.features.some((feature) => `${feature.name} ${(feature.children ?? []).join(" ")}`.toLowerCase().includes(search.toLowerCase())));
  const allKeys = MODULES.flatMap(featureKeys);
  const enabled = allKeys.filter((key) => (records[key]?.access_mode ?? "disabled") === "enabled").length;
  const disabled = allKeys.filter((key) => (records[key]?.access_mode ?? "disabled") === "disabled").length;
  const readOnly = allKeys.filter((key) => records[key]?.access_mode === "read_only").length;
  const custom = allKeys.filter((key) => records[key]?.permission_options && Object.values(records[key].permission_options ?? {}).some(Boolean)).length;
  const lastModified = [
    ...auditLogs
      .filter((log) => log.organization_id === organizationId && (log.module === "feature_access" || log.module === "feature_access_updated"))
      .map((log) => log.created_at),
    ...features
      .filter((feature) => feature.organization_id === organizationId && feature.updated_at)
      .map((feature) => feature.updated_at as string),
  ].sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
  const updateDraft = (key: string, accessMode: AccessMode, permissionOptions = records[key]?.permission_options ?? {}) => {
    setDraft((current) => ({ ...current, [key]: { organization_id: organizationId, module: key, enabled: accessMode !== "disabled", access_mode: accessMode, permission_options: permissionOptions } }));
  };
  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      const pending = { ...draft };
      for (const module of MODULES) {
        const keys = featureKeys(module);
        const changed = keys.some((key) => pending[key]);
        if (changed) {
          const modes = keys.map((key) => pending[key]?.access_mode ?? records[key]?.access_mode ?? records[module.name]?.access_mode ?? "disabled");
          const moduleMode: AccessMode = modes.every((mode) => mode === "disabled")
            ? "disabled"
            : modes.every((mode) => mode === "read_only")
              ? "read_only"
              : "enabled";
          pending[module.name] = {
            organization_id: organizationId,
            module: module.name,
            enabled: moduleMode !== "disabled",
            access_mode: moduleMode,
            permission_options: records[module.name]?.permission_options ?? {},
          };
        }
      }
      for (const record of Object.values(pending)) {
        const response = await fetch("/platform-admin/feature-access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, module: record.module, accessMode: record.access_mode, permissionOptions: record.permission_options ?? {} }) });
        const result = await response.json() as { error?: string };
        if (!response.ok) throw new Error(result.error ?? "Feature access could not be saved.");
      }
      setMessage("Feature permissions saved and applied immediately.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Feature permissions could not be saved.");
    } finally {
      setSaving(false);
    }
  };
  const setModuleMode = (module: ModuleDefinition, mode: AccessMode) => module.features.flatMap((feature) => [feature.name, ...(feature.children ?? [])]).forEach((name) => updateDraft(`${module.name}:${name}`, mode));
  const setAllModulesMode = (mode: AccessMode) => {
    MODULES.forEach((module) => setModuleMode(module, mode));
    setMessage(`${mode === "read_only" ? "Read-only" : mode === "enabled" ? "Enabled" : "Disabled"} access applied to all modules as a draft. Select Save Changes to persist it.`);
  };
  const applyPlanTemplate = () => {
    if (!selectedPlan) {
      setMessage("Select a subscription plan before applying its template.");
      return;
    }
    const included = new Set(selectedPlan.included_modules ?? []);
    MODULES.forEach((module) => setModuleMode(module, included.has(module.name) ? "enabled" : "disabled"));
    setMessage(`${selectedPlan.name} plan template applied as a draft. Select Save Changes to persist it.`);
  };
  const resetOptions = (key: string) => updateDraft(key, records[key]?.access_mode ?? "disabled", {});
  const exportPermissions = () => {
    const payload = allKeys.map((key) => records[key] ?? { organization_id: organizationId, module: key, enabled: false, access_mode: "disabled", permission_options: {} });
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${organization?.name ?? "organization"}-feature-permissions.json`; anchor.click(); URL.revokeObjectURL(url);
  };
  const importPermissions = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(String(reader.result)) as FeatureRecord[];
        imported.filter((item) => allKeys.includes(item.module)).forEach((item) => updateDraft(item.module, item.access_mode, item.permission_options));
        setMessage("Permissions imported. Review the changes, then select Save Changes.");
      } catch {
        setMessage("The permissions file is not valid JSON.");
      }
    };
    reader.readAsText(file);
  };
  const cloneFrom = (sourceId: string) => {
    if (!sourceId) return;
    features.filter((item) => item.organization_id === sourceId).forEach((item) => updateDraft(item.module, item.access_mode, item.permission_options));
    setMessage("Permissions cloned. Review the changes, then select Save Changes.");
  };
  const active = MODULES.find((module) => module.name === activeModule) ?? MODULES[0];
  const renderFeature = (moduleName: string, name: string, depth = 0) => {
    const key = `${moduleName}:${name}`;
    const record = records[key];
    const optionValues = record?.permission_options ?? {};
    return <div key={key} className={`grid grid-cols-[minmax(180px,1fr)_repeat(3,70px)_repeat(2,72px)_42px] items-center border-b px-3 py-2 text-xs ${depth ? "bg-slate-50/60" : ""}`}><span className={depth ? "pl-5 text-slate-600" : "font-semibold text-slate-800"}>{name}</span>{(["enabled", "disabled", "read_only"] as AccessMode[]).map((mode) => <label key={mode} className="flex justify-center"><input aria-label={`${name} ${mode}`} type="radio" name={key} checked={(record?.access_mode ?? "disabled") === mode} onChange={() => updateDraft(key, mode)} /></label>)}{options.map((option) => <label key={option} className="flex justify-center"><input aria-label={`${name} ${option}`} type="checkbox" checked={Boolean(optionValues[option])} onChange={(event) => updateDraft(key, record?.access_mode ?? "disabled", { ...optionValues, [option]: event.target.checked })} /></label>)}<button type="button" title="Clear custom options" onClick={() => resetOptions(key)} className="text-slate-400 hover:text-blue-600">↺</button></div>;
  };

  return <section className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs text-slate-400">System Administration › Feature Access</p><h2 className="mt-1 text-2xl font-bold text-slate-950">Feature Access Management</h2><p className="mt-1 text-sm text-slate-500">Control every module, page, feature, action, and permission available to each organization.</p></div><button type="button" disabled={saving} onClick={() => void save()} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Save Changes"}</button></div>
    <div className="flex flex-wrap gap-2 rounded-xl border bg-white p-4 shadow-sm"><select value={organizationId} onChange={(event) => { setOrganizationId(event.target.value); setPlanId(organizations.find((item) => item.organization_id === event.target.value)?.plan_id ?? ""); setDraft({}); }} className="h-10 rounded-lg border px-3 text-xs"><option value="">Select organization</option>{organizations.map((item) => <option key={item.organization_id} value={item.organization_id}>{item.name}</option>)}</select><select value={planId} onChange={(event) => setPlanId(event.target.value)} className="h-10 rounded-lg border px-3 text-xs"><option value="">Subscription plan</option>{plans.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search features, modules, or pages..." className="h-10 min-w-[240px] flex-1 rounded-lg border px-3 text-xs" /><select defaultValue="" onChange={(event) => cloneFrom(event.target.value)} className="h-10 rounded-lg border px-3 text-xs"><option value="">Clone permissions</option>{organizations.filter((item) => item.organization_id !== organizationId).map((item) => <option key={item.organization_id} value={item.organization_id}>{item.name}</option>)}</select><button type="button" onClick={() => importRef.current?.click()} className="rounded-lg border px-3 text-xs font-semibold">Import</button><input ref={importRef} type="file" accept="application/json" className="hidden" onChange={(event) => event.target.files?.[0] && importPermissions(event.target.files[0])} /><button type="button" onClick={exportPermissions} className="rounded-lg border px-3 text-xs font-semibold">Export</button></div>
    {message && <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">{message}</p>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">{[["Total Modules", MODULES.length], ["Enabled Features", enabled], ["Disabled Features", disabled], ["Read Only Features", readOnly], ["Custom Permissions", custom], ["Last Modified", lastModified ? new Date(lastModified).toLocaleString() : "Not yet"]].map(([label, value]) => <div key={String(label)} className="rounded-xl border bg-white p-4 shadow-sm"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-lg font-bold">{value}</p></div>)}</div>
    <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="flex flex-wrap gap-2 border-b p-3"><button type="button" onClick={() => setDetailsTab("permissions")} className={`rounded-lg px-3 py-2 text-xs font-semibold ${detailsTab === "permissions" ? "bg-blue-600 text-white" : "bg-slate-50"}`}>Permissions</button><button type="button" onClick={() => setDetailsTab("plans")} className={`rounded-lg px-3 py-2 text-xs font-semibold ${detailsTab === "plans" ? "bg-blue-600 text-white" : "bg-slate-50"}`}>Plan Comparison</button><button type="button" onClick={() => setDetailsTab("override")} className={`rounded-lg px-3 py-2 text-xs font-semibold ${detailsTab === "override" ? "bg-blue-600 text-white" : "bg-slate-50"}`}>Organization Override</button><button type="button" onClick={() => setDetailsTab("audit")} className={`rounded-lg px-3 py-2 text-xs font-semibold ${detailsTab === "audit" ? "bg-blue-600 text-white" : "bg-slate-50"}`}>Audit Log</button></div>
      {detailsTab === "permissions" && <div className="grid gap-5 xl:grid-cols-[240px_minmax(0,1fr)_250px] p-3"><aside className="rounded-xl border bg-white p-3"><h3 className="font-semibold">Modules</h3><div className="mt-3 space-y-1">{visibleModules.map((module) => <button type="button" key={module.name} onClick={() => setActiveModule(module.name)} className={`flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-xs ${activeModule === module.name ? "bg-blue-600 font-semibold text-white" : "hover:bg-slate-50"}`}><span>{module.name}</span><span>{featureKeys(module).length}</span></button>)}</div></aside>
        <div className="overflow-hidden rounded-xl border"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><h3 className="font-semibold">{active.name}</h3><p className="text-xs text-slate-500">{selectedPlan ? `${selectedPlan.name} plan · ${selectedPlan.included_modules?.includes(active.name) ? "Included" : "Organization override"}` : "Select a subscription plan"}</p></div><div className="flex gap-2"><button type="button" onClick={() => setModuleMode(active, "enabled")} className="rounded border px-2 py-1 text-[11px]">Enable entire module</button><button type="button" onClick={() => setModuleMode(active, "disabled")} className="rounded border px-2 py-1 text-[11px]">Disable entire module</button><button type="button" onClick={() => setModuleMode(active, "read_only")} className="rounded border px-2 py-1 text-[11px]">Set read only</button></div></div><div className="grid grid-cols-[minmax(180px,1fr)_repeat(3,70px)_repeat(2,72px)_42px] border-b bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase text-slate-500"><span>Feature / Page</span><span className="text-center">Enabled</span><span className="text-center">Disabled</span><span className="text-center">Read only</span><span className="text-center">Approval</span><span className="text-center">Hidden</span><span>Action</span></div>{active.features.map((feature) => <div key={feature.name}>{renderFeature(active.name, feature.name)}{feature.children?.map((child) => renderFeature(active.name, child, 1))}</div>)}</div>
        <aside className="space-y-4">
          <div className="rounded-xl border bg-white p-4">
            <h3 className="font-semibold">Bulk Actions</h3>
            <p className="mt-1 text-xs text-slate-500">Apply changes to every feature in {active.name}.</p>
            <button type="button" onClick={() => setAllModulesMode("enabled")} className="mt-3 flex w-full rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-left text-xs font-semibold text-emerald-700">Enable Entire Platform</button>
            <button type="button" onClick={() => setAllModulesMode("disabled")} className="mt-2 flex w-full rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-left text-xs font-semibold text-rose-700">Disable Entire Platform</button>
            <button type="button" onClick={() => setAllModulesMode("read_only")} className="mt-2 flex w-full rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-left text-xs font-semibold text-blue-700">Set Entire Platform Read Only</button>
            <select defaultValue="" onChange={(event) => cloneFrom(event.target.value)} className="mt-2 h-9 w-full rounded-lg border px-2 text-xs"><option value="">Copy Permissions From Another Organization</option>{organizations.filter((item) => item.organization_id !== organizationId).map((item) => <option key={item.organization_id} value={item.organization_id}>{item.name}</option>)}</select>
            <button type="button" onClick={applyPlanTemplate} className="mt-2 flex w-full rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-left text-xs font-semibold text-purple-700">Apply Permission Template</button>
          </div>
          <div className="rounded-xl border bg-white p-4"><h3 className="font-semibold">Permission Presets</h3>{[["enabled", "Full Access"], ["read_only", "Read Only"], ["disabled", "Limited Access"]].map(([mode, label]) => <button type="button" key={mode} onClick={() => setModuleMode(active, mode as AccessMode)} className="mt-2 flex w-full rounded-lg border px-3 py-2 text-left text-xs hover:bg-slate-50">{label}</button>)}</div>
          <div className="rounded-xl border bg-white p-4"><h3 className="font-semibold">Permission Legend</h3><p className="mt-2 text-xs text-slate-500">Enabled, disabled, read-only, approval, and hidden settings are saved per feature and audited.</p><p className="mt-3 text-xs text-slate-500">Organization rows are explicit overrides of subscription defaults.</p></div>
        </aside></div>}
      {detailsTab === "plans" && <div className="overflow-x-auto p-4"><table className="w-full text-left text-xs"><thead><tr className="border-b text-slate-500"><th className="p-2">Module</th>{plans.map((plan) => <th key={plan.id} className="p-2">{plan.name}</th>)}<th className="p-2">Organization</th></tr></thead><tbody>{MODULES.map((module) => <tr key={module.name} className="border-b"><td className="p-2 font-semibold">{module.name}</td>{plans.map((plan) => <td key={plan.id} className="p-2">{plan.included_modules?.includes(module.name) ? "Included" : "Restricted"}</td>)}<td className="p-2">{records[module.name]?.access_mode ?? "Inherited"}</td></tr>)}</tbody></table></div>}
      {detailsTab === "override" && <div className="space-y-4 p-5"><h3 className="font-semibold">Organization Override</h3><p className="text-sm text-slate-500">Permissions saved for this organization override the selected subscription plan immediately. Use the module controls or feature rows, then select Save Changes.</p><div className="grid gap-3 sm:grid-cols-2">{MODULES.map((module) => <button type="button" key={module.name} onClick={() => { setActiveModule(module.name); setDetailsTab("permissions"); }} className="rounded-lg border p-3 text-left text-xs hover:border-blue-400"><span className="font-semibold">{module.name}</span><span className="mt-1 block text-slate-500">{records[module.name]?.access_mode ?? "Inherited from plan"}</span></button>)}</div></div>}
      {detailsTab === "audit" && <div className="overflow-x-auto p-4"><table className="w-full text-left text-xs"><thead><tr className="border-b text-slate-500"><th className="p-2">Date / Time</th><th className="p-2">Organization</th><th className="p-2">Action</th><th className="p-2">Details</th></tr></thead><tbody>{auditLogs.filter((log) => log.organization_id === organizationId && log.module === "feature_access").slice(0, 25).map((log, index) => <tr key={`${log.created_at}-${index}`} className="border-b"><td className="p-2">{new Date(log.created_at).toLocaleString()}</td><td className="p-2">{organization?.name ?? organizationId}</td><td className="p-2">{log.module}</td><td className="p-2">Permission change recorded</td></tr>)}{!auditLogs.some((log) => log.organization_id === organizationId && log.module === "feature_access") && <tr><td colSpan={4} className="p-5 text-center text-slate-500">No feature access changes recorded yet.</td></tr>}</tbody></table></div>}
    </div>
  </section>;
}
