"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, Download, Eye, Pencil, Printer } from "lucide-react";
import { approvePayrollRuns, markPayrollItemsPaid } from "@/app/(dashboard)/hrm/payroll/approval-actions";

export interface PayrollRecordRow {
  id: string;
  runId: string;
  payrollDate: string;
  salaryMonth: string;
  employeeId: string;
  employeeName: string;
  branch: string;
  department: string;
  basicSalary: number;
  allowances: number;
  deductions: number;
  netSalary: number;
  status: "Paid" | "Pending" | "Partially Paid" | "Processing";
  approvalStatus: string | null;
  payslipId: string | null;
  canEdit: boolean;
}

export function PayrollRecordsTable({
  rows,
  currency,
  canManage,
}: {
  rows: PayrollRecordRow[];
  currency: string;
  canManage: boolean;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const selectedRows = useMemo(() => rows.filter((row) => selectedIds.has(row.id)), [rows, selectedIds]);
  const allSelected = rows.length > 0 && rows.every((row) => selectedIds.has(row.id));
  const selectedRunIds = Array.from(new Set(selectedRows.map((row) => row.runId)));

  function toggleSelected(id: string, selected: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
    setMessage(null);
  }

  function toggleAll(selected: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const row of rows) {
        if (selected) next.add(row.id);
        else next.delete(row.id);
      }
      return next;
    });
    setMessage(null);
  }

  function exportCsv(exportRows: PayrollRecordRow[]) {
    const headers = ["Payroll Date", "Salary Month", "Employee ID", "Employee Name", "Branch", "Department", "Basic Salary", "Allowances", "Deductions", "Net Salary", "Payment Status"];
    const csvCell = (value: string | number) => {
      let text = String(value);
      if (/^[=+\-@]/.test(text)) text = `'${text}`;
      return `"${text.replaceAll('"', '""')}"`;
    };
    const content = [headers, ...exportRows.map((row) => [
      row.payrollDate, row.salaryMonth, row.employeeId, row.employeeName, row.branch, row.department,
      row.basicSalary, row.allowances, row.deductions, row.netSalary, row.status,
    ])].map((line) => line.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `payroll-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function runBulkAction(action: "paid" | "approve") {
    setMessage(null);
    startTransition(async () => {
      const result = action === "paid"
        ? await markPayrollItemsPaid(selectedRows.filter((row) => row.status !== "Paid").map((row) => row.id))
        : await approvePayrollRuns(selectedRunIds);
      if (!result.ok) {
        setMessage(result.error ?? "The requested payroll action failed.");
        return;
      }
      setMessage(action === "paid" ? "Selected payroll items marked as paid." : "Selected payroll runs approved.");
      setSelectedIds(new Set());
    });
  }

  function runSingleAction(action: "paid" | "approve", row: PayrollRecordRow) {
    setMessage(null);
    startTransition(async () => {
      const result = action === "paid"
        ? await markPayrollItemsPaid([row.id])
        : await approvePayrollRuns([row.runId]);
      if (!result.ok) {
        setMessage(result.error ?? "The requested payroll action failed.");
        return;
      }
      setMessage(action === "paid" ? `${row.employeeName} marked as paid.` : `Payroll run for ${row.salaryMonth} approved.`);
    });
  }

  return (
    <>
      {message && (
        <p role="status" className="border-b border-slate-100 px-4 py-2 text-xs text-slate-600 dark:border-ledger-700 dark:text-ledger-300">
          {message}
        </p>
      )}
      {canManage && selectedRows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2 dark:border-ledger-700 dark:bg-ink-950">
          <span className="mr-1 text-xs font-semibold text-slate-600 dark:text-ledger-300">{selectedRows.length} selected</span>
          <button type="button" disabled={isPending} onClick={() => runBulkAction("paid")} className="inline-flex h-8 items-center gap-1 rounded-md px-3 text-xs font-semibold text-white disabled:opacity-50" style={{ backgroundColor: "var(--theme-primary)" }}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Mark paid
          </button>
          <button type="button" disabled={isPending} onClick={() => runBulkAction("approve")} className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 disabled:opacity-50 dark:border-ledger-700 dark:bg-ink-900 dark:text-ledger-200">
            <CheckCircle2 className="h-3.5 w-3.5" /> Approve runs
          </button>
          <button type="button" disabled={isPending} onClick={() => exportCsv(selectedRows)} className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 disabled:opacity-50 dark:border-ledger-700 dark:bg-ink-900 dark:text-ledger-200">
            <Download className="h-3.5 w-3.5" /> Export selected
          </button>
          <button type="button" onClick={() => setSelectedIds(new Set())} className="ml-auto text-xs text-slate-500 hover:text-slate-800 dark:text-ledger-400 dark:hover:text-white">Clear selection</button>
        </div>
      )}
      <div className="flex justify-end border-b border-slate-100 px-4 py-2 dark:border-ledger-700">
        <button type="button" onClick={() => exportCsv(rows)} disabled={rows.length === 0} className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-ledger-700 dark:bg-ink-900 dark:text-ledger-200">
          <Download className="h-3.5 w-3.5" /> Export filtered
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1250px] text-left text-xs">
          <thead className="sticky top-0 z-10 bg-[#eef6ff] text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:bg-ink-950 dark:text-ledger-400">
            <tr>
              <th className="px-3 py-3"><input type="checkbox" aria-label="Select all filtered payroll records" checked={allSelected} onChange={(event) => toggleAll(event.target.checked)} /></th>
              {["Payroll Date", "Salary Month", "Employee ID", "Employee Name", "Branch", "Department", "Basic Salary", "Allowances", "Deductions", "Net Salary", "Payment Status", "Actions"].map((heading) => <th key={heading} className="border-b border-slate-200 px-3 py-3 dark:border-ledger-700">{heading}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-ledger-700">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-blue-50/40 dark:hover:bg-slate-800/40">
                <td className="px-3 py-3"><input type="checkbox" aria-label={`Select ${row.employeeName}`} checked={selectedIds.has(row.id)} onChange={(event) => toggleSelected(row.id, event.target.checked)} /></td>
                <td className="px-3 py-3 text-slate-500">{row.payrollDate}</td>
                <td className="px-3 py-3">{row.salaryMonth}</td>
                <td className="px-3 py-3 font-mono text-[11px]">{row.employeeId}</td>
                <td className="px-3 py-3 font-semibold text-[#12345a] dark:text-white">{row.employeeName}</td>
                <td className="px-3 py-3">{row.branch}</td>
                <td className="px-3 py-3">{row.department}</td>
                <td className="px-3 py-3 font-semibold">{formatMoney(row.basicSalary, currency)}</td>
                <td className="px-3 py-3">{formatMoney(row.allowances, currency)}</td>
                <td className="px-3 py-3">{formatMoney(row.deductions, currency)}</td>
                <td className="px-3 py-3 font-bold">{formatMoney(row.netSalary, currency)}</td>
                <td className="px-3 py-3"><StatusBadge status={row.status} /></td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-1">
                    {row.payslipId && <Link href={`/hrm/payslips/${row.payslipId}`} title="View payslip and print" aria-label={`View payslip for ${row.employeeName}`} className="rounded-md border border-slate-200 p-1.5 text-[var(--theme-primary)] dark:border-ledger-700"><Eye className="h-3.5 w-3.5" /></Link>}
                    {row.payslipId && <Link href={`/hrm/payslips/${row.payslipId}`} title="Open payslip to print or download" aria-label={`Open printable payslip for ${row.employeeName}`} className="rounded-md border border-slate-200 p-1.5 text-[var(--theme-primary)] dark:border-ledger-700"><Printer className="h-3.5 w-3.5" /></Link>}
                    {canManage && row.canEdit && row.payslipId && <Link href={`/hrm/payslips/${row.payslipId}?edit=1`} title="Edit payslip" aria-label={`Edit payslip for ${row.employeeName}`} className="rounded-md border border-slate-200 p-1.5 text-[var(--theme-primary)] dark:border-ledger-700"><Pencil className="h-3.5 w-3.5" /></Link>}
                    {canManage && row.status !== "Paid" && <button type="button" disabled={isPending} onClick={() => runSingleAction("paid", row)} title="Mark as paid" aria-label={`Mark ${row.employeeName} paid`} className="rounded-md border border-slate-200 p-1.5 text-[var(--theme-primary)] disabled:opacity-50 dark:border-ledger-700"><CheckCircle2 className="h-3.5 w-3.5" /></button>}
                    {canManage && row.approvalStatus !== "approved" && <button type="button" disabled={isPending} onClick={() => runSingleAction("approve", row)} title="Approve payroll run" aria-label={`Approve payroll for ${row.employeeName}`} className="rounded-md border border-slate-200 p-1.5 text-[var(--theme-primary)] disabled:opacity-50 dark:border-ledger-700"><CheckCircle2 className="h-3.5 w-3.5" /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="p-12 text-center text-sm text-slate-500">No payroll records match the selected filters.</div>}
      </div>
    </>
  );
}

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
}

function StatusBadge({ status }: { status: PayrollRecordRow["status"] }) {
  const styles = status === "Paid"
    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
    : status === "Processing"
      ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
      : status === "Partially Paid"
        ? "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300"
        : "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300";
  return <span className={`whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-semibold ${styles}`}>{status}</span>;
}
