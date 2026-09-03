"use client";

import React, { useState } from "react";
import {
  Search,
  Download,
  Printer,
  Calendar,
  CreditCard,
  Plus,
  CheckCircle2,
  X,
  Building2,
} from "lucide-react";
import * as XLSX from "xlsx";
import { useAccountingStore } from "@/lib/accounting/accounting-store";
import type { AccountsPayableItem } from "@/types/accounting";

interface AccountsPayableTabProps {
  initialOpenBillModal?: boolean;
  onModalClosed?: () => void;
}

export function AccountsPayableTab({ initialOpenBillModal = false, onModalClosed }: AccountsPayableTabProps) {
  const {
    payables,
    bankAccounts,
    currentCurrency,
    currentBranch,
    createSupplierBill,
    recordSupplierPayment,
    scheduleSupplierPayment,
  } = useAccountingStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [agingFilter, setAgingFilter] = useState<string>("all");
  const [branchFilter, setBranchFilter] = useState<string>("all");

  // Modals
  const [isBillModalOpen, setIsBillModalOpen] = useState(initialOpenBillModal);
  const [paymentTarget, setPaymentTarget] = useState<AccountsPayableItem | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentBankId, setPaymentBankId] = useState(bankAccounts[1]?.id || bankAccounts[0]?.id || "");

  const [scheduleTarget, setScheduleTarget] = useState<AccountsPayableItem | null>(null);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleMethod, setScheduleMethod] = useState("Bank Transfer");

  const [statementTarget, setStatementTarget] = useState<AccountsPayableItem | null>(null);

  // New Bill Form State
  const [billSupplier, setBillSupplier] = useState("");
  const [billDate, setBillDate] = useState(new Date().toISOString().slice(0, 10));
  const [billDueDate, setBillDueDate] = useState("");
  const [billTotal, setBillTotal] = useState<number>(0);
  const [billBranch, setBillBranch] = useState(currentBranch || "Main Branch");

  const filteredPayables = payables.filter((p) => {
    const matchesAging = agingFilter === "all" || p.status === agingFilter;
    const matchesBranch = branchFilter === "all" || p.branch === branchFilter;
    const matchesSearch =
      p.supplierName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.billNumber.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesAging && matchesBranch && matchesSearch;
  });

  const totalOutstanding = payables.reduce((sum, p) => sum + p.outstandingAmount, 0);

  const handleCreateBill = (e: React.FormEvent) => {
    e.preventDefault();
    if (!billSupplier || billTotal <= 0) return;

    createSupplierBill({
      supplierName: billSupplier,
      billNumber: "",
      billDate,
      dueDate: billDueDate || billDate,
      totalAmount: billTotal,
      outstandingAmount: billTotal,
      branch: billBranch,
    });

    setIsBillModalOpen(false);
    if (onModalClosed) onModalClosed();
    setBillSupplier("");
    setBillTotal(0);
  };

  const handleOpenPayment = (bill: AccountsPayableItem) => {
    setPaymentTarget(bill);
    setPaymentAmount(bill.outstandingAmount);
    setPaymentBankId(bankAccounts[1]?.id || bankAccounts[0]?.id || "");
  };

  const handleConfirmPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentTarget || paymentAmount <= 0) return;
    recordSupplierPayment(paymentTarget.id, paymentAmount, paymentBankId);
    setPaymentTarget(null);
  };

  const handleConfirmSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleTarget || !scheduleDate) return;
    scheduleSupplierPayment(scheduleTarget.id, scheduleDate, scheduleMethod);
    setScheduleTarget(null);
  };

  const handleExportExcel = () => {
    const data = filteredPayables.map((p) => ({
      Supplier: p.supplierName,
      "Bill Number": p.billNumber,
      "Bill Date": p.billDate,
      "Due Date": p.dueDate,
      "Total Amount": p.totalAmount,
      "Paid Amount": p.paidAmount,
      "Outstanding Amount": p.outstandingAmount,
      "Days Outstanding": p.daysOutstanding,
      Status: p.status.toUpperCase(),
      "Scheduled Date": p.scheduledDate || "",
      Branch: p.branch,
      Currency: currentCurrency,
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Accounts Payable");
    XLSX.writeFile(workbook, `Accounts_Payable_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* ── Aging Cards Summary ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 dark:border-emerald-950/40 dark:bg-emerald-950/20">
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Current (Due Soon)</p>
          <p className="mt-1 font-display text-lg font-bold text-slate-900 dark:text-white">
            {currentCurrency} 32,800.00
          </p>
          <p className="mt-0.5 text-xs text-slate-500">61% of payables</p>
        </div>

        <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-4 dark:border-amber-950/40 dark:bg-amber-950/20">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">1 - 30 Days Past</p>
          <p className="mt-1 font-display text-lg font-bold text-slate-900 dark:text-white">
            {currentCurrency} 14,200.00
          </p>
          <p className="mt-0.5 text-xs text-slate-500">26% of payables</p>
        </div>

        <div className="rounded-2xl border border-rose-100 bg-rose-50/50 p-4 dark:border-rose-950/40 dark:bg-rose-950/20">
          <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">31 - 60 Days Past</p>
          <p className="mt-1 font-display text-lg font-bold text-slate-900 dark:text-white">
            {currentCurrency} 4,800.00
          </p>
          <p className="mt-0.5 text-xs text-slate-500">9% of payables</p>
        </div>

        <div className="rounded-2xl border border-rose-200 bg-rose-100/50 p-4 dark:border-rose-900/60 dark:bg-rose-950/40">
          <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">Over 60 Days Past</p>
          <p className="mt-1 font-display text-lg font-bold text-slate-900 dark:text-white">
            {currentCurrency} 2,410.00
          </p>
          <p className="mt-0.5 text-xs text-slate-500">4% of payables</p>
        </div>

        <div className="rounded-2xl border border-rose-100 bg-rose-50/50 p-4 dark:border-rose-950/40 dark:bg-rose-950/20">
          <p className="text-xs font-semibold text-rose-700 dark:text-rose-400">Total Payables</p>
          <p className="mt-1 font-display text-lg font-bold text-rose-600 dark:text-rose-400">
            {currentCurrency} {totalOutstanding.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">{payables.length} supplier bills</p>
        </div>
      </div>

      {/* ── Filters & Actions ── */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search supplier name or bill #..."
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
            <option value="all">All Aging</option>
            <option value="current">Current</option>
            <option value="1-30">1 - 30 Days</option>
            <option value="31-60">31 - 60 Days</option>
            <option value="over-60">Over 60 Days</option>
          </select>

          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" /> Export Excel
          </button>

          <button
            onClick={() => setIsBillModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            <Plus className="h-3.5 w-3.5" /> Create Bill
          </button>
        </div>
      </div>

      {/* ── Payables Table ── */}
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                <th className="px-4 py-3">Supplier Name</th>
                <th className="px-4 py-3">Bill Number</th>
                <th className="px-4 py-3">Bill Date</th>
                <th className="px-4 py-3">Due Date</th>
                <th className="px-4 py-3 text-right">Total ({currentCurrency})</th>
                <th className="px-4 py-3 text-right">Outstanding ({currentCurrency})</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Scheduled</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredPayables.map((bill) => (
                <tr key={bill.id} className="hover:bg-slate-50/70 transition-colors dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3 font-semibold text-slate-800 dark:text-white">
                    {bill.supplierName}
                  </td>
                  <td className="px-4 py-3 font-mono font-medium text-rose-600 dark:text-rose-400">
                    {bill.billNumber}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{bill.billDate}</td>
                  <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">{bill.dueDate}</td>
                  <td className="px-4 py-3 text-right font-display text-slate-700 dark:text-slate-300">
                    {bill.totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-right font-display font-bold text-rose-600 dark:text-rose-400">
                    {bill.outstandingAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        bill.status === "current"
                          ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400"
                          : bill.status === "1-30"
                          ? "bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400"
                          : "bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400"
                      }`}
                    >
                      {bill.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-slate-500">
                    {bill.scheduledDate ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
                        <Calendar className="h-3 w-3" /> {bill.scheduledDate}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {bill.outstandingAmount > 0 && (
                        <button
                          onClick={() => handleOpenPayment(bill)}
                          className="flex items-center gap-1 rounded-lg bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-100 dark:bg-rose-950/60 dark:text-rose-400"
                        >
                          <CreditCard className="h-3 w-3" /> Pay Bill
                        </button>
                      )}
                      <button
                        title="Schedule Payment"
                        onClick={() => {
                          setScheduleTarget(bill);
                          setScheduleDate(bill.dueDate);
                        }}
                        className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-purple-600 dark:hover:bg-slate-800"
                      >
                        <Calendar className="h-3.5 w-3.5" />
                      </button>
                      <button
                        title="Print Supplier Statement"
                        onClick={() => setStatementTarget(bill)}
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

      {/* ── Create Bill Modal ── */}
      {isBillModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Create Supplier Bill
              </h3>
              <button
                onClick={() => {
                  setIsBillModalOpen(false);
                  if (onModalClosed) onModalClosed();
                }}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateBill} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="font-medium text-slate-700 dark:text-slate-300">Supplier Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Accra Wholesalers Ltd"
                  value={billSupplier}
                  onChange={(e) => setBillSupplier(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-slate-700 dark:text-slate-300">Bill Date *</label>
                  <input
                    type="date"
                    required
                    value={billDate}
                    onChange={(e) => setBillDate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="font-medium text-slate-700 dark:text-slate-300">Due Date *</label>
                  <input
                    type="date"
                    required
                    value={billDueDate}
                    onChange={(e) => setBillDueDate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="font-medium text-slate-700 dark:text-slate-300">Total Bill Amount ({currentCurrency}) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={billTotal || ""}
                  onChange={(e) => setBillTotal(parseFloat(e.target.value) || 0)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800 font-semibold"
                />
              </div>

              <div>
                <label className="font-medium text-slate-700 dark:text-slate-300">Branch</label>
                <select
                  value={billBranch}
                  onChange={(e) => setBillBranch(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value="Main Branch">Main Branch</option>
                  <option value="Kumasi Branch">Kumasi Branch</option>
                  <option value="Takoradi Branch">Takoradi Branch</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsBillModalOpen(false);
                    if (onModalClosed) onModalClosed();
                  }}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm"
                >
                  Create Bill
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Record Payment Modal ── */}
      {paymentTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Record Supplier Payout
                </h3>
                <p className="text-xs text-slate-400">{paymentTarget.supplierName} · {paymentTarget.billNumber}</p>
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
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-rose-600 dark:border-slate-700 dark:bg-slate-800"
                />
              </div>

              <div>
                <label className="font-medium text-slate-700 dark:text-slate-300">Pay From Account</label>
                <select
                  value={paymentBankId}
                  onChange={(e) => setPaymentBankId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-rose-600 dark:border-slate-700 dark:bg-slate-800"
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
                  className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 shadow-sm"
                >
                  Disburse Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Schedule Payment Modal ── */}
      {scheduleTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Schedule Supplier Payment
              </h3>
              <button onClick={() => setScheduleTarget(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmSchedule} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300">Supplier & Bill</label>
                <p className="text-slate-900 dark:text-white font-medium">
                  {scheduleTarget.supplierName} ({scheduleTarget.billNumber}) - {currentCurrency}{" "}
                  {scheduleTarget.outstandingAmount.toLocaleString()}
                </p>
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300">Scheduled Date *</label>
                <input
                  type="date"
                  required
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-purple-600 dark:border-slate-700 dark:bg-slate-800"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300">Payment Channel</label>
                <select
                  value={scheduleMethod}
                  onChange={(e) => setScheduleMethod(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-purple-600 dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value="Bank Transfer">Bank Transfer / EFT</option>
                  <option value="Mobile Money">Mobile Money Bulk Pay</option>
                  <option value="Cheque">Cheque</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setScheduleTarget(null)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-700 shadow-sm"
                >
                  Confirm Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Supplier Statement Modal ── */}
      {statementTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Supplier Statement of Account
                </h3>
                <p className="text-xs text-slate-400">{statementTarget.supplierName}</p>
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
                  <p className="text-slate-400">Total Payable Liability</p>
                  <p className="font-display text-xl font-bold text-rose-600 dark:text-rose-400">
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
                    <th className="p-2.5">Bill #</th>
                    <th className="p-2.5 text-right">Billed</th>
                    <th className="p-2.5 text-right">Disbursed</th>
                    <th className="p-2.5 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  <tr>
                    <td className="p-2.5">{statementTarget.billDate}</td>
                    <td className="p-2.5 font-mono font-bold text-rose-600">{statementTarget.billNumber}</td>
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
