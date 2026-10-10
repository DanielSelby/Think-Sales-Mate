"use client";

import React, { useState, useTransition } from "react";
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
import { formatCurrencyAmount } from "@/lib/currency";
import { autoMatchBankStatement, finalizeBankReconciliation, importBankStatement, matchBankStatementTransaction } from "@/app/(dashboard)/accounting/actions";
import { useRouter } from "next/navigation";
import type { BankBookTransaction, BankStatementTransaction } from "@/types/accounting";

export function BankReconciliationTab({ initialBankAccounts = [], initialBankTransactions = {}, initialBookTransactions = {} }: {
  initialBankAccounts?: import("@/types/accounting").BankAccountItem[];
  initialBankTransactions?: Record<string, BankStatementTransaction[]>;
  initialBookTransactions?: Record<string, BankBookTransaction[]>;
}) {
  const {
    currentCurrency,
    currencyConfig,
    currentBranch,
  } = useAccountingStore();
  const router = useRouter();
  const bankAccounts = initialBankAccounts;
  const bankTransactions = initialBankTransactions;
  const bookTransactionsByAccount = initialBookTransactions;

  const [selectedAccountId, setSelectedAccountId] = useState(bankAccounts[0]?.id || "");
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [statementBalanceInput, setStatementBalanceInput] = useState<string>("");
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [isMatching, startMatching] = useTransition();

  const currentAccount = bankAccounts.find((b) => b.id === selectedAccountId) || bankAccounts[0];
  const transactions = (currentAccount && bankTransactions[currentAccount.id]) || [];
  const bookTransactions = (currentAccount && bookTransactionsByAccount[currentAccount.id]) || [];
  const matchedBookTransactionIds = new Set(transactions.map((transaction) => transaction.matchedTransactionId).filter((id): id is string => Boolean(id)));
  const unmatchedBookTransactions = bookTransactions.filter((transaction) => !matchedBookTransactionIds.has(transaction.id));

  const matchedCount = transactions.filter((t) => t.matched).length;
  const statementBalance = statementBalanceInput.trim() ? Number(statementBalanceInput) : null;
  const difference = currentAccount && statementBalance !== null && Number.isFinite(statementBalance)
    ? Math.abs(statementBalance - currentAccount.bookBalance)
    : null;

  const handleMatchChange = (statementTransactionId: string, bookTransactionId: string | null) => {
    startMatching(async () => {
      const result = await matchBankStatementTransaction(statementTransactionId, bookTransactionId);
      if (!result.ok) {
        setFeedbackMsg({ text: result.error ?? "Could not update the transaction match.", type: "error" });
        return;
      }
      setFeedbackMsg({ text: bookTransactionId ? "Statement line matched to the book transaction." : "Statement line marked unmatched.", type: "success" });
      router.refresh();
    });
  };

  const handleAutoReconcile = async () => {
    if (!currentAccount) return;
    startMatching(async () => {
      const result = await autoMatchBankStatement(currentAccount.id);
      if (!result.ok) {
        setFeedbackMsg({ text: result.error ?? "Auto-reconciliation failed.", type: "error" });
        return;
      }
      const matches = result.matched ?? 0;
      setFeedbackMsg({
        text: `Auto-reconciliation complete: ${matches} transactions matched to book records by date, type, and amount.`,
        type: "success",
      });
      router.refresh();
      setTimeout(() => setFeedbackMsg(null), 4000);
    });
  };

  const handleFinalize = async () => {
    if (!currentAccount) return;
    if (statementBalance === null || !Number.isFinite(statementBalance)) {
      setFeedbackMsg({ text: "Enter the ending balance from the bank statement before finalizing.", type: "error" });
      return;
    }
    const result = await finalizeBankReconciliation({ accountId: currentAccount.id, statementBalance });
    if (!result.ok) {
      setFeedbackMsg({ text: result.error ?? "Finalization failed.", type: "error" });
      return;
    }
    setFeedbackMsg({
      text: `Reconciliation finalized for ${currentAccount.name}. Balance verified and audit timestamp generated.`,
      type: "success",
    });
    router.refresh();
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentAccount) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        if (typeof bstr !== "string") {
          setFeedbackMsg({ text: "The selected statement file could not be read.", type: "error" });
          return;
        }
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

          const result = await importBankStatement({ accountId: currentAccount.id, transactions: formatted });
          if (!result.ok) {
            setFeedbackMsg({ text: result.error ?? "Statement import failed.", type: "error" });
            return;
          }
          setIsImportModalOpen(false);
          setFeedbackMsg({ text: `Successfully imported ${result.imported ?? formatted.length} statement rows into ${currentAccount.name}.`, type: "success" });
          router.refresh();
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
            onChange={(e) => {
              setSelectedAccountId(e.target.value);
              setStatementBalanceInput("");
              setFeedbackMsg(null);
            }}
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
          <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
            Statement ending balance
            <input
              type="number"
              min="0"
              step="0.01"
              value={statementBalanceInput}
              onChange={(event) => setStatementBalanceInput(event.target.value)}
              placeholder="Enter ending balance"
              aria-label={`Statement ending balance in ${currentCurrency}`}
              className="w-32 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </label>
          <button
            disabled={!currentAccount}
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <Upload className="h-3.5 w-3.5 text-slate-500" /> Import Statement
          </button>
          <button
            disabled={!currentAccount || isMatching}
            onClick={handleAutoReconcile}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" /> {isMatching ? "Matching…" : "Auto Reconciliation"}
          </button>
          <button
            onClick={handleFinalize}
            disabled={!currentAccount || difference === null || difference > 0.01 || transactions.some((transaction) => !transaction.matched)}
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
                  {statementBalance !== null && Number.isFinite(statementBalance)
                    ? formatCurrencyAmount(statementBalance, currencyConfig)
                    : "Enter statement balance"}
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
                  {formatCurrencyAmount(currentAccount.bookBalance, currencyConfig)}
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
                  difference !== null && difference <= 0.01
                    ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950"
                    : "bg-rose-50 text-rose-600 dark:bg-rose-950"
                }`}
              >
                {difference !== null && difference <= 0.01 ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
              </div>
              <div>
                <p className="text-xs text-slate-400">Unreconciled Difference</p>
                <p
                  className={`font-display text-lg font-bold ${
                    difference === null ? "text-slate-400" : difference <= 0.01 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600"
                  }`}
                >
                  {difference === null ? "—" : formatCurrencyAmount(difference, currencyConfig)}
                </p>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              {difference === null ? "Enter the statement ending balance" : difference <= 0.01 ? "Statement and book balances agree" : "Statement and book balances differ"}
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
                  {transactions.length > 0 && matchedCount === transactions.length ? "fully matched" : "in progress"}
                </p>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              {matchedCount} of {transactions.length} statement lines matched
            </p>
          </div>
        </div>
      )}

      {/* Imported bank statement transactions are compared with separately recorded book transactions. */}
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-5 py-3 dark:border-slate-800 dark:bg-slate-800/50">
          <div>
            <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
              Bank Statement Lines vs Ledger Entries
            </h3>
            <p className="text-xs text-slate-500">Match each imported statement line to its corresponding Think Shika transaction.</p>
          </div>
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
            {matchedCount} Reconciled
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-white text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-900">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3 text-center">Type</th>
                <th className="px-4 py-3 text-right">Amount ({currentCurrency})</th>
                <th className="px-4 py-3">Matched book transaction</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {transactions.map((tx) => {
                const linkedTransaction = bookTransactions.find((transaction) => transaction.id === tx.matchedTransactionId);
                const availableBookTransactions = bookTransactions.filter((transaction) =>
                  !matchedBookTransactionIds.has(transaction.id)
                    && transaction.type === tx.type
                    && Math.abs(transaction.amount - tx.amount) <= 0.005
                );
                return (
                <tr key={tx.id} className={tx.matched ? "bg-emerald-50/20" : "hover:bg-slate-50/70"}>
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
                    {formatCurrencyAmount(tx.amount, currencyConfig)}
                  </td>
                  <td className="min-w-64 px-4 py-3">
                    {linkedTransaction ? (
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-slate-800 dark:text-slate-100">{linkedTransaction.description || (linkedTransaction.type === "deposit" ? "Deposit" : "Withdrawal")}</span>
                          <span className="mt-0.5 block text-[10px] text-slate-500">{linkedTransaction.date} · {formatCurrencyAmount(linkedTransaction.amount, currencyConfig)}</span>
                        </span>
                        <button
                          type="button"
                          disabled={isMatching}
                          onClick={() => handleMatchChange(tx.id, null)}
                          className="shrink-0 text-[10px] font-semibold text-rose-600 hover:underline disabled:opacity-50"
                        >
                          Unmatch
                        </button>
                      </div>
                    ) : (
                      <select
                        value=""
                        disabled={isMatching || availableBookTransactions.length === 0}
                        onChange={(event) => {
                          if (event.target.value) handleMatchChange(tx.id, event.target.value);
                        }}
                        aria-label={`Select a book transaction matching ${tx.description || tx.reference || tx.date}`}
                        className="w-full min-w-56 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-700 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      >
                        <option value="">
                          {availableBookTransactions.length ? "Select matching book transaction" : "No exact amount/type match"}
                        </option>
                        {availableBookTransactions.map((transaction) => (
                          <option key={transaction.id} value={transaction.id}>
                            {transaction.date} · {transaction.description || (transaction.type === "deposit" ? "Deposit" : "Withdrawal")} · {formatCurrencyAmount(transaction.amount, currencyConfig)}
                          </option>
                        ))}
                      </select>
                    )}
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
                );
              })}
              {transactions.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">No statement lines imported for this account. Import a bank statement to begin matching.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div>
            <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">Book transactions not matched to this statement</h3>
            <p className="mt-1 text-xs text-slate-500">These are Think Shika account records not linked to an imported statement line. They may be timing differences.</p>
          </div>
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
            {unmatchedBookTransactions.length} unmatched
          </span>
        </div>
        {unmatchedBookTransactions.length === 0 ? (
          <p className="px-5 py-8 text-center text-xs text-slate-500">All book transactions are matched to a statement line.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-xs">
              <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:bg-slate-800/50">
                <tr>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-3 py-3">Description</th>
                  <th className="px-3 py-3">Type</th>
                  <th className="px-5 py-3 text-right">Book amount</th>
                  <th className="px-5 py-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {unmatchedBookTransactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td className="whitespace-nowrap px-5 py-3 text-slate-500">{transaction.date}</td>
                    <td className="max-w-80 truncate px-3 py-3 font-medium text-slate-800 dark:text-slate-100">{transaction.description || (transaction.type === "deposit" ? "Deposit" : "Withdrawal")}</td>
                    <td className="px-3 py-3 capitalize text-slate-600 dark:text-slate-300">{transaction.type}</td>
                    <td className="px-5 py-3 text-right font-semibold text-slate-900 dark:text-white">{formatCurrencyAmount(transaction.amount, currencyConfig)}</td>
                    <td className="px-5 py-3 text-right text-amber-700 dark:text-amber-300">Not on statement</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

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
