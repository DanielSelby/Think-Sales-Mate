"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Download, Printer, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/sales/format";

export interface ReturnReportRow {
  returnId: string;
  returnNumber: number;
  date: string;
  branch: string;
  product: string;
  sku: string;
  quantity: number;
  unitCost: number;
  value: number;
  reason: string;
  condition: string;
  supplier: string;
  status: string;
  consolidation: string | null;
  supplierReturnNumber: string | null;
}

function countBy(rows: ReturnReportRow[], key: (row: ReturnReportRow) => string) {
  const result = new Map<string, number>();
  for (const row of rows) result.set(key(row), (result.get(key(row)) ?? 0) + row.quantity);
  return [...result].sort((a, b) => b[1] - a[1]).slice(0, 6);
}

function BarList({ title, data }: { title: string; data: [string, number][] }) {
  const max = Math.max(1, ...data.map(([, value]) => value));
  return (
    <Card className="border-slate-200 shadow-sm"><CardContent className="space-y-4 p-4">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {data.map(([label, value]) => <div key={label} className="space-y-1">
        <div className="flex items-center justify-between gap-3 text-[11px]"><span className="truncate text-slate-600">{label}</span><span className="font-semibold tabular-nums text-slate-800">{value}</span></div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.max(3, value / max * 100)}%` }} /></div>
      </div>)}
      {!data.length && <p className="text-xs text-slate-500">No return activity to report.</p>}
    </CardContent></Card>
  );
}

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export function ReturnProductsReport({ rows, currency, acceptedQty, rejectedQty }: {
  rows: ReturnReportRow[];
  currency: string;
  acceptedQty: number;
  rejectedQty: number;
}) {
  const [query, setQuery] = React.useState("");
  const filtered = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? rows.filter((row) => `${row.returnNumber} ${row.branch} ${row.product} ${row.sku} ${row.supplier} ${row.reason} ${row.condition} ${row.status}`.toLowerCase().includes(term)) : rows;
  }, [rows, query]);
  const pendingRows = rows.filter((row) => !["completed", "supplier_return_created"].includes(row.status));
  const totalValue = rows.reduce((sum, row) => sum + row.value, 0);
  const decidedQty = acceptedQty + rejectedQty;
  const acceptanceRate = decidedQty > 0 ? Math.round(acceptedQty / decidedQty * 100) : 0;

  function exportCsv() {
    const headers = ["Return Number", "Date", "Branch", "Product", "SKU", "Quantity", "Unit Cost", "Return Value", "Reason", "Condition", "Supplier", "Status", "Consolidation", "Supplier Return Number"];
    const body = filtered.map((row) => [
      `RET-${String(row.returnNumber).padStart(6, "0")}`, row.date, row.branch, row.product, row.sku,
      row.quantity, row.unitCost, row.value, row.reason, row.condition, row.supplier, row.status, row.consolidation ?? "", row.supplierReturnNumber ?? "",
    ]);
    const blob = new Blob([[headers, ...body].map((line) => line.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "return-products-report.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="return-products-report space-y-5 px-3 py-5 sm:px-5 lg:px-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><Link href="/inventory/return-products" className="mb-2 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-blue-700"><ArrowLeft className="h-3.5 w-3.5" />Return Products</Link><h1 className="text-2xl font-bold tracking-tight text-slate-900">Return Products Report</h1><p className="mt-1 text-sm text-slate-500">Inventory return volumes, conditions, supplier matching, and value.</p></div>
        <div className="flex gap-2"><Button variant="outline" onClick={exportCsv} className="gap-2"><Download className="h-4 w-4" />Export CSV</Button><Button variant="outline" onClick={() => window.print()} className="gap-2"><Printer className="h-4 w-4" />Print</Button></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[["Return Lines", rows.length.toLocaleString()], ["Returned Units", rows.reduce((sum, row) => sum + row.quantity, 0).toLocaleString()], ["Return Value", formatCurrency(totalValue, currency)], ["Supplier Acceptance", decidedQty ? `${acceptanceRate}%` : "No outcomes yet"]].map(([title, value]) => <Card key={title} className="border-slate-200 shadow-sm"><CardContent className="p-4"><p className="text-xs text-slate-500">{title}</p><p className="mt-2 text-xl font-bold text-slate-900">{value}</p></CardContent></Card>)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        <BarList title="Returns by Branch (units)" data={countBy(rows, (row) => row.branch)} />
        <BarList title="Returns by Supplier (units)" data={countBy(rows.filter((row) => row.supplier !== "Pending identification"), (row) => row.supplier)} />
        <BarList title="Returns by Product (units)" data={countBy(rows, (row) => row.product)} />
        <BarList title="Returns by Reason (units)" data={countBy(rows, (row) => row.reason)} />
        <BarList title="Returns by Condition (units)" data={countBy(rows, (row) => row.condition)} />
        <Card className="border-slate-200 shadow-sm"><CardContent className="space-y-3 p-4"><h2 className="text-sm font-semibold text-slate-900">Supplier outcomes</h2><div className="flex items-center justify-between text-xs"><span className="text-slate-500">Accepted units</span><span className="font-semibold text-emerald-700">{acceptedQty}</span></div><div className="flex items-center justify-between text-xs"><span className="text-slate-500">Rejected units</span><span className="font-semibold text-rose-700">{rejectedQty}</span></div><div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs"><span className="text-slate-500">Pending returns</span><span className="font-semibold text-amber-700">{pendingRows.length}</span></div></CardContent></Card>
      </div>
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-sm font-semibold text-slate-900">Return Detail</h2><p className="text-[11px] text-slate-500">Showing {filtered.length} actual inventory-return item records.</p></div><label className="relative w-full sm:max-w-xs"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search return report…" className="pl-9" /></label></div>
          <div className="overflow-x-auto rounded-lg border border-slate-200"><table className="w-full min-w-[1050px] text-left text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Return / Date</th><th className="px-3 py-3">Branch</th><th className="px-3 py-3">Product / SKU</th><th className="px-3 py-3">Qty</th><th className="px-3 py-3">Unit Cost</th><th className="px-3 py-3">Value</th><th className="px-3 py-3">Reason / Condition</th><th className="px-3 py-3">Supplier</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Consolidation</th><th className="px-3 py-3">Supplier Return</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{filtered.map((row) => <tr key={`${row.returnId}:${row.product}:${row.sku}`}><td className="px-3 py-3"><Link href={`/inventory/return-products/${row.returnId}`} className="font-semibold text-blue-700 hover:underline">RET-{String(row.returnNumber).padStart(6, "0")}</Link><div className="text-[10px] text-slate-500">{row.date}</div></td><td className="px-3 py-3">{row.branch}</td><td className="px-3 py-3"><span className="font-medium">{row.product}</span><div className="text-[10px] text-slate-500">{row.sku}</div></td><td className="px-3 py-3 tabular-nums">{row.quantity}</td><td className="px-3 py-3">{formatCurrency(row.unitCost, currency)}</td><td className="px-3 py-3">{formatCurrency(row.value, currency)}</td><td className="px-3 py-3">{row.reason}<div className="text-[10px] text-slate-500">{row.condition}</div></td><td className="px-3 py-3">{row.supplier}</td><td className="px-3 py-3 capitalize">{row.status.replaceAll("_", " ")}</td><td className="px-3 py-3">{row.consolidation ?? "—"}</td><td className="px-3 py-3">{row.supplierReturnNumber ?? "—"}</td></tr>)}
              {!filtered.length && <tr><td colSpan={11} className="p-8 text-center text-slate-500">No return items to display.</td></tr>}
            </tbody>
          </table></div>
        </CardContent>
      </Card>
    </div>
  );
}
