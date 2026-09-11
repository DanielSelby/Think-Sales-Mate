"use client";

import { useMemo, useState } from "react";

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

function recordCategory(record: AuditRecord): AuditCategory {
  const value = `${record.action} ${record.entity_type}`.toLowerCase();
  if (/login|logout|password|security|permission|failed|two.factor|session/.test(value)) return "security";
  if (/user|member|profile|role/.test(value)) return "user";
  return "data";
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
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AuditRecord | null>(null);
  const pageSize = 25;
  const modules = useMemo(() => [...new Set(records.map((record) => record.entity_type))].sort(), [records]);
  const actions = useMemo(() => [...new Set(records.map((record) => record.action))].sort(), [records]);
  const filtered = useMemo(() => records.filter((record) => {
    const haystack = `${record.actor_name} ${record.action} ${record.entity_type} ${record.entity_id ?? ""} ${JSON.stringify(record.metadata)}`.toLowerCase();
    const date = record.created_at.slice(0, 10);
    return (tab === "all" || (tab === "failed" ? isFailed(record) : recordCategory(record) === tab))
      && (module === "all" || record.entity_type === module)
      && (action === "all" || record.action === action)
      && (status === "all" || recordStatus(record).toLowerCase() === status)
      && (severity === "all" || recordSeverity(record) === severity)
      && (!from || date >= from) && (!to || date <= to)
      && (!query.trim() || haystack.includes(query.trim().toLowerCase()));
  }), [action, from, module, query, records, severity, status, tab, to]);
  const ordered = [...filtered].sort((a, b) => sortAsc
    ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at));
  const visible = ordered.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.max(1, Math.ceil(ordered.length / pageSize));
  const clearFilters = () => { setQuery(""); setModule("all"); setAction("all"); setStatus("all"); setSeverity("all"); setFrom(""); setTo(""); setPage(1); };
  const tabCount = (value: AuditTab) => value === "all" ? records.length : value === "failed" ? countBy(records, isFailed) : countBy(records, (record) => recordCategory(record) === value);
  const today = countBy(records, (record) => record.created_at.slice(0, 10) === new Date().toISOString().slice(0, 10));
  const distribution = modules.map((name) => ({ name, value: countBy(records, (record) => record.entity_type === name) })).sort((a, b) => b.value - a.value).slice(0, 6);
  const maxDistribution = Math.max(1, ...distribution.map((item) => item.value));

  return <section className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold text-slate-900">Advanced Audit Center</h1><p className="mt-1 text-sm text-slate-500">Monitor every important action and event across your organization.</p></div><div className="text-right text-xs text-slate-500"><p>{records.length.toLocaleString()} recorded events</p><p>Organization audit trail · {today} today</p></div></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[["Total Events", records.length], ["User Actions", tabCount("user")], ["Data Changes", tabCount("data")], ["Security Events", tabCount("security")], ["Failed Attempts", tabCount("failed")]].map(([label, value]) => <div key={String(label)} className="rounded-xl border bg-white p-4 shadow-sm"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p><p className="mt-1 text-[11px] text-slate-400">From real audit records</p></div>)}</div>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]"><div className="rounded-xl border bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><h2 className="font-semibold">Activity by Module</h2><span className="text-xs text-slate-400">Current records</span></div><div className="mt-4 space-y-3">{distribution.map((item) => <div key={item.name}><div className="flex justify-between text-xs"><span>{item.name}</span><strong>{item.value}</strong></div><div className="mt-1 h-2 rounded bg-slate-100"><div className="h-2 rounded bg-blue-600" style={{ width: `${item.value / maxDistribution * 100}%` }} /></div></div>)}{!distribution.length && <p className="text-sm text-slate-500">No module activity recorded.</p>}</div></div><div className="rounded-xl border bg-white p-4 shadow-sm"><h2 className="font-semibold">Activity Health</h2><div className="mt-4 space-y-3 text-sm"><p className="flex justify-between"><span>Successful events</span><strong className="text-emerald-600">{records.length - tabCount("failed")}</strong></p><p className="flex justify-between"><span>Security events</span><strong>{tabCount("security")}</strong></p><p className="flex justify-between"><span>Failed attempts</span><strong className="text-red-600">{tabCount("failed")}</strong></p></div></div></div>
    <div className="rounded-xl border bg-white shadow-sm">
      <div className="flex flex-wrap gap-2 border-b p-4">{tabs.map(([value, label]) => <button type="button" key={value} onClick={() => { setTab(value); setPage(1); }} className={`rounded-lg px-3 py-2 text-xs font-semibold ${tab === value ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100"}`}>{label} ({tabCount(value)})</button>)}</div>
      <div className="grid gap-2 border-b p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8"><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search user, action, entity..." className="h-9 rounded border px-2 text-xs xl:col-span-2" /><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="h-9 rounded border px-2 text-xs" /><input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="h-9 rounded border px-2 text-xs" /><select value={module} onChange={(event) => setModule(event.target.value)} className="h-9 rounded border px-2 text-xs"><option value="all">All modules</option>{modules.map((value) => <option key={value} value={value}>{value}</option>)}</select><select value={action} onChange={(event) => setAction(event.target.value)} className="h-9 rounded border px-2 text-xs"><option value="all">All actions</option>{actions.map((value) => <option key={value} value={value}>{value}</option>)}</select><select value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 rounded border px-2 text-xs"><option value="all">All status</option><option value="success">Success</option><option value="failed">Failed</option></select><select value={severity} onChange={(event) => setSeverity(event.target.value)} className="h-9 rounded border px-2 text-xs"><option value="all">All severity</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select><button type="button" onClick={clearFilters} className="h-9 rounded border px-3 text-xs font-semibold">Clear</button></div>
      <div className="flex flex-wrap justify-end gap-2 border-b p-3"><button type="button" onClick={() => setSortAsc((value) => !value)} className="rounded border px-3 py-1 text-xs">Sort {sortAsc ? "oldest" : "newest"}</button><button type="button" onClick={() => csvExport(filtered)} className="rounded border px-3 py-1 text-xs font-semibold">Export CSV</button><button type="button" onClick={() => window.print()} className="rounded border px-3 py-1 text-xs font-semibold">Print / PDF</button></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-left text-sm"><thead className="border-b bg-slate-50 text-[11px] uppercase text-slate-500"><tr>{["Date & Time", "User", "Action", "Module", "Entity", "Description", "Branch", "IP Address", "Status", "Severity"].map((heading) => <th key={heading} className="px-3 py-3">{heading}</th>)}</tr></thead><tbody className="divide-y">{visible.map((record) => <tr key={record.id} onClick={() => setSelected(record)} className="cursor-pointer hover:bg-blue-50"><td className="px-3 py-3 text-xs text-slate-500">{new Date(record.created_at).toLocaleString()}</td><td className="px-3 py-3 text-xs font-medium">{record.actor_name}</td><td className="px-3 py-3 text-xs font-semibold">{record.action}</td><td className="px-3 py-3 text-xs">{record.entity_type}</td><td className="px-3 py-3 text-xs text-slate-500">{record.entity_id ?? "—"}</td><td className="max-w-[220px] truncate px-3 py-3 text-xs">{textValue(record.metadata.description) || `${record.action} on ${record.entity_type}`}</td><td className="px-3 py-3 text-xs">{textValue(record.metadata.branch_name) || textValue(record.metadata.branch_id) || "—"}</td><td className="px-3 py-3 text-xs">{textValue(record.metadata.ip_address) || "—"}</td><td className="px-3 py-3 text-xs"><span className={`rounded-full px-2 py-1 ${isFailed(record) ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{recordStatus(record)}</span></td><td className="px-3 py-3 text-xs capitalize">{recordSeverity(record)}</td></tr>)}</tbody></table>{!visible.length && <p className="p-10 text-center text-sm text-slate-500">No audit activity matches the current filters.</p>}</div>
      <div className="flex items-center justify-between border-t p-3 text-xs text-slate-500"><span>{ordered.length ? `${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, ordered.length)} of ${ordered.length}` : "0 records"}</span><div className="flex gap-2"><button type="button" disabled={page === 1} onClick={() => setPage((value) => value - 1)} className="rounded border px-2 py-1 disabled:opacity-40">Previous</button><span className="px-2 py-1">Page {page} of {totalPages}</span><button type="button" disabled={page === totalPages} onClick={() => setPage((value) => value + 1)} className="rounded border px-2 py-1 disabled:opacity-40">Next</button></div></div>
    </div>
    {selected && <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={() => setSelected(null)}><div className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-xl bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between"><div><h2 className="text-lg font-bold">Audit record details</h2><p className="mt-1 text-xs text-slate-500">{new Date(selected.created_at).toLocaleString()}</p></div><button type="button" onClick={() => setSelected(null)} className="text-xl text-slate-400">x</button></div><dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-xs text-slate-500">User</dt><dd>{selected.actor_name}</dd></div><div><dt className="text-xs text-slate-500">Action</dt><dd>{selected.action}</dd></div><div><dt className="text-xs text-slate-500">Module / entity</dt><dd>{selected.entity_type} / {selected.entity_id ?? "—"}</dd></div><div><dt className="text-xs text-slate-500">Status / severity</dt><dd className="capitalize">{recordStatus(selected)} / {recordSeverity(selected)}</dd></div><div className="sm:col-span-2"><dt className="text-xs text-slate-500">Metadata, device, browser and request context</dt><dd><pre className="mt-1 overflow-auto rounded-lg bg-slate-50 p-3 text-xs">{JSON.stringify(selected.metadata, null, 2)}</pre></dd></div></dl></div></div>}
  </section>;
}
