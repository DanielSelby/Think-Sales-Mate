"use client";

import React, { useState } from "react";
import {
  Search,
  Download,
  Printer,
  Mail,
  CreditCard,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  X,
  Building2,
} from "lucide-react";
import * as XLSX from "xlsx";
import { useAccountingStore } from "@/lib/accounting/accounting-store";
import type { AccountsReceivableItem } from "@/types/accounting";

export function AccountsReceivableTab() {
  const {
    receivables,
    bankAccounts,
    currentCurrency,
    currentBranch,
    recordCustomerPayment,
    sendCustomerReminder,
  } = useAccountingStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [agingFilter, setAgingFilter] = useState<string>("all");
  const [branchFilter, setBranchFilter] = useState<string>("all");

  // Modals
  const [paymentTarget, setPaymentTarget] = useState<AccountsReceivableItem | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState("Bank Transfer");
  const [paymentBankId, setPaymentBankId] = useState(bankAccounts[1]?.id || bankAccounts[0]?.id || "");

  const [reminderTarget, setReminderTarget] = useState<AccountsReceivableItem | null>(null);
  const [reminderMessage, setReminderMessage] = useState("");

  const [statementTarget, setStatementTarget] = useState<AccountsReceivableItem | null>(null);

  const filteredReceivables = receivables.filter((r) => {
    const matchesAging = agingFilter === "all" || r.status === agingFilter;
    const matchesBranch = branchFilter === "all" || r.branch === branchFilter;
    const matchesSearch =
      r.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesAging && matchesBranch && matchesSearch;
  });

  const totalOutstanding = receivables.reduce((sum, r) => sum + r.outstandingAmount, 0);

  const handleOpenPayment = (item: AccountsReceivableItem) => {
    setPaymentTarget(item);
    setPaymentAmount(item.outstandingAmount);
    setPaymentMethod("Bank Transfer");
    setPaymentBankId(bankAccounts[1]?.id || bankAccounts[0]?.id || "");
  };

  const handleConfirmPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentTarget || paymentAmount <= 0) return;
    recordCustomerPayment(paymentTarget.id, paymentAmount, paymentMethod, paymentBankId);
    setPaymentTarget(null);
  };

  const handleOpenReminder = (item: AccountsReceivableItem) => {
    setReminderTarget(item);
    setReminderMessage(
      `Dear ${item.customerName},\n\nThis is a friendly reminder that invoice ${item.invoiceNumber} with an outstanding balance of ${currentCurrency} ${item.outstandingAmount.toLocaleString()} was due on ${item.dueDate}. Please let us know if you have any questions.\n\nBest regards,\nThinkSales Pro Accounts Team`
    );
  };

  const handleSendReminder = () => {
    if (!reminderTarget) return;
    sendCustomerReminder(reminderTarget.id, reminderMessage);
    setReminderTarget(null);
  };

  const handleExportExcel = () => {
    const data = filteredReceivables.map((r) => ({
      Customer: r.customerName,
      "Invoice Number": r.invoiceNumber,
      "Issue Date": r.issueDate,
      "Due Date": r.dueDate,
      "Total Amount": r.totalAmount,
      "Paid Amount": r.paidAmount,
      "Outstanding Amount": r.outstandingAmount,
      "Days Outstanding": r.daysOutstanding,
      Status: r.status.toUpperCase(),
      Branch: r.branch,
      Currency: currentCurrency,
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Accounts Receivable");
    XLSX.writeFile(workbook, `Accounts_Receivable_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* ── Aging Cards Summary (Current, 1-30, 31-60, 61-90, 120+) ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 dark:border-emerald-950/40 dark:bg-emerald-950/20">
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Current (0-30 Days)</p>
          <p className="mt-1 font-display text-lg font-bold text-slate-900 dark:text-white">
            {currentCurrency} 42,500.00
          </p>
          <p className="mt-0.5 text-xs text-slate-500">62% of receivables</p>
        </div>

        <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-4 dark:border-amber-950/40 dark:bg-amber-950/20">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">1 - 30 Days Past</p>
          <p className="mt-1 font-display text-lg font-bold text-slate-900 dark:text-white">
            {currentCurrency} 18,200.00
          </p>
          <p className="mt-0.5 text-xs text-slate-500">27% of receivables</p>
        </div>

        <div className="rounded-2xl border border-rose-100 bg-rose-50/50 p-4 dark:border-rose-950/40 dark:bg-rose-950/20">
          <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">31 - 60 Days Past</p>
          <p className="mt-1 font-display text-lg font-bold text-slate-900 dark:text-white">
            {currentCurrency} 5,400.00
          </p>
          <p className="mt-0.5 text-xs text-slate-500">8% of receivables</p>
        </div>

        <div className="rounded-2xl border border-rose-200 bg-rose-100/50 p-4 dark:border-rose-900/60 dark:bg-rose-950/40">
          <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">61 - 90 Days Past</p>
          <p className="mt-1 font-display text-lg font-bold text-slate-900 dark:text-white">
            {currentCurrency} 2,320.00
          </p>
          <p className="mt-0.5 text-xs text-slate-500">3% of receivables</p>
        </div>

        <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4 dark:border-blue-950/40 dark:bg-blue-950/20">
          <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">Total Outstanding</p>
          <p className="mt-1 font-display text-lg font-bold text-slate-900 dark:text-white">
            {currentCurrency} {totalOutstanding.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">{receivables.length} invoices pending</p>
        </div>
      </div>

      {/* ── Filter Controls & Actions ── */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search customer name or invoice #..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-9 pr-3 py-1.5 text-xs outline-none focus:border-blue-500 focus:bg-white dark:border-slate-700 dark:bg-slate-800/60"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={agingFilter}
            onChange={(e) => setAgingFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 outline-none hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="all">All Aging Brackets</option>
            <option value="current">Current</option>
            <option value="1-30">1 - 30 Days</option>
            <option value="31-60">31 - 60 Days</option>
            <option value="61-90">61 - 90 Days</option>
          </select>

          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" /> Export Excel
          </button>
        </div>
      </div>

      {/* ── Receivables Table ── */}
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                <th className="px-4 py-3">Customer Name</th>
                <th className="px-4 py-3">Invoice #</th>
                <th className="px-4 py-3">Issue Date</th>
                <th className="px-4 py-3">Due Date</th>
                <th className="px-4 py-3 text-right">Total ({currentCurrency})</th>
                <th className="px-4 py-3 text-right">Outstanding ({currentCurrency})</th>
                <th className="px-4 py-3 text-center">Days Past</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredReceivables.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/70 transition-colors dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3 font-semibold text-slate-800 dark:text-white">
                    {item.customerName}
                  </td>
                  <td className="px-4 py-3 font-mono font-medium text-blue-600 dark:text-blue-400">
                    {item.invoiceNumber}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{item.issueDate}</td>
                  <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">{item.dueDate}</td>
                  <td className="px-4 py-3 text-right font-display text-slate-700 dark:text-slate-300">
                    {item.totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-right font-display font-bold text-slate-900 dark:text-white">
                    {item.outstandingAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-center font-mono font-semibold">
                    <span className={item.daysOutstanding > 30 ? "text-rose-600" : "text-slate-600"}>
                      {item.daysOutstanding}d
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        item.status === "current"
                          ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400"
                          : item.status === "1-30"
                          ? "bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400"
                          : "bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400"
                      }`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {item.outstandingAmount > 0 && (
                        <button
                          onClick={() => handleOpenPayment(item)}
                          className="flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-600 hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-400"
                        >
                          <CreditCard className="h-3 w-3" /> Record Payment
                        </button>
                      )}
                      <button
                        title="Send Payment Reminder"
                        onClick={() => handleOpenReminder(item)}
                        className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-amber-600 dark:hover:bg-slate-800"
                      >
                        <Mail className="h-3.5 w-3.5" />
                      </button>
                      <button
                        title="Print Statement"
                        onClick={() => setStatementTarget(item)}
                        className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-800"
                      >
                        <Printer className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Record Payment Modal ── */}
      {paymentTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Record Customer Payment
                </h3>
                <p className="text-xs text-slate-400">{paymentTarget.customerName} · {paymentTarget.invoiceNumber}</p>
              </div>
              <button onClick={() => setPaymentTarget(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmPayment} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="font-medium text-slate-700 dark:text-slate-300">Payment Amount ({currentCurrency}) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  max={paymentTarget.outstandingAmount}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Total outstanding: {currentCurrency} {paymentTarget.outstandingAmount.toLocaleString()}
                </p>
              </div>

              <div>
                <label className="font-medium text-slate-700 dark:text-slate-300">Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Cash">Cash</option>
                  <option value="Mobile Money">Mobile Money (MTN / Telecel)</option>
                  <option value="Cheque">Cheque</option>
                </select>
              </div>

              <div>
                <label className="font-medium text-slate-700 dark:text-slate-300">Deposit Account</label>
                <select
                  value={paymentBankId}
                  onChange={(e) => setPaymentBankId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800"
                >
                  {bankAccounts.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.bankName})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setPaymentTarget(null)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm"
                >
                  Confirm Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Send Reminder Modal ── */}
      {reminderTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Send Payment Reminder
              </h3>
              <button onClick={() => setReminderTarget(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300">Recipient</label>
                <p className="font-medium text-slate-900 dark:text-white">{reminderTarget.customerName}</p>
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300">Reminder Message</label>
                <textarea
                  rows={5}
                  value={reminderMessage}
                  onChange={(e) => setReminderMessage(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800 font-mono leading-relaxed"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setReminderTarget(null)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSendReminder}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm"
                >
                  Send Reminder
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Customer Statement Modal ── */}
      {statementTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Customer Statement of Account
                </h3>
                <p className="text-xs text-slate-400">{statementTarget.customerName}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white"
                >
                  <Printer className="h-3.5 w-3.5" /> Print
                </button>
                <button onClick={() => setStatementTarget(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              <div className="rounded-xl bg-slate-50 p-4 border border-slate-100 dark:bg-slate-800/60 dark:border-slate-700 flex justify-between items-center">
                <div>
                  <p className="text-slate-400">Total Outstanding Balance</p>
                  <p className="font-display text-xl font-bold text-blue-600 dark:text-blue-400">
                    {currentCurrency} {statementTarget.outstandingAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-slate-400">Statement Date</p>
                  <p className="font-medium text-slate-700 dark:text-slate-300">{new Date().toISOString().slice(0, 10)}</p>
                </div>
              </div>

              <table className="w-full text-left text-xs border border-slate-200 rounded-xl overflow-hidden">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold dark:bg-slate-800">
                  <tr>
                    <th className="p-2.5">Date</th>
                    <th className="p-2.5">Invoice #</th>
                    <th className="p-2.5 text-right">Invoiced</th>
                    <th className="p-2.5 text-right">Paid</th>
                    <th className="p-2.5 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  <tr>
                    <td className="p-2.5">{statementTarget.issueDate}</td>
                    <td className="p-2.5 font-mono font-bold text-blue-600">{statementTarget.invoiceNumber}</td>
                    <td className="p-2.5 text-right font-mono">{statementTarget.totalAmount.toLocaleString()}</td>
                    <td className="p-2.5 text-right font-mono text-emerald-600">{statementTarget.paidAmount.toLocaleString()}</td>
                    <td className="p-2.5 text-right font-mono font-bold">{statementTarget.outstandingAmount.toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
