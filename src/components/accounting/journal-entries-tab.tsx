"use client";

import React, { useState } from "react";
import {
  Plus,
  Search,
  Printer,
  Download,
  RotateCcw,
  CheckCircle2,
  FileText,
  AlertCircle,
  X,
  Trash2,
  Calendar,
  Building2,
} from "lucide-react";
import * as XLSX from "xlsx";
import { useAccountingStore } from "@/lib/accounting/accounting-store";
import type { JournalEntry, JournalLineItem } from "@/types/accounting";

interface JournalEntriesTabProps {
  initialOpenNewModal?: boolean;
  onModalClosed?: () => void;
}

export function JournalEntriesTab({ initialOpenNewModal = false, onModalClosed }: JournalEntriesTabProps) {
  const {
    journalEntries,
    accounts,
    currentCurrency,
    currentBranch,
    createJournalEntry,
    postJournalEntry,
    reverseJournalEntry,
  } = useAccountingStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [branchFilter, setBranchFilter] = useState<string>("all");

  // Modals
  const [isNewModalOpen, setIsNewModalOpen] = useState(initialOpenNewModal);
  const [viewVoucher, setViewVoucher] = useState<JournalEntry | null>(null);
  const [reverseTarget, setReverseTarget] = useState<JournalEntry | null>(null);
  const [reverseReason, setReverseReason] = useState("");

  // New Journal Entry Form State
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split("T")[0]);
  const [entryBranch, setEntryBranch] = useState(currentBranch || "Main Branch");
  const [entryRef, setEntryRef] = useState("");
  const [entryDesc, setEntryDesc] = useState("");
  const [lines, setLines] = useState<
    Array<{
      id: string;
      accountId: string;
      debit: number | "";
      credit: number | "";
      description: string;
    }>
  >([
    { id: "1", accountId: "", debit: "", credit: "", description: "" },
    { id: "2", accountId: "", debit: "", credit: "", description: "" },
  ]);

  const filteredEntries = journalEntries.filter((j) => {
    const matchesStatus = statusFilter === "all" || j.status === statusFilter;
    const matchesBranch = branchFilter === "all" || j.branch === branchFilter;
    const matchesSearch =
      j.entryNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      j.reference.toLowerCase().includes(searchQuery.toLowerCase()) ||
      j.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesBranch && matchesSearch;
  });

  // Calculate dynamic totals for active line items in modal
  const totalDebit = lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0);
  const difference = Math.abs(totalDebit - totalCredit);
  const isBalanced = difference < 0.01 && totalDebit > 0;

  const handleAddLine = () => {
    setLines([
      ...lines,
      { id: String(Date.now()), accountId: "", debit: "", credit: "", description: "" },
    ]);
  };

  const handleRemoveLine = (index: number) => {
    if (lines.length <= 2) return;
    setLines(lines.filter((_, idx) => idx !== index));
  };

  const handleLineChange = (
    index: number,
    field: "accountId" | "debit" | "credit" | "description",
    val: any
  ) => {
    const updated = [...lines];
    if (field === "debit") {
      updated[index].debit = val === "" ? "" : parseFloat(val) || 0;
      if (val !== "" && parseFloat(val) > 0) updated[index].credit = "";
    } else if (field === "credit") {
      updated[index].credit = val === "" ? "" : parseFloat(val) || 0;
      if (val !== "" && parseFloat(val) > 0) updated[index].debit = "";
    } else {
      updated[index][field] = val;
    }
    setLines(updated);
  };

  const handleSaveEntry = (postNow: boolean) => {
    if (!entryDesc || !isBalanced) return;

    const formattedLines: JournalLineItem[] = lines
      .filter((l) => l.accountId && (Number(l.debit) > 0 || Number(l.credit) > 0))
      .map((l, idx) => {
        const acc = accounts.find((a) => a.id === l.accountId);
        return {
          id: `line-${Date.now()}-${idx}`,
          accountId: l.accountId,
          accountCode: acc?.code || "0000",
          accountName: acc?.name || "Unknown",
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
          description: l.description || entryDesc,
        };
      });

    createJournalEntry(
      {
        date: entryDate,
        branch: entryBranch,
        reference: entryRef || "REF-MANUAL",
        description: entryDesc,
        status: postNow ? "posted" : "draft",
        lines: formattedLines,
        totalDebit,
        totalCredit,
        sourceModule: "Manual Journal",
      },
      postNow
    );

    setIsNewModalOpen(false);
    if (onModalClosed) onModalClosed();
    resetForm();
  };

  const resetForm = () => {
    setEntryRef("");
    setEntryDesc("");
    setLines([
      { id: "1", accountId: "", debit: "", credit: "", description: "" },
      { id: "2", accountId: "", debit: "", credit: "", description: "" },
    ]);
  };

  const handleConfirmReverse = () => {
    if (!reverseTarget) return;
    reverseJournalEntry(reverseTarget.id, reverseReason || "Manual correction");
    setReverseTarget(null);
    setReverseReason("");
  };

  const handleExportExcel = () => {
    const data = filteredEntries.map((j) => ({
      "Journal Number": j.entryNumber,
      Date: j.date,
      Branch: j.branch,
      Reference: j.reference,
      Description: j.description,
      "Total Amount": j.totalDebit,
      Currency: currentCurrency,
      Status: j.status.toUpperCase(),
      "Posted By": j.postedBy || "System",
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Journal Entries");
    XLSX.writeFile(workbook, `Journal_Entries_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-5">
      {/* ── Top Header Controls ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setStatusFilter("all")}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
              statusFilter === "all"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            All Entries ({journalEntries.length})
          </button>
          <button
            onClick={() => setStatusFilter("posted")}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
              statusFilter === "posted"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            Posted
          </button>
          <button
            onClick={() => setStatusFilter("draft")}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
              statusFilter === "draft"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            Drafts
          </button>
          <button
            onClick={() => setStatusFilter("reversed")}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
              statusFilter === "reversed"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            Reversed
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" /> Export Excel
          </button>
          <button
            onClick={() => setIsNewModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition-all"
          >
            <Plus className="h-3.5 w-3.5" /> Create Journal Entry
          </button>
        </div>
      </div>

      {/* ── Search & Branch Filter Bar ── */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-3.5 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search journal #, reference, description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-9 pr-3 py-1.5 text-xs outline-none focus:border-blue-500 focus:bg-white dark:border-slate-700 dark:bg-slate-800/60"
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Building2 className="h-3.5 w-3.5" />
            <span>Branch:</span>
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-800"
            >
              <option value="all">All Branches</option>
              <option value="Main Branch">Main Branch</option>
              <option value="Kumasi Branch">Kumasi Branch</option>
              <option value="Takoradi Branch">Takoradi Branch</option>
            </select>
          </div>
          <span className="text-xs text-slate-400">
            Showing {filteredEntries.length} entries
          </span>
        </div>
      </div>

      {/* ── Journal Entries Table ── */}
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                <th className="px-4 py-3">Journal Number</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3 text-right">Debit ({currentCurrency})</th>
                <th className="px-4 py-3 text-right">Credit ({currentCurrency})</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    No journal entries found.
                  </td>
                </tr>
              ) : (
                filteredEntries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50/70 transition-colors dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                      {entry.entryNumber}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{entry.date}</td>
                    <td className="px-4 py-3 text-slate-500">{entry.branch}</td>
                    <td className="px-4 py-3 font-mono text-slate-700 dark:text-slate-200">{entry.reference}</td>
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-white max-w-xs truncate">
                      {entry.description}
                    </td>
                    <td className="px-4 py-3 text-right font-display font-semibold text-slate-900 dark:text-white">
                      {entry.totalDebit.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-right font-display font-semibold text-slate-900 dark:text-white">
                      {entry.totalCredit.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          entry.status === "posted"
                            ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400"
                            : entry.status === "draft"
                            ? "bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400"
                            : "bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400"
                        }`}
                      >
                        {entry.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          title="View / Print Voucher"
                          onClick={() => setViewVoucher(entry)}
                          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-800"
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </button>

                        {entry.status === "draft" && (
                          <button
                            title="Post Entry to Ledger"
                            onClick={() => postJournalEntry(entry.id)}
                            className="rounded-lg p-1 text-emerald-600 hover:bg-emerald-50"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </button>
                        )}

                        {entry.status === "posted" && (
                          <button
                            title="Reverse Entry"
                            onClick={() => setReverseTarget(entry)}
                            className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Create Journal Entry Modal (Double-Entry Form with Debits = Credits Guard) ── */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800 shrink-0">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  New Journal Entry
                </h3>
                <p className="text-xs text-slate-400">Double-entry accounting transaction voucher</p>
              </div>
              <button
                onClick={() => {
                  setIsNewModalOpen(false);
                  if (onModalClosed) onModalClosed();
                }}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
              {/* Header Fields */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div>
                  <label className="font-medium text-slate-700 dark:text-slate-300">Date *</label>
                  <input
                    type="date"
                    required
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="font-medium text-slate-700 dark:text-slate-300">Branch *</label>
                  <select
                    value={entryBranch}
                    onChange={(e) => setEntryBranch(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800"
                  >
                    <option value="Main Branch">Main Branch</option>
                    <option value="Kumasi Branch">Kumasi Branch</option>
                    <option value="Takoradi Branch">Takoradi Branch</option>
                  </select>
                </div>
                <div>
                  <label className="font-medium text-slate-700 dark:text-slate-300">Reference</label>
                  <input
                    type="text"
                    placeholder="e.g. INV-2026-901"
                    value={entryRef}
                    onChange={(e) => setEntryRef(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="font-medium text-slate-700 dark:text-slate-300">Currency</label>
                  <input
                    type="text"
                    disabled
                    value={currentCurrency}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="font-medium text-slate-700 dark:text-slate-300">Description / Memo *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sales revenue settlement or purchase invoice clearing"
                  value={entryDesc}
                  onChange={(e) => setEntryDesc(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800"
                />
              </div>

              {/* Dynamic Line Items Grid */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
                <div className="flex items-center justify-between pb-2">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Accounting Lines</span>
                  <button
                    type="button"
                    onClick={handleAddLine}
                    className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Row
                  </button>
                </div>

                <div className="space-y-2">
                  {lines.map((line, idx) => (
                    <div key={line.id} className="flex items-center gap-2">
                      {/* Account selector */}
                      <div className="flex-1 min-w-[200px]">
                        <select
                          value={line.accountId}
                          onChange={(e) => handleLineChange(idx, "accountId", e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800"
                        >
                          <option value="">Select Account...</option>
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.code} - {a.name} ({a.type})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Description */}
                      <div className="flex-1 min-w-[150px]">
                        <input
                          type="text"
                          placeholder="Line description (optional)"
                          value={line.description}
                          onChange={(e) => handleLineChange(idx, "description", e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800"
                        />
                      </div>

                      {/* Debit */}
                      <div className="w-28">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Debit (0.00)"
                          value={line.debit}
                          onChange={(e) => handleLineChange(idx, "debit", e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-right text-xs font-mono font-medium outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800"
                        />
                      </div>

                      {/* Credit */}
                      <div className="w-28">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Credit (0.00)"
                          value={line.credit}
                          onChange={(e) => handleLineChange(idx, "credit", e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-right text-xs font-mono font-medium outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800"
                        />
                      </div>

                      {/* Delete */}
                      <button
                        type="button"
                        onClick={() => handleRemoveLine(idx)}
                        disabled={lines.length <= 2}
                        className="p-1 text-slate-400 hover:text-rose-600 disabled:opacity-30"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Validation & Balance Summary */}
                <div className="mt-4 flex flex-col gap-2 rounded-xl bg-white p-3 border border-slate-200 dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    {isBalanced ? (
                      <span className="flex items-center gap-1.5 text-emerald-600 font-semibold">
                        <CheckCircle2 className="h-4 w-4" /> Entry is balanced! (Total: {currentCurrency}{" "}
                        {totalDebit.toLocaleString("en-US", { minimumFractionDigits: 2 })})
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-rose-500 font-semibold">
                        <AlertCircle className="h-4 w-4" /> Unbalanced by {currentCurrency}{" "}
                        {difference.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-xs font-mono">
                    <span className="text-slate-600 dark:text-slate-300">
                      Total Debit: <b className="text-slate-900 dark:text-white">{totalDebit.toFixed(2)}</b>
                    </span>
                    <span className="text-slate-600 dark:text-slate-300">
                      Total Credit: <b className="text-slate-900 dark:text-white">{totalCredit.toFixed(2)}</b>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="mt-4 flex items-center justify-end gap-2.5 border-t border-slate-100 pt-3 dark:border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsNewModalOpen(false);
                  if (onModalClosed) onModalClosed();
                }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSaveEntry(false)}
                disabled={!entryDesc}
                className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              >
                Save Draft
              </button>
              <button
                type="button"
                onClick={() => handleSaveEntry(true)}
                disabled={!isBalanced || !entryDesc}
                className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 shadow-sm"
              >
                Post Entry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── View / Print Voucher Modal ── */}
      {viewVoucher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white font-bold">
                  S
                </div>
                <div>
                  <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                    Journal Voucher
                  </h3>
                  <p className="text-xs text-slate-500">ThinkSales Pro ERP System</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
                >
                  <Printer className="h-3.5 w-3.5" /> Print
                </button>
                <button
                  onClick={() => setViewVoucher(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4 text-xs border-b border-slate-100 pb-4 dark:border-slate-800">
              <div>
                <p className="text-slate-400">Voucher / Entry #</p>
                <p className="font-mono text-sm font-bold text-blue-600 dark:text-blue-400">
                  {viewVoucher.entryNumber}
                </p>
                <p className="mt-2 text-slate-400">Date</p>
                <p className="font-semibold text-slate-800 dark:text-slate-200">{viewVoucher.date}</p>
              </div>
              <div>
                <p className="text-slate-400">Reference / Source</p>
                <p className="font-semibold text-slate-800 dark:text-slate-200">
                  {viewVoucher.reference} ({viewVoucher.sourceModule || "Manual"})
                </p>
                <p className="mt-2 text-slate-400">Branch</p>
                <p className="font-semibold text-slate-800 dark:text-slate-200">{viewVoucher.branch}</p>
              </div>
            </div>

            <div className="mt-4">
              <p className="text-xs text-slate-400">Description</p>
              <p className="font-medium text-slate-800 dark:text-white">{viewVoucher.description}</p>
            </div>

            {/* Line Items */}
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold dark:bg-slate-800/60 dark:border-slate-700">
                    <th className="p-2.5">Account</th>
                    <th className="p-2.5">Line Description</th>
                    <th className="p-2.5 text-right">Debit ({currentCurrency})</th>
                    <th className="p-2.5 text-right">Credit ({currentCurrency})</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {viewVoucher.lines.map((l, i) => (
                    <tr key={i}>
                      <td className="p-2.5 font-medium">
                        <span className="font-mono font-bold text-blue-600">{l.accountCode}</span> - {l.accountName}
                      </td>
                      <td className="p-2.5 text-slate-600 dark:text-slate-400">{l.description || "-"}</td>
                      <td className="p-2.5 text-right font-mono font-semibold">
                        {l.debit > 0 ? l.debit.toLocaleString("en-US", { minimumFractionDigits: 2 }) : "-"}
                      </td>
                      <td className="p-2.5 text-right font-mono font-semibold">
                        {l.credit > 0 ? l.credit.toLocaleString("en-US", { minimumFractionDigits: 2 }) : "-"}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 font-bold dark:bg-slate-800/40">
                    <td colSpan={2} className="p-2.5 text-right">
                      Total:
                    </td>
                    <td className="p-2.5 text-right font-mono text-slate-900 dark:text-white">
                      {viewVoucher.totalDebit.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-2.5 text-right font-mono text-slate-900 dark:text-white">
                      {viewVoucher.totalCredit.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Signature Blocks */}
            <div className="mt-8 grid grid-cols-2 gap-8 text-xs text-center border-t border-dashed border-slate-200 pt-6 dark:border-slate-800">
              <div>
                <div className="mx-auto h-8 w-40 border-b border-slate-300" />
                <p className="mt-1 font-medium text-slate-600 dark:text-slate-400">Prepared by</p>
                <p className="text-[10px] text-slate-400">Daniel K. Selby</p>
              </div>
              <div>
                <div className="mx-auto h-8 w-40 border-b border-slate-300" />
                <p className="mt-1 font-medium text-slate-600 dark:text-slate-400">Authorized Signatory</p>
                <p className="text-[10px] text-slate-400">Financial Controller</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Reverse Entry Modal ── */}
      {reverseTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-rose-600" />
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Reverse Journal Entry
                </h3>
              </div>
              <button onClick={() => setReverseTarget(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 text-xs space-y-2">
              <p className="text-slate-600 dark:text-slate-300">
                Are you sure you want to reverse <b>{reverseTarget.entryNumber}</b> ({reverseTarget.description})?
              </p>
              <p className="text-slate-400 text-[11px]">
                This will create an automated reversing transaction, restoring affected account balances to their prior state.
              </p>

              <div className="pt-2">
                <label className="font-semibold text-slate-700 dark:text-slate-300">Reversal Reason *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Invoicing error correction or customer dispute"
                  value={reverseReason}
                  onChange={(e) => setReverseReason(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-rose-500 dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setReverseTarget(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReverse}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 shadow-sm"
              >
                Confirm Reversal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
