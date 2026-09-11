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

type Category = "All" | "Security" | "Data" | "User";

function category(record: AuditRecord): Exclude<Category, "All"> {
  if (/login|logout|password|security|permission|failed/i.test(record.action)) return "Security";
  if (/user|member|profile|role/i.test(record.action) || /user|member/i.test(record.entity_type)) return "User";
  return "Data";
}

function exportCsv(records: AuditRecord[]) {
  const rows = [
    ["Time", "User", "Action", "Module", "Entity", "Record ID"],
    ...records.map((record) => [
      new Date(record.created_at).toISOString(),
      record.actor_name,
      record.action,
      record.entity_type,
      record.entity_type,
      record.entity_id ?? "",
    ]),
  ];
  const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function AuditCenter({ records }: { records: AuditRecord[] }) {
  const [tab, setTab] = useState<Category>("All");
  const [query, setQuery] = useState("");
  const [module, setModule] = useState("all");
  const [selected, setSelected] = useState<AuditRecord | null>(null);
  const modules = useMemo(() => [...new Set(records.map((record) => record.entity_type))].sort(), [records]);
  const filtered = useMemo(() => records.filter((record) => {
    const haystack = `${record.actor_name} ${record.action} ${record.entity_type} ${record.entity_id ?? ""}`.toLowerCase();
    return (tab === "All" || category(record) === tab)
      && (module === "all" || record.entity_type === module)
      && (!query.trim() || haystack.includes(query.trim().toLowerCase()));
  }), [module, query, records, tab]);
  const today = records.filter((record) => new Date(record.created_at).toDateString() === new Date().toDateString()).length;
  const security = records.filter((record) => category(record) === "Security").length;
  const activeUsers = new Set(records.map((record) => record.actor_id).filter(Boolean)).size;

  return <section className="space-y-5">
    <div><h1 className="text-2xl font-bold text-slate-900">Advanced Audit Center</h1><p className="mt-1 text-sm text-slate-500">Review organization activity and security events from the append-only audit trail.</p></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Total events", records.length], ["Events today", today], ["Active users", activeUsers], ["Security events", security]].map(([label, value]) => <div key={String(label)} className="rounded-xl border bg-white p-4 shadow-sm"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></div>)}</div>
    <div className="rounded-xl border bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b p-4">{(["All", "Security", "Data", "User"] as Category[]).map((item) => <button type="button" key={item} onClick={() => setTab(item)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${tab === item ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100"}`}>{item}</button>)}<div className="ml-auto flex flex-wrap gap-2"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search audit records..." className="h-9 rounded-lg border px-3 text-xs" /><select value={module} onChange={(event) => setModule(event.target.value)} className="h-9 rounded-lg border px-2 text-xs"><option value="all">All modules</option>{modules.map((item) => <option key={item} value={item}>{item}</option>)}</select><button type="button" onClick={() => exportCsv(filtered)} className="h-9 rounded-lg border px-3 text-xs font-semibold">Export CSV</button><button type="button" onClick={() => window.print()} className="h-9 rounded-lg border px-3 text-xs font-semibold">Print / PDF</button></div></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b bg-slate-50 text-[11px] uppercase text-slate-500"><tr>{["Time", "User", "Action", "Module", "Record", "Category"].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr></thead><tbody className="divide-y">{filtered.map((record) => <tr key={record.id} onClick={() => setSelected(record)} className="cursor-pointer hover:bg-blue-50"><td className="px-4 py-3 text-xs text-slate-500">{new Date(record.created_at).toLocaleString()}</td><td className="px-4 py-3 font-medium">{record.actor_name}</td><td className="px-4 py-3">{record.action}</td><td className="px-4 py-3 text-slate-500">{record.entity_type}</td><td className="px-4 py-3 text-xs text-slate-500">{record.entity_id ?? "—"}</td><td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-[11px]">{category(record)}</span></td></tr>)}</tbody></table>{filtered.length === 0 && <p className="p-10 text-center text-sm text-slate-500">No audit records match the current filters.</p>}</div>
    </div>
    {selected && <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={() => setSelected(null)}><div className="max-h-[80vh] w-full max-w-xl overflow-auto rounded-xl bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between"><div><h2 className="text-lg font-bold">Audit record details</h2><p className="mt-1 text-xs text-slate-500">{new Date(selected.created_at).toLocaleString()}</p></div><button type="button" onClick={() => setSelected(null)} className="text-xl text-slate-400">×</button></div><dl className="mt-5 grid gap-3 text-sm"><div><dt className="text-xs text-slate-500">User</dt><dd>{selected.actor_name}</dd></div><div><dt className="text-xs text-slate-500">Action</dt><dd>{selected.action}</dd></div><div><dt className="text-xs text-slate-500">Module</dt><dd>{selected.entity_type}</dd></div><div><dt className="text-xs text-slate-500">Metadata</dt><dd><pre className="mt-1 overflow-auto rounded-lg bg-slate-50 p-3 text-xs">{JSON.stringify(selected.metadata, null, 2)}</pre></dd></div></dl></div></div>}
  </section>;
}
