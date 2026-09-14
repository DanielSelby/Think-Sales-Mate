"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Download, Plus, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface HrmModuleRow {
  id: string;
  name: string;
  detail: string;
  status: string;
  meta: string;
}

interface Props {
  title: string;
  description: string;
  actionLabel: string;
  columns: [string, keyof HrmModuleRow][];
  rows: HrmModuleRow[];
}

export function HrmModuleView({ title, description, actionLabel, columns, rows }: Props) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [notice, setNotice] = useState("");
  const [records, setRecords] = useState(rows);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState({ name: "", detail: "", status: "Planned", meta: "" });
  const statuses = useMemo(() => Array.from(new Set(records.map((row) => row.status))), [records]);
  const filtered = records.filter((row) => {
    const matchesQuery = `${row.name} ${row.detail} ${row.meta}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (status === "all" || row.status === status);
  });

  function addRecord(event: FormEvent) {
    event.preventDefault();
    if (!draft.name.trim()) return;
    setRecords((current) => [{ id: `${title}-${Date.now()}`, ...draft, name: draft.name.trim() }, ...current]);
    setDraft({ name: "", detail: "", status: "Planned", meta: "" });
    setShowForm(false);
    setNotice(`${actionLabel} added successfully.`);
  }

  function exportRecords() {
    const csv = [["Name", "Details", "Status", "Updated"], ...filtered.map((row) => [row.name, row.detail, row.status, row.meta])]
      .map((row) => row.map((value) => `"${value.replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900 dark:text-white">{title}</h1>
          <p className="mt-0.5 text-sm text-ledger-500 dark:text-ledger-400">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportRecords}><Download className="h-4 w-4" /> Export</Button>
          <Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4" /> {actionLabel}</Button>
        </div>
      </div>
      {notice && <p className="rounded-md bg-signal/10 px-3 py-2 text-sm text-signal">{notice}</p>}
      {showForm && (
        <Card accent="signal">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="normal-case tracking-normal text-[13px]">Add record</CardTitle>
            <button type="button" onClick={() => setShowForm(false)} aria-label="Close"><X className="h-4 w-4" /></button>
          </CardHeader>
          <CardContent>
            <form onSubmit={addRecord} className="grid gap-3 sm:grid-cols-4">
              <input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Name" className="h-9 rounded-md border border-ledger-200 px-2 text-sm dark:border-ledger-700 dark:bg-ink-900" />
              <input value={draft.detail} onChange={(event) => setDraft({ ...draft, detail: event.target.value })} placeholder="Details" className="h-9 rounded-md border border-ledger-200 px-2 text-sm dark:border-ledger-700 dark:bg-ink-900" />
              <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })} className="h-9 rounded-md border border-ledger-200 px-2 text-sm dark:border-ledger-700 dark:bg-ink-900">
                <option>Planned</option><option>Active</option><option>Open</option><option>Pending</option><option>Completed</option>
              </select>
              <div className="flex gap-2"><input value={draft.meta} onChange={(event) => setDraft({ ...draft, meta: event.target.value })} placeholder="Notes / period" className="h-9 min-w-0 flex-1 rounded-md border border-ledger-200 px-2 text-sm dark:border-ledger-700 dark:bg-ink-900" /><Button type="submit" size="sm">Save</Button></div>
            </form>
          </CardContent>
        </Card>
      )}
      <Card accent="neutral">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="normal-case tracking-normal text-[13px] text-ink-900 dark:text-white">{filtered.length} records</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-ledger-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search..." className="h-8 w-48 rounded-md border border-ledger-200 bg-transparent pl-8 pr-2 text-sm outline-none focus:border-signal dark:border-ledger-700" />
            </label>
            <label className="flex h-8 items-center gap-1.5 rounded-md border border-ledger-200 px-2 text-sm dark:border-ledger-700">
              <SlidersHorizontal className="h-3.5 w-3.5 text-ledger-400" />
              <select value={status} onChange={(event) => setStatus(event.target.value)} className="bg-transparent outline-none">
                <option value="all">All statuses</option>
                {statuses.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border border-ledger-100 dark:border-ledger-700">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-ledger-100 bg-ledger-50/60 text-xs text-ledger-400 dark:border-ledger-700 dark:bg-white/[0.03]">
                <tr>{columns.map(([label]) => <th key={label} className="px-3 py-2 font-medium">{label}</th>)}<th className="px-3 py-2 text-right font-medium">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-ledger-100 dark:divide-ledger-700">
                {filtered.map((row) => <tr key={row.id} className="hover:bg-ledger-50/60 dark:hover:bg-white/[0.03]">
                  {columns.map(([, key]) => <td key={key} className="px-3 py-3">
                    {key === "status" ? <Badge tone="neutral">{row[key]}</Badge> : row[key]}
                  </td>)}
                  <td className="px-3 py-3 text-right"><button type="button" onClick={() => setRecords((current) => current.filter((item) => item.id !== row.id))} className="rounded-md p-1.5 text-ledger-400 hover:bg-alert-soft hover:text-alert" aria-label={`Delete ${row.name}`}><Trash2 className="h-3.5 w-3.5" /></button></td>
                </tr>)}
                {filtered.length === 0 && <tr><td colSpan={columns.length + 1} className="px-3 py-10 text-center text-sm text-ledger-400">No records match your filters.</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
