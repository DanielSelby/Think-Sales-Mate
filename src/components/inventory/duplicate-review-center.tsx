"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, Barcode, GitMerge, Search, Tag } from "lucide-react";

type ReviewRow = {
  id: string;
  name: string;
  sku: string;
  brand: string | null;
  category: string | null;
  barcode: string | null;
  score: number;
  type: "exact" | "similar" | "barcode" | "brand_model";
};

const tabs = [
  { key: "exact", label: "Exact Duplicates" },
  { key: "similar", label: "Similar Products" },
  { key: "barcode", label: "Duplicate Barcodes" },
  { key: "brand_model", label: "Brand + Model" },
] as const;

export function DuplicateReviewCenter({ rows }: { rows: ReviewRow[] }) {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]["key"]>("exact");
  const [query, setQuery] = useState("");
  const visibleRows = useMemo(() => rows.filter((row) =>
    row.type === activeTab &&
    `${row.name} ${row.sku} ${row.brand ?? ""} ${row.category ?? ""} ${row.barcode ?? ""}`.toLowerCase().includes(query.toLowerCase())
  ), [activeTab, query, rows]);

  return <div className="overflow-hidden rounded-2xl border border-ledger-100 bg-white shadow-card dark:border-ledger-700 dark:bg-ink-900">
    <div className="flex flex-wrap gap-2 border-b border-ledger-100 p-4 text-xs dark:border-ledger-700">
      {tabs.map((tab) => {
        const count = rows.filter((row) => row.type === tab.key).length;
        return <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} className={`rounded-lg px-3 py-2 font-semibold transition ${activeTab === tab.key ? "bg-brand-50 text-brand-700 ring-1 ring-brand-200" : "text-ledger-500 hover:bg-ledger-50"}`}>{tab.label} ({count})</button>;
      })}
    </div>
    <div className="border-b border-ledger-100 p-4 dark:border-ledger-700">
      <div className="relative max-w-md"><Search className="absolute left-3 top-2.5 h-4 w-4 text-ledger-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this review category..." className="w-full rounded-xl border border-ledger-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-500 dark:border-ledger-700 dark:bg-ink-950" /></div>
    </div>
    <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-ledger-50 text-[10px] uppercase tracking-wide text-ledger-500 dark:bg-ink-950"><tr><th className="px-5 py-3">Products</th><th className="px-3 py-3">SKU</th><th className="px-3 py-3">Brand</th><th className="px-3 py-3">Similarity</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Actions</th></tr></thead><tbody className="divide-y divide-ledger-100 dark:divide-ledger-700">{visibleRows.map((row) => <tr key={row.id}><td className="px-5 py-4 font-semibold">{row.name}</td><td className="px-3 py-4 text-xs text-ledger-500">{row.sku}</td><td className="px-3 py-4 text-xs">{row.brand ?? "—"}</td><td className="px-3 py-4"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${row.score === 100 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{row.score}%</span></td><td className="px-3 py-4 text-xs text-ledger-500">{row.type === "barcode" ? `Barcode: ${row.barcode}` : row.type === "brand_model" ? "Brand + model candidate" : "Needs review"}</td><td className="px-3 py-4"><div className="flex gap-2"><Link href={`/inventory/merge?ids=${row.id.split("-")[0]}`} className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-700"><GitMerge className="h-3 w-3" /> Merge</Link><button type="button" onClick={() => setActiveTab(activeTab)} className="rounded-lg border border-ledger-200 px-2 py-1 text-xs text-ledger-500">Ignore</button></div></td></tr>)}</tbody></table></div>
    {!visibleRows.length && <div className="p-12 text-center text-sm text-ledger-500"><Tag className="mx-auto mb-2 h-6 w-6 text-ledger-300" />No {tabs.find((tab) => tab.key === activeTab)?.label.toLowerCase()} found.</div>}
  </div>;
}

export function DuplicateReviewSummary({ rows }: { rows: ReviewRow[] }) {
  const summaries = [
    { icon: AlertTriangle, label: "Exact duplicates", key: "exact", color: "bg-red-50 text-red-600" },
    { icon: Search, label: "Similar products", key: "similar", color: "bg-amber-50 text-amber-600" },
    { icon: Barcode, label: "Duplicate barcodes", key: "barcode", color: "bg-purple-50 text-purple-600" },
    { icon: Tag, label: "Brand + model", key: "brand_model", color: "bg-blue-50 text-blue-600" },
  ] as const;
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{summaries.map(({ icon: Icon, label, key, color }) => <div key={key} className="rounded-2xl border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900"><div className="flex items-center gap-3"><span className={`rounded-xl p-2 ${color}`}><Icon className="h-5 w-5" /></span><div><p className="text-xs text-ledger-500">{label}</p><p className="text-2xl font-bold">{rows.filter((row) => row.type === key).length}</p></div></div></div>)}</div>;
}
