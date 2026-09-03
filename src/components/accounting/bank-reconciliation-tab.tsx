"use client";

import React, { useState } from "react";
import {
  Landmark,
  Upload,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowDownRight,
  ArrowUpRight,
  X,
  FileSpreadsheet,
  Building2,
} from "lucide-react";
import * as XLSX from "xlsx";
import { useAccountingStore } from "@/lib/accounting/accounting-store";

export function BankReconciliationTab() {
  const {
    bankAccounts,
    bankTransactions,
    currentCurrency,
    currentBranch,
    importBankStatement,
    autoReconcileBank,
    toggleReconcileLine,
    finalizeReconciliation,
  } = useAccountingStore();

  const [selectedAccountId, setSelectedAccountId] = useState(bankAccounts[1]?.id || bankAccounts[0]?.id || "");
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [statementBalanceInput, setStatementBalanceInput] = useState<string>("");
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const currentAccount = bankAccounts.find((b) => b.id === selectedAccountId) || bankAccounts[0];
  const transactions = (currentAccount && bankTransactions[currentAccount.id]) || [
    { id: "stmt-1", date: "2026-05-17", reference: "CHQ-8902", description: "Deposit from POS Sales", amount: 3250.0, type: "deposit", matched: true },
    { id: "stmt-2", date: "2026-05-16", reference: "ACH-3921", description: "Transfer - Customer Apex", amount: 2400.0, type: "deposit", matched: true },
    { id: "stmt-3", date: "2026-05-15", reference: "DEB-1120", description: "Electronic Wire - Prime Logistics", amount: 1850.0, type: "withdrawal", matched: true },
    { id: "stmt-4", date: "2026-05-14", reference: "BNK-FEE", description: "Monthly Ledger Maintenance Fee", amount: 120.0, type: "withdrawal", matched: true },
    { id: "stmt-5", date: "2026-05-12", reference: "ATM-0941", description: "Cash withdrawal petty cash", amount: 450.0, type: "withdrawal", matched: false },
  ];

  const matchedCount = transactions.filter((t) => t.matched).length;
  const difference = currentAccount ? Math.abs(currentAccount.statementBalance - currentAccount.bookBalance) : 0;

  const handleAutoReconcile = () => {
    if (!currentAccount) return;
    const matches = autoReconcileBank(currentAccount.id);
    setFeedbackMsg({
      text: `Auto-reconciliation complete: ${matches} transactions successfully matched against general ledger.`,
      type: "success",
    });
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  const handleFinalize = () => {
    if (!currentAccount) return;
    finalizeReconciliation(currentAccount.id);
    setFeedbackMsg({
      text: `Reconciliation finalized for ${currentAccount.name}. Balance verified and audit timestamp generated.`,
      type: "success",
    });
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentAccount) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rows: any[] = XLSX.utils.sheet_to_json(ws);

        if (rows.length > 0) {
          const formatted = rows.map((r, i) => ({
            date: r["Date"] || r["date"] || new Date().toISOString().slice(0, 10),
            reference: String(r["Reference"] || r["Ref"] || `IMP-${i + 1}`),
            description: String(r["Description"] || r["Memo"] || "Imported transaction"),
            amount: Math.abs(parseFloat(r["Amount"] || r["amount"] || 0)),
            type: (parseFloat(r["Amount"] || 0) < 0 || r["Type"] === "withdrawal"
              ? "withdrawal"
              : "deposit") as "deposit" | "withdrawal",
          }));

          importBankStatement(currentAccount.id, formatted);
          setIsImportModalOpen(false);
          setFeedbackMsg({
            text: `Successfully imported ${formatted.length} statement rows into ${currentAccount.name}.`,
            type: "success",
          });
          setTimeout(() => setFeedbackMsg(null), 4000);
        }
      } catch (err) {
        setFeedbackMsg({ text: "Failed to parse bank statement file. Please ensure valid CSV/Excel format.", type: "error" });
      }
    };
    reader.readAsBinaryString(file);
  };

  return (
    <div className="space-y-6">
      {/* ── Top Account Selector & Quick Stats ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-500">Bank Account:</label>
          <select
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 outline-none hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            {bankAccounts.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.bankName})
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <Upload className="h-3.5 w-3.5 text-slate-500" /> Import Statement
          </button>
          <button
            onClick={handleAutoReconcile}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            <Sparkles className="h-3.5 w-3.5" /> Auto Reconciliation
          </button>
          <button
            onClick={handleFinalize}
            disabled={difference > 0}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Finalize Reconciliation
          </button>
        </div>
      </div>

      {feedbackMsg && (
        <div
          className={`rounded-xl p-3 text-xs font-medium ${
            feedbackMsg.type === "success"
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
              : "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
          }`}
        >
          {feedbackMsg.text}
        </div>
      )}

      {/* ── Reconciliation KPI Metrics Cards ── */}
      {currentAccount && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Bank Statement Balance */}
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
                <Landmark className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-slate-400">Bank Statement Balance</p>
                <p className="font-display text-lg font-bold text-slate-900 dark:text-white">
                  {currentCurrency} {currentAccount.statementBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">As of today&apos;s statement</p>
          </div>

          {/* Book Balance */}
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-400">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-slate-400">General Ledger Balance</p>
                <p className="font-display text-lg font-bold text-slate-900 dark:text-white">
                  {currentCurrency} {currentAccount.bookBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">System Book Balance</p>
          </div>

          {/* Difference */}
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                  difference === 0
                    ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950"
                    : "bg-rose-50 text-rose-600 dark:bg-rose-950"
                }`}
              >
                {difference === 0 ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
              </div>
              <div>
                <p className="text-xs text-slate-400">Unreconciled Difference</p>
                <p
                  className={`font-display text-lg font-bold ${
                    difference === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600"
                  }`}
                >
                  {currentCurrency} {difference.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              {difference === 0 ? "Perfect match — zero discrepancy" : "Discrepancy requires matching"}
            </p>
          </div>

          {/* Reconciliation Status */}
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-slate-400">Status & Progress</p>
                <p className="font-display text-base font-bold text-slate-900 dark:text-white capitalize">
                  {currentAccount.status.replace("_", " ")}
                </p>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              {matchedCount} of {transactions.length} items verified
            </p>
          </div>
        </div>
      )}

      {/* ── Transaction Matching Grid ── */}
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-5 py-3 dark:border-slate-800 dark:bg-slate-800/50">
          <div>
            <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
              Bank Statement Lines vs Ledger Entries
            </h3>
            <p className="text-xs text-slate-500">Check off matched transactions or click Auto-Reconciliation</p>
          </div>
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
            {matchedCount} Reconciled
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-white text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-900">
                <th className="px-4 py-3 text-center">Match</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3 text-center">Type</th>
                <th className="px-4 py-3 text-right">Amount ({currentCurrency})</th>
                <th className="px-4 py-3 text-center">Verification Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {transactions.map((tx) => (
                <tr
                  key={tx.id}
                  onClick={() => currentAccount && toggleReconcileLine(currentAccount.id, tx.id)}
                  className={`cursor-pointer transition-colors ${
                    tx.matched ? "bg-emerald-50/20 hover:bg-emerald-50/40" : "hover:bg-slate-50/70"
                  }`}
                >
                  <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={tx.matched}
                      onChange={() => currentAccount && toggleReconcileLine(currentAccount.id, tx.id)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3 text-slate-500">{tx.date}</td>
                  <td className="px-4 py-3 font-mono font-medium text-slate-800 dark:text-slate-200">
                    {tx.reference}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-white">{tx.description}</td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                        tx.type === "deposit"
                          ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400"
                          : "bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400"
                      }`}
                    >
                      {tx.type === "deposit" ? <ArrowDownRight className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
                      {tx.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-display font-semibold text-slate-900 dark:text-white">
                    {tx.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {tx.matched ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" /> Reconciled
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
                        Unmatched
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Import Bank Statement Modal ── */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Import Bank Statement
              </h3>
              <button onClick={() => setIsImportModalOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <p className="text-slate-500 leading-relaxed">
                Upload your bank statement file (.xlsx or .csv). Supported columns: <b>Date, Reference, Description, Amount, Type</b>.
              </p>

              <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center hover:bg-slate-50/50 cursor-pointer dark:border-slate-700">
                <Upload className="mx-auto h-8 w-8 text-blue-600" />
                <p className="mt-2 font-medium text-slate-700 dark:text-slate-300">Choose file or drag here</p>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileUpload}
                  className="mt-2 text-xs text-slate-500 file:mr-2 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-blue-700"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
