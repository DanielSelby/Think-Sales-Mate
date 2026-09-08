"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, CheckCircle2, ChevronRight, ClipboardList, FileText, Filter, RefreshCw, Search, ShoppingBag, Truck, X, XCircle } from "lucide-react";
import { decideApproval, markApprovalDone, type ApprovalDecisionInput } from "@/app/(dashboard)/approvals/actions";

export type ApprovalRow = {
  id: string;
  type: ApprovalDecisionInput["type"];
  document: string;
  title: string;
  requester: string;
  branch: string;
  date: string;
  amount: number | null;
  status: string;
  priority: string;
  href: string;
};

const labels = { stock_request: "Stock Request", expense: "Expense", purchase_return: "Purchase Return", customer_order: "Customer Order" };
const icons = { stock_request: Truck, expense: FileText, purchase_return: ShoppingBag, customer_order: ShoppingBag };

export function ApprovalCenter({ rows, approvedRows, historyRows, currency }: { rows: ApprovalRow[]; approvedRows: ApprovalRow[]; historyRows: ApprovalRow[]; currency: string }) {
  const [tab, setTab] = useState<"pending" | "approved" | "history">("pending");
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<ApprovalRow | null>(null);
  const [reason, setReason] = useState("");

  const sourceRows = tab === "pending" ? rows : tab === "approved" ? approvedRows : historyRows;
  const filtered = useMemo(() => sourceRows.filter((row) =>
    (type === "all" || row.type === type) &&
    `${row.document} ${row.title} ${row.requester} ${row.branch}`.toLowerCase().includes(query.toLowerCase())
  ), [sourceRows, query, type]);
  const selectedRows = filtered.filter((row) => selected.includes(row.id));
  const formatMoney = (value: number | null) => value == null ? "—" : `${currency} ${value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  async function decide(row: ApprovalRow, decision: "approved" | "rejected", rejectionReason?: string, reload = true) {
    setBusy(row.id);
    const result = await decideApproval({ type: row.type, id: row.id, decision, reason: rejectionReason });
    setBusy(null);
    if (result.error) setNotice(result.error);
    else {
      setNotice(`${row.document} ${decision}. Refreshing…`);
      setSelected((current) => current.filter((id) => id !== row.id));
      if (reload) window.location.reload();
    }
  }

  async function approveSelected() {
    if (tab !== "pending") return;
    if (!selectedRows.length) return;
    setBusy("bulk");
    for (const row of selectedRows) {
      const result = await decideApproval({ type: row.type, id: row.id, decision: "approved" });
      if (result.error) {
        setNotice(`${row.document}: ${result.error}`);
        setBusy(null);
        return;
      }

    }
    window.location.reload();
  }

  async function complete(row: ApprovalRow) {
    setBusy(row.id);
    const result = await markApprovalDone({ type: row.type, id: row.id });
    setBusy(null);
    if (result.error) setNotice(result.error);
    else {
      setNotice(`${row.document} moved to approval history.`);
      window.location.reload();
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><div className="mb-1 text-xs text-ledger-400">Home <span className="mx-1">›</span> Approval Center</div><h1 className="font-display text-2xl font-bold text-ink-900 dark:text-white">Approval Center</h1><p className="text-sm text-ledger-500">Review and approve pending requests across your organization.</p></div>
        <div className="flex items-center gap-2 rounded-full bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700"><ClipboardList className="h-4 w-4" /> {rows.length} Pending</div>
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-ledger-100 bg-white p-2 shadow-card dark:border-ledger-700 dark:bg-ink-900">
        {([
          ["pending", "Pending approvals", rows.length],
          ["approved", "Approved list", approvedRows.length],
          ["history", "Approval history", historyRows.length],
        ] as const).map(([key, label, count]) => (
          <button key={key} onClick={() => { setTab(key); setSelected([]); setType("all"); }} className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${tab === key ? "bg-brand-600 text-white" : "text-ledger-600 hover:bg-ledger-50 dark:text-ledger-300 dark:hover:bg-white/[0.05]"}`}>
            {label} <span className="ml-1 text-xs opacity-75">({count})</span>
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(["all", "stock_request", "expense", "purchase_return", "customer_order"] as const).map((key) => {
          const count = key === "all" ? rows.length : rows.filter((row) => row.type === key).length;
          return <button key={key} onClick={() => setType(key)} className={`rounded-2xl border p-4 text-left shadow-card transition ${type === key ? "border-brand-300 ring-2 ring-brand-100" : "border-ledger-100 bg-white dark:border-ledger-700 dark:bg-ink-900"}`}><div className="flex items-center justify-between text-xs text-ledger-500"><span>{key === "all" ? "All Requests" : labels[key]}</span><ChevronRight className="h-4 w-4" /></div><p className="mt-2 text-2xl font-bold text-ink-900 dark:text-white">{count}</p><p className="mt-1 text-xs text-ledger-400">Pending approval</p></button>;
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
        <section className="overflow-hidden rounded-2xl border border-ledger-100 bg-white shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <div className="flex flex-wrap gap-3 border-b border-ledger-100 p-4 dark:border-ledger-700">
            <div className="relative min-w-[240px] flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-ledger-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search document, requester, branch..." className="w-full rounded-xl border border-ledger-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-500 dark:border-ledger-700 dark:bg-ink-950" /></div>
            <button onClick={() => { setQuery(""); setType("all"); }} className="inline-flex items-center gap-2 rounded-xl border border-ledger-200 px-3 py-2 text-xs font-semibold text-ledger-600"><RefreshCw className="h-4 w-4" /> Clear filters</button>
            {tab === "pending" && <button disabled={!selected.length || !!busy} onClick={approveSelected} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"><Check className="h-4 w-4" /> Approve selected</button>}
          </div>
          {notice && <div className="border-b border-ledger-100 bg-brand-50 px-4 py-3 text-sm text-brand-800">{notice}</div>}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-ledger-50 text-[10px] uppercase tracking-wide text-ledger-500 dark:bg-ink-950"><tr><th className="w-10 px-4 py-3"><input type="checkbox" checked={filtered.length > 0 && selected.length === filtered.length} onChange={() => setSelected(selected.length === filtered.length ? [] : filtered.map((row) => row.id))} /></th><th className="px-3 py-3">Document</th><th className="px-3 py-3">Requester</th><th className="px-3 py-3">Branch</th><th className="px-3 py-3">Date</th><th className="px-3 py-3">Amount</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Actions</th></tr></thead>
              <tbody className="divide-y divide-ledger-100 dark:divide-ledger-700">{filtered.map((row) => { const Icon = icons[row.type]; return <tr key={row.id} className="hover:bg-ledger-50/60 dark:hover:bg-white/[0.03]"><td className="px-4 py-4"><input type="checkbox" checked={selected.includes(row.id)} onChange={() => toggle(row.id)} /></td><td className="px-3 py-4"><div className="flex items-center gap-2"><span className="rounded-lg bg-brand-50 p-2 text-brand-600"><Icon className="h-4 w-4" /></span><div><Link href={row.href} className="font-semibold text-ink-900 hover:text-brand-600 dark:text-white">{row.document}</Link><p className="text-xs text-ledger-400">{row.title}</p></div></div></td><td className="px-3 py-4 text-xs font-medium">{row.requester}</td><td className="px-3 py-4 text-xs">{row.branch}</td><td className="px-3 py-4 text-xs text-ledger-500">{new Date(row.date).toLocaleDateString()}</td><td className="px-3 py-4 text-xs font-semibold">{formatMoney(row.amount)}</td><td className="px-3 py-4"><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${row.priority === "high" || row.priority === "urgent" ? "bg-red-50 text-red-600" : tab === "approved" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{tab === "approved" ? "Approved" : tab === "history" ? "Completed" : row.priority}</span></td><td className="px-3 py-4"><div className="flex items-center gap-1">{tab === "pending" ? <><button disabled={!!busy} onClick={() => decide(row, "approved")} title="Approve" className="rounded-lg p-2 text-emerald-600 hover:bg-emerald-50 disabled:opacity-40"><CheckCircle2 className="h-4 w-4" /></button><button disabled={!!busy} onClick={() => setRejecting(row)} title="Reject" className="rounded-lg p-2 text-red-500 hover:bg-red-50 disabled:opacity-40"><XCircle className="h-4 w-4" /></button></> : tab === "approved" ? <button disabled={!!busy} onClick={() => void complete(row)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40">Done</button> : <span className="text-xs text-ledger-400">Completed</span>}</div></td></tr>; })}</tbody></table>
          </div>
          {!filtered.length && <div className="p-12 text-center text-sm text-ledger-500"><Filter className="mx-auto mb-2 h-6 w-6 text-ledger-300" />No pending requests match your filters.</div>}
        </section>
        <aside className="space-y-4">
          <div className="rounded-2xl border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900"><h2 className="font-display font-bold text-ink-900 dark:text-white">Quick Actions</h2><div className="mt-4 space-y-2"><button disabled={!selected.length} onClick={approveSelected} className="flex w-full items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2.5 text-left text-xs font-semibold text-white disabled:opacity-40"><Check className="h-4 w-4" /> Approve selected</button><button disabled={!selected.length} onClick={() => setRejecting(selectedRows[0] ?? null)} className="flex w-full items-center gap-2 rounded-xl border border-red-200 px-3 py-2.5 text-left text-xs font-semibold text-red-600 disabled:opacity-40"><X className="h-4 w-4" /> Reject selected</button><button onClick={() => { setQuery(""); setType("all"); }} className="flex w-full items-center gap-2 rounded-xl border border-ledger-200 px-3 py-2.5 text-left text-xs font-semibold text-ledger-600"><Filter className="h-4 w-4" /> View all requests</button></div></div>
          <div className="rounded-2xl border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900"><h2 className="font-display font-bold text-ink-900 dark:text-white">Approval Workflow</h2><div className="mt-4 space-y-4 text-xs"><div className="flex gap-3"><span className="rounded-full bg-emerald-100 p-2 text-emerald-700">1</span><div><p className="font-semibold">Request created</p><p className="text-ledger-400">Submitted by a team member</p></div></div><div className="flex gap-3"><span className="rounded-full bg-amber-100 p-2 text-amber-700">2</span><div><p className="font-semibold">Pending approval</p><p className="text-ledger-400">Awaiting manager decision</p></div></div><div className="flex gap-3"><span className="rounded-full bg-blue-100 p-2 text-blue-700">3</span><div><p className="font-semibold">Approved or rejected</p><p className="text-ledger-400">Decision is recorded in the audit trail</p></div></div></div></div>
        </aside>
      </div>
      {rejecting && <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 p-4"><div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-ink-900"><h2 className="font-display text-lg font-bold">Reject {rejecting.document}</h2><p className="mt-1 text-sm text-ledger-500">Tell the requester why this approval was rejected.</p><textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={4} className="mt-4 w-full rounded-xl border border-ledger-200 p-3 text-sm outline-none dark:border-ledger-700 dark:bg-ink-950" placeholder="Rejection reason" /><div className="mt-4 flex justify-end gap-2"><button onClick={() => { setRejecting(null); setReason(""); }} className="rounded-xl border border-ledger-200 px-4 py-2 text-sm">Cancel</button><button disabled={!reason.trim() || !!busy} onClick={() => { const row = rejecting; setRejecting(null); const value = reason; setReason(""); void decide(row, "rejected", value); }} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Reject request</button></div></div></div>}
    </div>
  );
}
