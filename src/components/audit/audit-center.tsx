"use client";

import { useEffect, useMemo, useState } from "react";

export interface AuditRecord {
  id: string;
  actor_id: string | null;
  actor_name: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

type AuditTab = "all" | "user" | "data" | "security" | "failed";
type AuditCategory = Exclude<AuditTab, "all" | "failed">;

const tabs: Array<[AuditTab, string]> = [
  ["all", "All Activity"], ["user", "User Actions"], ["data", "Data Changes"],
  ["security", "Security Events"], ["failed", "Failed Attempts"],
];

function textValue(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function isDataChange(record: AuditRecord) {
  const value = `${record.action} ${record.entity_type}`.toLowerCase();
  const metadata = record.metadata;
  const metadataText = JSON.stringify(metadata).toLowerCase();
  return Boolean(
    metadata.previous_values ||
    metadata.new_values ||
    metadata.changed_fields ||
    metadata.changes ||
    /\b(create|created|add|added|update|updated|edit|edited|delete|deleted|remove|removed|adjust|adjusted|transfer|transferred|approve|approved|reject|rejected|void|refun[ded]+|receive|received|import|merge|price|cost|selling|purchase)\b/.test(`${value} ${metadataText}`),
  );
}

function recordCategory(record: AuditRecord): AuditCategory {
  const value = `${record.action} ${record.entity_type}`.toLowerCase();
  if (/login|logout|password|security|permission|failed|two.factor|session/.test(value)) return "security";
  if (isDataChange(record)) return "data";
  return "user";
}

function isFailed(record: AuditRecord) {
  return /failed|rejected|denied|error/.test(record.action.toLowerCase()) || record.metadata.status === "failed";
}

function recordStatus(record: AuditRecord) {
  return isFailed(record) ? "Failed" : textValue(record.metadata.status) || "Success";
}

function recordSeverity(record: AuditRecord) {
  const severity = textValue(record.metadata.severity).toLowerCase();
  if (severity) return severity;
  return isFailed(record) || recordCategory(record) === "security" ? "high" : "low";
}

function recordModule(record: AuditRecord) {
  return textValue(record.metadata.module) || record.entity_type;
}

function recordBranch(record: AuditRecord) {
  return textValue(record.metadata.branch_name) ||
    textValue(record.metadata.location_name) ||
    textValue(record.metadata.branch) ||
    textValue(record.metadata.location) ||
    textValue(record.metadata.branch_id) ||
    textValue(record.metadata.location_id);
}

function recordRole(record: AuditRecord) {
  return textValue(record.metadata.role) || "Not captured";
}

function relatedHref(record: AuditRecord) {
  const routes: Record<string, string> = {
    sale: "/sales",
    sales: "/sales",
    purchase: "/purchases",
    purchases: "/purchases",
    product: "/inventory",
    inventory: "/inventory",
    expense: "/expenses",
    customer: "/crm",
    supplier: "/purchases/suppliers",
    stock_adjustment: "/inventory/adjustments",
    stock_transfer: "/inventory/transfers",
  };
  const route = routes[record.entity_type.toLowerCase()];
  return route && record.entity_id ? `${route}/${record.entity_id}` : route;
}

function csvExport(records: AuditRecord[]) {
  const rows = [["Date & Time", "User", "Action", "Module", "Entity", "Branch", "IP Address", "Status", "Severity"],
    ...records.map((record) => [
      new Date(record.created_at).toISOString(), record.actor_name, record.action, record.entity_type,
      record.entity_id ?? "", textValue(record.metadata.branch_name) || textValue(record.metadata.branch_id),
      textValue(record.metadata.ip_address), recordStatus(record), recordSeverity(record),
    ])];
  const content = rows.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `audit-center-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function countBy(records: AuditRecord[], predicate: (record: AuditRecord) => boolean) {
  return records.filter(predicate).length;
}

export function AuditCenter({ records }: { records: AuditRecord[] }) {
  const [tab, setTab] = useState<AuditTab>("all");
  const [query, setQuery] = useState("");
  const [module, setModule] = useState("all");
  const [action, setAction] = useState("all");
  const [status, setStatus] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [branch, setBranch] = useState("all");
  const [role, setRole] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AuditRecord | null>(null);
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [savedViews, setSavedViews] = useState<Array<{ name: string; query: string; tab: AuditTab; module: string; action: string; status: string; severity: string; from: string; to: string }>>([]);
  const [viewName, setViewName] = useState("");
  const pageSize = 25;
  useEffect(() => {
    const stored = window.localStorage.getItem("thinksales-audit-views");
    if (!stored) return;
    try {
      const parsed: unknown = JSON.parse(stored);
      if (Array.isArray(parsed)) setSavedViews(parsed as typeof savedViews);
    } catch (error) {
      console.error("Saved audit views could not be loaded:", error);
    }
  }, []);
  const modules = useMemo(() => [...new Set(records.map(recordModule))].sort(), [records]);
  const actions = useMemo(() => [...new Set(records.map((record) => record.action))].sort(), [records]);
  const branches = useMemo(() => [...new Set(records.map(recordBranch).filter(Boolean))].sort(), [records]);
  const roles = useMemo(() => [...new Set(records.map(recordRole).filter((value) => value !== "Not captured"))].sort(), [records]);
  const filtered = useMemo(() => records.filter((record) => {
    const haystack = `${record.actor_name} ${record.action} ${record.entity_type} ${record.entity_id ?? ""} ${JSON.stringify(record.metadata)}`.toLowerCase();
    const date = record.created_at.slice(0, 10);
    return (tab === "all" || (tab === "failed" ? isFailed(record) : recordCategory(record) === tab))
      && (module === "all" || recordModule(record) === module)
      && (action === "all" || record.action === action)
      && (status === "all" || recordStatus(record).toLowerCase() === status)
      && (severity === "all" || recordSeverity(record) === severity)
      && (branch === "all" || recordBranch(record) === branch)
      && (role === "all" || recordRole(record) === role)
      && (!from || date >= from) && (!to || date <= to)
      && (!query.trim() || haystack.includes(query.trim().toLowerCase()))
      && (!selectedUser || record.actor_id === selectedUser);
  }), [action, branch, from, module, query, records, role, selectedUser, severity, status, tab, to]);
  const ordered = [...filtered].sort((a, b) => sortAsc
    ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at));
  const visible = ordered.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.max(1, Math.ceil(ordered.length / pageSize));
  const clearFilters = () => { setQuery(""); setModule("all"); setAction("all"); setStatus("all"); setSeverity("all"); setBranch("all"); setRole("all"); setFrom(""); setTo(""); setSelectedUser(""); setSelectedIds([]); setPage(1); };
  const saveView = () => {
    if (!viewName.trim()) return;
    const next = [...savedViews.filter((view) => view.name !== viewName.trim()), { name: viewName.trim(), query, tab, module, action, status, severity, from, to }];
    setSavedViews(next);
    window.localStorage.setItem("thinksales-audit-views", JSON.stringify(next));
    setViewName("");
  };
  const loadView = (name: string) => {
    const view = savedViews.find((item) => item.name === name);
    if (!view) return;
    setQuery(view.query); setTab(view.tab); setModule(view.module); setAction(view.action); setStatus(view.status); setSeverity(view.severity); setFrom(view.from); setTo(view.to); setPage(1);
  };
  const tabCount = (value: AuditTab) => value === "all" ? records.length : value === "failed" ? countBy(records, isFailed) : countBy(records, (record) => recordCategory(record) === value);
  const today = countBy(records, (record) => record.created_at.slice(0, 10) === new Date().toISOString().slice(0, 10));
  const distribution = modules.map((name) => ({ name, value: countBy(records, (record) => record.entity_type === name) })).sort((a, b) => b.value - a.value).slice(0, 6);
  const maxDistribution = Math.max(1, ...distribution.map((item) => item.value));
  const userStats = useMemo(() => [...new Set(records.map((record) => record.actor_id).filter(Boolean))].map((id) => {
    const userRecords = records.filter((record) => record.actor_id === id);
    return {
      id: id as string,
      name: userRecords[0]?.actor_name ?? "Unknown user",
      total: userRecords.length,
      creates: countBy(userRecords, (record) => /create|add/i.test(record.action)),
      updates: countBy(userRecords, (record) => /update|edit|change/i.test(record.action)),
      deletes: countBy(userRecords, (record) => /delete|remove/i.test(record.action)),
      views: countBy(userRecords, (record) => /view|read|export/i.test(record.action)),
      failed: countBy(userRecords, isFailed),
      lastActive: userRecords[0]?.created_at ?? "",
    };
  }).sort((a, b) => b.total - a.total), [records]);
  const dataChanges = records.filter((record) => recordCategory(record) === "data");
  const changeCount = (pattern: RegExp) => countBy(dataChanges, (record) => pattern.test(record.action));
  const highImpact = dataChanges.filter((record) => /price|cost|credit|permission|branch|stock|inventory|financial/i.test(`${record.action} ${record.entity_type} ${JSON.stringify(record.metadata)}`));
  const securityRecords = records.filter((record) => recordCategory(record) === "security");
  const failedRecords = records.filter(isFailed);
  const failureGroups = [...new Set(failedRecords.map((record) => {
    const value = `${record.action} ${record.entity_type}`.toLowerCase();
    if (/login|auth|password/.test(value)) return "Authentication";
    if (/permission|denied|role/.test(value)) return "Authorization";
    return record.entity_type || "Other";
  }))].map((name) => ({ name, value: failedRecords.filter((record) => {
    const value = `${record.action} ${record.entity_type}`.toLowerCase();
    return name === "Authentication" ? /login|auth|password/.test(value) : name === "Authorization" ? /permission|denied|role/.test(value) : !/login|auth|password|permission|denied|role/.test(value) && record.entity_type === name;
  }).length }));
  const trend = Array.from({ length: 14 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (13 - index));
    const key = date.toISOString().slice(0, 10);
    return { key, label: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }), total: filtered.filter((record) => record.created_at.slice(0, 10) === key).length, failed: filtered.filter((record) => record.created_at.slice(0, 10) === key && isFailed(record)).length };
  });
  const maxTrend = Math.max(1, ...trend.map((point) => point.total));
  const actionBreakdown = [...new Set(filtered.map((record) => record.action))].map((name) => ({ name, value: filtered.filter((record) => record.action === name).length })).sort((a, b) => b.value - a.value).slice(0, 8);

  return <section className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold text-slate-900">Advanced Audit Center</h1><p className="mt-1 text-sm text-slate-500">Monitor every important action and event across your organization.</p></div><div className="text-right text-xs text-slate-500"><p>{records.length.toLocaleString()} recorded events</p><p>Organization audit trail · {today} today</p></div></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[["Total Events", records.length], ["User Actions", tabCount("user")], ["Data Changes", tabCount("data")], ["Security Events", tabCount("security")], ["Failed Attempts", tabCount("failed")]].map(([label, value]) => <div key={String(label)} className="rounded-xl border bg-white p-4 shadow-sm"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p><p className="mt-1 text-[11px] text-slate-400">From real audit records</p></div>)}</div>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]"><div className="rounded-xl border bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><h2 className="font-semibold">Activity Trend</h2><span className="text-xs text-slate-400">Last 14 days · active filters</span></div><div className="mt-4 flex h-32 items-end gap-1">{trend.map((point) => <div key={point.key} className="group flex min-w-0 flex-1 flex-col items-center justify-end"><div title={`${point.label}: ${point.total} events, ${point.failed} failed`} className="w-full rounded-t bg-blue-500 transition hover:bg-blue-700" style={{ height: `${point.total / maxTrend * 100}%`, minHeight: point.total ? 3 : 0 }} /><span className="mt-1 hidden truncate text-[9px] text-slate-400 group-first:block">{point.label}</span></div>)}</div><div className="mt-4 grid gap-2 sm:grid-cols-2"><div><h3 className="text-xs font-semibold text-slate-600">Activity by Module</h3><div className="mt-2 space-y-2">{distribution.map((item) => <div key={item.name}><div className="flex justify-between text-xs"><span>{item.name}</span><strong>{item.value}</strong></div><div className="mt-1 h-2 rounded bg-slate-100"><div className="h-2 rounded bg-emerald-500" style={{ width: `${item.value / maxDistribution * 100}%` }} /></div></div>)}</div></div><div><h3 className="text-xs font-semibold text-slate-600">Activity by Action</h3><div className="mt-2 space-y-2">{actionBreakdown.map((item) => <button type="button" key={item.name} onClick={() => { setAction(item.name); setPage(1); }} className="flex w-full justify-between text-left text-xs hover:text-blue-600"><span>{item.name}</span><strong>{item.value}</strong></button>)}</div></div></div></div><div className="rounded-xl border bg-white p-4 shadow-sm"><h2 className="font-semibold">Activity Health</h2><div className="mt-4 space-y-3 text-sm"><p className="flex justify-between"><span>Successful events</span><strong className="text-emerald-600">{records.length - tabCount("failed")}</strong></p><p className="flex justify-between"><span>Security events</span><strong>{tabCount("security")}</strong></p><p className="flex justify-between"><span>Failed attempts</span><strong className="text-red-600">{tabCount("failed")}</strong></p></div></div></div>
    {tab === "user" && <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]"><div className="rounded-xl border bg-white p-4 shadow-sm"><h2 className="font-semibold">User Activity Ranking</h2><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[680px] text-left text-xs"><thead className="border-b text-slate-500"><tr>{["Rank", "User", "Total", "Creates", "Updates", "Deletes", "Views", "Last Active"].map((heading) => <th key={heading} className="px-2 py-2">{heading}</th>)}</tr></thead><tbody className="divide-y">{userStats.map((user, index) => <tr key={user.id} onClick={() => setSelectedUser((current) => current === user.id ? "" : user.id)} className={`cursor-pointer ${selectedUser === user.id ? "bg-blue-50" : "hover:bg-slate-50"}`}><td className="px-2 py-2">{index + 1}</td><td className="px-2 py-2 font-semibold">{user.name}</td><td className="px-2 py-2">{user.total}</td><td className="px-2 py-2">{user.creates}</td><td className="px-2 py-2">{user.updates}</td><td className="px-2 py-2">{user.deletes}</td><td className="px-2 py-2">{user.views}</td><td className="px-2 py-2 text-slate-500">{user.lastActive ? new Date(user.lastActive).toLocaleString() : "—"}</td></tr>)}</tbody></table>{!userStats.length && <p className="py-6 text-center text-sm text-slate-500">No user actions recorded.</p>}</div></div><div className="rounded-xl border bg-white p-4 shadow-sm"><h2 className="font-semibold">User Action Summary</h2><p className="mt-2 text-xs text-slate-500">Select a user to filter the shared audit table.</p>{selectedUser ? <div className="mt-4 space-y-2 text-sm"><p>Selected: <strong>{userStats.find((user) => user.id === selectedUser)?.name}</strong></p><p>Total actions: {userStats.find((user) => user.id === selectedUser)?.total}</p><p>Failed actions: {userStats.find((user) => user.id === selectedUser)?.failed}</p><button type="button" onClick={() => setSelectedUser("")} className="rounded border px-3 py-1 text-xs">Clear user</button></div> : <p className="mt-4 text-sm text-slate-500">No user selected.</p>}</div></div>}
    {tab === "data" && <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[["Total Changes", dataChanges.length], ["Creates", changeCount(/create|add/i)], ["Updates", changeCount(/update|edit|change/i)], ["Deletes", changeCount(/delete|remove/i)], ["High Impact", highImpact.length]].map(([label, value]) => <div key={String(label)} className="rounded-xl border bg-white p-4 shadow-sm"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></div>)}</div><div className="rounded-xl border bg-white p-4 shadow-sm"><h2 className="font-semibold">Change Journal</h2><p className="mt-1 text-xs text-slate-500">Only create, update, delete, and other persisted record changes appear here. Select a row to inspect the before-and-after values.</p><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead className="border-b bg-slate-50 uppercase text-slate-500"><tr>{["Date & Time", "User", "Change", "Record", "Before", "After", "Status"].map((heading) => <th key={heading} className="px-3 py-3">{heading}</th>)}</tr></thead><tbody className="divide-y">{dataChanges.slice(0, 25).map((record) => <tr key={record.id} onClick={() => setSelected(record)} className="cursor-pointer hover:bg-blue-50"><td className="px-3 py-3 text-slate-500">{new Date(record.created_at).toLocaleString()}</td><td className="px-3 py-3 font-medium">{record.actor_name}</td><td className="px-3 py-3 font-semibold">{record.action}</td><td className="px-3 py-3">{record.entity_type} {record.entity_id ? `#${record.entity_id}` : ""}</td><td className="max-w-[180px] truncate px-3 py-3 text-red-700">{JSON.stringify(record.metadata.previous_values ?? "—")}</td><td className="max-w-[180px] truncate px-3 py-3 text-emerald-700">{JSON.stringify(record.metadata.new_values ?? "—")}</td><td className="px-3 py-3">{recordStatus(record)}</td></tr>)}{!dataChanges.length && <tr><td colSpan={7} className="p-8 text-center text-slate-500">No persisted data changes match the current filters.</td></tr>}</tbody></table></div></div></div>}
    {tab === "security" && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[["Security Events", securityRecords.length], ["Successful Logins", countBy(securityRecords, (record) => /login/i.test(record.action) && !isFailed(record))], ["Failed Logins", countBy(securityRecords, (record) => /login/i.test(record.action) && isFailed(record))], ["Permission Changes", countBy(securityRecords, (record) => /permission|role/i.test(record.action))], ["Security Alerts", countBy(securityRecords, (record) => recordSeverity(record) === "high" || recordSeverity(record) === "critical")]].map(([label, value]) => <div key={String(label)} className="rounded-xl border bg-white p-4 shadow-sm"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></div>)}</div>}
    {tab === "security" && securityRecords.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><h2 className="font-semibold">Security Alerts</h2><p className="mt-1 text-xs">Potentially unusual activity detected from recorded security events. Review the event details before taking action.</p><div className="mt-3 flex flex-wrap gap-2">{securityRecords.filter(isFailed).slice(0, 5).map((record) => <button type="button" key={record.id} onClick={() => setSelected(record)} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs">{record.action} · {new Date(record.created_at).toLocaleString()}</button>)}</div></div>}
    {tab === "failed" && <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Failed Attempts", failedRecords.length], ["Failed Logins", countBy(failedRecords, (record) => /login|auth/i.test(record.action))], ["Access Denied", countBy(failedRecords, (record) => /denied|permission/i.test(record.action))], ["Failure Rate", records.length ? `${Math.round(failedRecords.length / records.length * 100)}%` : "0%"]].map(([label, value]) => <div key={String(label)} className="rounded-xl border bg-white p-4 shadow-sm"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></div>)}</div><div className="rounded-xl border bg-white p-4 shadow-sm"><h2 className="font-semibold">Failure Breakdown</h2><div className="mt-3 space-y-2 text-xs">{failureGroups.map((item) => <p key={item.name} className="flex justify-between"><span>{item.name}</span><strong>{item.value}</strong></p>)}</div>{!failureGroups.length && <p className="mt-3 text-sm text-slate-500">No failed attempts detected.</p>}</div></div>}
    <div className="rounded-xl border bg-white shadow-sm">
      <div className="flex flex-wrap gap-2 border-b p-4">{tabs.map(([value, label]) => <button type="button" key={value} onClick={() => { setTab(value); setPage(1); }} className={`rounded-lg px-3 py-2 text-xs font-semibold ${tab === value ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100"}`}>{label} ({tabCount(value)})</button>)}</div>
      <div className="grid gap-2 border-b p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8"><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search user, email, entity, IP..." className="h-9 rounded border px-2 text-xs xl:col-span-2" /><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="h-9 rounded border px-2 text-xs" /><input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="h-9 rounded border px-2 text-xs" /><select value={module} onChange={(event) => setModule(event.target.value)} className="h-9 rounded border px-2 text-xs"><option value="all">All modules</option>{modules.map((value) => <option key={value} value={value}>{value}</option>)}</select><select value={role} onChange={(event) => setRole(event.target.value)} className="h-9 rounded border px-2 text-xs"><option value="all">All roles</option>{roles.map((value) => <option key={value} value={value}>{value}</option>)}</select><select value={branch} onChange={(event) => setBranch(event.target.value)} className="h-9 rounded border px-2 text-xs"><option value="all">All branches</option>{branches.map((value) => <option key={value} value={value}>{value}</option>)}</select><select value={action} onChange={(event) => setAction(event.target.value)} className="h-9 rounded border px-2 text-xs"><option value="all">All actions</option>{actions.map((value) => <option key={value} value={value}>{value}</option>)}</select><select value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 rounded border px-2 text-xs"><option value="all">All status</option><option value="success">Success</option><option value="failed">Failed</option></select><select value={severity} onChange={(event) => setSeverity(event.target.value)} className="h-9 rounded border px-2 text-xs"><option value="all">All severity</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select><button type="button" onClick={clearFilters} className="h-9 rounded border px-3 text-xs font-semibold">Clear</button></div>
      <div className="flex flex-wrap justify-end gap-2 border-b p-3"><select defaultValue="" onChange={(event) => loadView(event.target.value)} className="rounded border px-2 py-1 text-xs"><option value="">Saved views</option>{savedViews.map((view) => <option key={view.name} value={view.name}>{view.name}</option>)}</select><input value={viewName} onChange={(event) => setViewName(event.target.value)} placeholder="View name" className="w-28 rounded border px-2 py-1 text-xs" /><button type="button" onClick={saveView} className="rounded border px-3 py-1 text-xs">Save view</button><button type="button" onClick={() => setSortAsc((value) => !value)} className="rounded border px-3 py-1 text-xs">Sort {sortAsc ? "oldest" : "newest"}</button><button type="button" onClick={() => csvExport(filtered)} className="rounded border px-3 py-1 text-xs font-semibold">Export CSV</button><button type="button" disabled={!selectedIds.length} onClick={() => csvExport(filtered.filter((record) => selectedIds.includes(record.id)))} className="rounded border px-3 py-1 text-xs disabled:opacity-40">Export Selected ({selectedIds.length})</button><button type="button" onClick={() => window.print()} className="rounded border px-3 py-1 text-xs font-semibold">Print / PDF</button></div>
      {tab !== "data" && <><div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-left text-sm"><thead className="border-b bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-3 py-3"><input type="checkbox" checked={visible.length > 0 && visible.every((record) => selectedIds.includes(record.id))} onChange={(event) => setSelectedIds(event.target.checked ? [...new Set([...selectedIds, ...visible.map((record) => record.id)])] : selectedIds.filter((id) => !visible.some((record) => record.id === id)))} /></th>{["Date & Time", "User", "Action", "Module", "Entity", "Description", "Branch", "IP Address", "Status", "Severity"].map((heading) => <th key={heading} className="px-3 py-3">{heading}</th>)}</tr></thead><tbody className="divide-y">{visible.map((record) => <tr key={record.id} onClick={() => setSelected(record)} className="cursor-pointer hover:bg-blue-50"><td className="px-3 py-3" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={selectedIds.includes(record.id)} onChange={(event) => setSelectedIds((ids) => event.target.checked ? [...ids, record.id] : ids.filter((id) => id !== record.id))} /></td><td className="px-3 py-3 text-xs text-slate-500">{new Date(record.created_at).toLocaleString()}</td><td className="px-3 py-3 text-xs font-medium">{record.actor_name}</td><td className="px-3 py-3 text-xs font-semibold">{record.action}</td><td className="px-3 py-3 text-xs">{record.entity_type}</td><td className="px-3 py-3 text-xs text-slate-500">{record.entity_id ?? "—"}</td><td className="max-w-[220px] truncate px-3 py-3 text-xs">{textValue(record.metadata.description) || `${record.action} on ${record.entity_type}`}</td><td className="px-3 py-3 text-xs">{textValue(record.metadata.branch_name) || textValue(record.metadata.branch_id) || "—"}</td><td className="px-3 py-3 text-xs">{textValue(record.metadata.ip_address) || "—"}</td><td className="px-3 py-3 text-xs"><span className={`rounded-full px-2 py-1 ${isFailed(record) ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{recordStatus(record)}</span></td><td className="px-3 py-3 text-xs capitalize">{recordSeverity(record)}</td></tr>)}</tbody></table>{!visible.length && <p className="p-10 text-center text-sm text-slate-500">No audit activity matches the current filters.</p>}</div>
      <div className="flex items-center justify-between border-t p-3 text-xs text-slate-500"><span>{ordered.length ? `${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, ordered.length)} of ${ordered.length}` : "0 records"}</span><div className="flex gap-2"><button type="button" disabled={page === 1} onClick={() => setPage((value) => value - 1)} className="rounded border px-2 py-1 disabled:opacity-40">Previous</button><span className="px-2 py-1">Page {page} of {totalPages}</span><button type="button" disabled={page === totalPages} onClick={() => setPage((value) => value + 1)} className="rounded border px-2 py-1 disabled:opacity-40">Next</button></div></div>
    </>}
    </div>
    {selected && <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={() => setSelected(null)}><div className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-xl bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between"><div><h2 className="text-lg font-bold">Audit record details</h2><p className="mt-1 text-xs text-slate-500">{new Date(selected.created_at).toLocaleString()}</p></div><button type="button" onClick={() => setSelected(null)} className="text-xl text-slate-400">x</button></div><dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-xs text-slate-500">Event ID</dt><dd className="font-mono text-xs">{selected.id}</dd></div>    <div><dt className="text-xs text-slate-500">User / role</dt><dd>{selected.actor_name} / {recordRole(selected)}</dd></div><div><dt className="text-xs text-slate-500">Action</dt><dd>{selected.action}</dd></div><div><dt className="text-xs text-slate-500">Module / entity</dt><dd>{selected.entity_type} / {selected.entity_id ?? "—"}</dd></div><div><dt className="text-xs text-slate-500">Branch / IP address</dt><dd>{textValue(selected.metadata.branch_name) || textValue(selected.metadata.branch_id) || "—"} / {textValue(selected.metadata.ip_address) || "—"}</dd></div><div><dt className="text-xs text-slate-500">Status / severity</dt><dd className="capitalize">{recordStatus(selected)} / {recordSeverity(selected)}</dd></div><div><dt className="text-xs text-slate-500">Description</dt><dd>{textValue(selected.metadata.description) || `${selected.action} on ${selected.entity_type}`}</dd></div><div><dt className="text-xs text-slate-500">User agent</dt><dd className="break-all">{textValue(selected.metadata.user_agent) || "Not captured"}</dd></div><div className="sm:col-span-2"><dt className="text-xs text-slate-500">Before / after values</dt><dd className="grid gap-2 sm:grid-cols-2"><pre className="overflow-auto rounded-lg bg-red-50 p-3 text-xs">{JSON.stringify(selected.metadata.previous_values ?? {}, null, 2)}</pre><pre className="overflow-auto rounded-lg bg-emerald-50 p-3 text-xs">{JSON.stringify(selected.metadata.new_values ?? {}, null, 2)}</pre></dd></div><div className="sm:col-span-2"><dt className="text-xs text-slate-500">Metadata and request context</dt><dd><pre className="mt-1 overflow-auto rounded-lg bg-slate-50 p-3 text-xs">{JSON.stringify(selected.metadata, null, 2)}</pre></dd></div></dl></div></div>}
  </section>;
}
