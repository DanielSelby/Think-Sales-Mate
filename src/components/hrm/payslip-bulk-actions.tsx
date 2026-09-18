"use client";

import * as React from "react";

type Row = { id: string; employeeName: string; periodLabel: string; netPay: number; currency: string };

export function PayslipBulkActions({ rows }: { rows: Row[] }) {
  const [selected, setSelected] = React.useState<string[]>([]);
  const visible = selected.length ? rows.filter((row) => selected.includes(row.id)) : rows;
  const toggleAll = () => setSelected(selected.length === rows.length ? [] : rows.map((row) => row.id));
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const print = () => {
    const win = window.open("", "_blank", "width=900,height=900");
    if (!win) return;
    win.document.write(`<html><head><title>Payslip Summary</title><style>body{font-family:Arial;padding:32px}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #ddd;padding:10px;text-align:left}td:last-child,th:last-child{text-align:right}</style></head><body><h1>Payroll Payslips</h1><table><thead><tr><th>Employee</th><th>Period</th><th>Net Pay</th></tr></thead><tbody>${visible.map((row) => `<tr><td>${escapeHtml(row.employeeName)}</td><td>${escapeHtml(row.periodLabel)}</td><td>${row.currency} ${row.netPay.toFixed(2)}</td></tr>`).join("")}</tbody></table></body></html>`);
    win.document.close();
    win.focus();
    win.print();
  };
  const exportCsv = () => {
    const csv = [["Employee", "Period", "Net Pay", "Currency"], ...visible.map((row) => [row.employeeName, row.periodLabel, row.netPay.toFixed(2), row.currency])]
      .map((line) => line.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "payslip-summary.csv";
    link.click();
    URL.revokeObjectURL(url);
  };
  return <div className="space-y-3"><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={toggleAll} className="rounded-md border border-ledger-200 px-3 py-2 text-xs font-medium">{selected.length === rows.length ? "Clear selection" : "Select all"}</button><button type="button" onClick={print} disabled={!visible.length} className="rounded-md border border-ledger-200 px-3 py-2 text-xs font-medium disabled:opacity-40">Print all</button><button type="button" onClick={exportCsv} disabled={!visible.length} className="rounded-md border border-ledger-200 px-3 py-2 text-xs font-medium disabled:opacity-40">Export summary</button>{selected.length > 0 && <span className="text-xs text-ledger-500">{selected.length} selected</span>}</div><div className="divide-y divide-ledger-100 dark:divide-ledger-700">{rows.map((row) => <div key={row.id} className="flex items-center gap-3 py-3"><input type="checkbox" checked={selected.includes(row.id)} onChange={() => toggle(row.id)} aria-label={`Select ${row.employeeName}`} /><a href={`/hrm/payslips/${row.id}`} className="flex flex-1 items-center justify-between gap-4 hover:underline"><div><p className="font-medium text-ink-900 dark:text-white">{row.employeeName}</p><p className="text-xs text-ledger-500">{row.periodLabel}</p></div><p className="font-medium text-ink-900 dark:text-white">{row.currency} {row.netPay.toFixed(2)}</p></a></div>)}</div></div>;
}

function escapeHtml(value: string) { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
