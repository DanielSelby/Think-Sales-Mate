"use client";

import React, { useState } from "react";
import {
  FileSpreadsheet,
  Download,
  Printer,
  Calendar,
  Building2,
  CheckCircle2,
  TrendingUp,
  Scale,
  DollarSign,
  BookOpen,
} from "lucide-react";
import * as XLSX from "xlsx";
import { useAccountingStore } from "@/lib/accounting/accounting-store";
import { formatCurrencyAmount } from "@/lib/currency";
import type { BalanceSheetSummary, ReportKpis } from "@/lib/reports/calculations";
import type { AccountingAccount, JournalEntry } from "@/types/accounting";

export interface LiveFinancialSnapshot {
  kpis: ReportKpis;
  balanceSheet: BalanceSheetSummary;
  periodLabel: string;
}

export function FinancialReportsTab({ liveSnapshot, liveAccounts, liveJournalEntries }: { liveSnapshot?: LiveFinancialSnapshot; liveAccounts?: AccountingAccount[]; liveJournalEntries?: JournalEntry[] }) {
  const {
    receivables,
    payables,
    fixedAssets,
    currentCurrency,
    currencyConfig,
    currentBranch,
  } = useAccountingStore();
  const accounts = liveAccounts ?? [];
  const journalEntries = liveJournalEntries ?? [];

  const [selectedReport, setSelectedReport] = useState<
    "pnl" | "balance_sheet" | "cash_flow" | "trial_balance" | "general_ledger" | "tax_report"
  >("pnl");

  const [period, setPeriod] = useState("This Year");
  const [reportBranch, setReportBranch] = useState("all");

  // Filter accounts by branch if needed
  const activeAccounts = accounts.filter((a) =>
    reportBranch === "all" ? true : a.branch === reportBranch
  );
  const reportDateRange = (() => {
    const today = new Date();
    const from = new Date(today);
    if (period === "This Month") {
      from.setDate(1);
    } else if (period === "Last 30 Days") {
      from.setDate(today.getDate() - 29);
    } else {
      from.setMonth(0, 1);
    }
    return {
      from: from.toISOString().slice(0, 10),
      to: today.toISOString().slice(0, 10),
    };
  })();
  const filteredJournalEntries = journalEntries.filter((journal) =>
    journal.status === "posted" &&
    journal.date >= reportDateRange.from &&
    journal.date <= reportDateRange.to &&
    (reportBranch === "all" || journal.branch === reportBranch)
  );
  const journalBalances = new Map<string, { debit: number; credit: number }>();
  if (liveJournalEntries?.length) {
    for (const journal of filteredJournalEntries) {
      for (const line of journal.lines) {
        const current = journalBalances.get(line.accountId) ?? { debit: 0, credit: 0 };
        current.debit += line.debit;
        current.credit += line.credit;
        journalBalances.set(line.accountId, current);
      }
    }
  }

  // Profit & Loss calculations
  const revenues = activeAccounts.filter((a) => a.type === "revenue");
  const cogs = activeAccounts.filter((a) => a.type === "cogs");
  const expenses = activeAccounts.filter((a) => a.type === "expense");

  const totalRevenue = liveSnapshot?.kpis.totalRevenue ?? revenues.reduce((sum, a) => sum + a.balance, 0);
  const totalCogs = liveSnapshot ? totalRevenue - (liveSnapshot.kpis.netProfit + liveSnapshot.kpis.totalExpenses) : cogs.reduce((sum, a) => sum + a.balance, 0);
  const grossProfit = liveSnapshot ? totalRevenue - totalCogs : totalRevenue - totalCogs;
  const totalExpenses = liveSnapshot?.kpis.totalExpenses ?? expenses.reduce((sum, a) => sum + a.balance, 0);
  const netProfit = liveSnapshot?.kpis.netProfit ?? grossProfit - totalExpenses;
  const money = (value: number) => formatCurrencyAmount(value, currencyConfig);

  // Balance Sheet calculations
  const assetAccounts = activeAccounts.filter((a) => a.type === "asset");
  const liabilityAccounts = activeAccounts.filter((a) => a.type === "liability");
  const equityAccounts = activeAccounts.filter((a) => a.type === "equity");

  const totalAssets = liveSnapshot?.balanceSheet.totalAssets ?? assetAccounts.reduce((sum, a) => sum + a.balance, 0);
  const totalLiabilities = liveSnapshot?.balanceSheet.totalLiabilities ?? Math.abs(liabilityAccounts.reduce((sum, a) => sum + a.balance, 0));
  const totalEquity = liveSnapshot?.balanceSheet.totalEquity ?? equityAccounts.reduce((sum, a) => sum + a.balance, 0) + netProfit;

  // Trial balance debits and credits
  const trialBalanceRows = activeAccounts.map((a) => {
    const isDebit = a.type === "asset" || a.type === "expense" || a.type === "cogs";
    const journalBalance = journalBalances.get(a.id);
    const debitBalance = journalBalance ? journalBalance.debit : a.balance;
    const creditBalance = journalBalance ? journalBalance.credit : 0;
    const netBalance = debitBalance - creditBalance;
    const debit = journalBalance
      ? Math.max(0, netBalance)
      : isDebit ? Math.max(0, a.balance) : a.balance < 0 ? Math.abs(a.balance) : 0;
    const credit = journalBalance
      ? Math.max(0, -netBalance)
      : !isDebit ? Math.max(0, a.balance) : a.balance < 0 ? Math.abs(a.balance) : 0;
    return {
      code: a.code,
      name: a.name,
      type: a.type,
      debit,
      credit,
    };
  });
  const totalTBDebit = trialBalanceRows.reduce((sum, r) => sum + r.debit, 0);
  const totalTBCredit = trialBalanceRows.reduce((sum, r) => sum + r.credit, 0);
  const cashAccountIds = new Set(
    activeAccounts
      .filter((account) => account.type === "asset" && /cash|bank|mobile money|momo/i.test(`${account.name} ${account.subType ?? ""}`))
      .map((account) => account.id),
  );
  const netCashMovement = filteredJournalEntries.reduce(
    (total, journal) =>
      total + journal.lines
        .filter((line) => cashAccountIds.has(line.accountId))
        .reduce((sum, line) => sum + line.debit - line.credit, 0),
    0,
  );

  const handleExportExcel = () => {
    let exportData: any[] = [];
    let reportName = "Financial_Report";

    if (selectedReport === "pnl") {
      reportName = "Profit_and_Loss_Statement";
      exportData = [
        { Section: "Operating Revenue", Account: "Total Sales", Amount: totalRevenue },
        { Section: "Cost of Goods Sold", Account: "Total COGS", Amount: totalCogs },
        { Section: "Gross Profit", Account: "Gross Profit", Amount: grossProfit },
        ...expenses.map((e) => ({ Section: "Operating Expenses", Account: e.name, Amount: e.balance })),
        { Section: "Net Profit", Account: "Net Profit for Period", Amount: netProfit },
      ];
    } else if (selectedReport === "balance_sheet") {
      reportName = "Balance_Sheet";
      exportData = [
        ...assetAccounts.map((a) => ({ Section: "Assets", Account: `${a.code} - ${a.name}`, Amount: a.balance })),
        { Section: "Total Assets", Account: "Total Assets", Amount: totalAssets },
        ...liabilityAccounts.map((a) => ({ Section: "Liabilities", Account: `${a.code} - ${a.name}`, Amount: Math.abs(a.balance) })),
        { Section: "Total Liabilities", Account: "Total Liabilities", Amount: totalLiabilities },
        ...equityAccounts.map((a) => ({ Section: "Equity", Account: `${a.code} - ${a.name}`, Amount: a.balance })),
        { Section: "Net Profit / Retained Earnings", Account: "Net Profit (Current Period)", Amount: netProfit },
        { Section: "Total Liabilities & Equity", Account: "Total Liabilities & Equity", Amount: totalLiabilities + totalEquity },
      ];
    } else if (selectedReport === "trial_balance") {
      reportName = "Trial_Balance";
      exportData = trialBalanceRows.map((r) => ({
        "Account Code": r.code,
        "Account Name": r.name,
        Type: r.type.toUpperCase(),
        Debit: r.debit,
        Credit: r.credit,
      }));
    } else {
      reportName = "General_Ledger";
      exportData = journalEntries.map((j) => ({
        "Journal Number": j.entryNumber,
        Date: j.date,
        Reference: j.reference,
        Description: j.description,
        Debit: j.totalDebit,
        Credit: j.totalCredit,
        Status: j.status,
      }));
    }

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, reportName);
    XLSX.writeFile(workbook, `${reportName}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleExportCSV = () => {
    let rows = `Financial Report: ${selectedReport.toUpperCase()}\nDate: ${new Date().toISOString()}\n\n`;
    if (selectedReport === "pnl") {
      rows += `Revenue,${totalRevenue}\nCOGS,${totalCogs}\nGross Profit,${grossProfit}\nTotal Expenses,${totalExpenses}\nNet Profit,${netProfit}\n`;
    } else {
      rows += `Total Assets,${totalAssets}\nTotal Liabilities,${totalLiabilities}\nTotal Equity,${totalEquity}\n`;
    }
    const blob = new Blob([rows], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `${selectedReport}_Report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* ── Report Type Switcher & Action Buttons ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setSelectedReport("pnl")}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all ${
              selectedReport === "pnl"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            Profit &amp; Loss
          </button>
          <button
            onClick={() => setSelectedReport("balance_sheet")}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all ${
              selectedReport === "balance_sheet"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            Balance Sheet
          </button>
          <button
            onClick={() => setSelectedReport("cash_flow")}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all ${
              selectedReport === "cash_flow"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            Cash Flow
          </button>
          <button
            onClick={() => setSelectedReport("trial_balance")}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all ${
              selectedReport === "trial_balance"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            Trial Balance
          </button>
          <button
            onClick={() => setSelectedReport("general_ledger")}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all ${
              selectedReport === "general_ledger"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            General Ledger
          </button>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 outline-none hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="This Year">This Year (2026)</option>
            <option value="This Month">This Month (May 2026)</option>
            <option value="This Quarter">This Quarter (Q2)</option>
            <option value="Last Year">Last Year (2025)</option>
          </select>

          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" /> Export Excel
          </button>
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" /> CSV
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            <Printer className="h-3.5 w-3.5" /> Print Report
          </button>
        </div>
      </div>

      {/* ── Report Presentation Paper Card ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900 max-w-4xl mx-auto">
        {/* Document Header */}
        <div className="border-b border-slate-200 pb-5 dark:border-slate-800 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white font-bold text-base mb-2">
            S
          </div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            ThinkSales Pro ERP — {selectedReport === "pnl" ? "Profit & Loss Statement" : selectedReport === "balance_sheet" ? "Balance Sheet Statement" : selectedReport === "cash_flow" ? "Cash Flow Statement" : selectedReport === "trial_balance" ? "Trial Balance Verification" : "General Ledger Register"}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            For the period: <span className="font-semibold text-slate-700 dark:text-slate-300">{liveSnapshot?.periodLabel ?? period}</span> · Branch: <span className="font-semibold text-slate-700 dark:text-slate-300">{reportBranch === "all" ? "All Locations" : reportBranch}</span> · Currency: <span className="font-semibold text-slate-700 dark:text-slate-300">{currentCurrency}</span>
          </p>
          {liveSnapshot && <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400">Live operational figures from sales, purchases, expenses, and accounting balances.</p>}
          {liveJournalEntries?.length ? <p className="mt-1 text-[11px] text-blue-600 dark:text-blue-400">Accounting source: {liveJournalEntries.length} persisted journal entries.</p> : null}
        </div>

        {/* ── PROFIT & LOSS REPORT ── */}
        {selectedReport === "pnl" && (
          <div className="mt-6 space-y-6 text-xs">
            {/* Revenue */}
            <div>
              <div className="flex justify-between border-b border-slate-200 pb-1.5 font-bold uppercase tracking-wide text-slate-600 dark:border-slate-800 dark:text-slate-400">
                <span>1. Operating Revenue</span>
                <span>Amount ({currentCurrency})</span>
              </div>
              <div className="divide-y divide-slate-100 py-1 dark:divide-slate-800/60">
                {revenues.map((r) => (
                  <div key={r.id} className="flex justify-between py-2 text-slate-700 dark:text-slate-300">
                    <span className="pl-4">{r.code} - {r.name}</span>
                    <span className="font-mono font-medium">{money(r.balance)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between border-t border-slate-200 py-2 font-bold text-slate-900 dark:border-slate-800 dark:text-white">
                <span className="pl-2">Total Operating Revenue</span>
                <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                  {money(totalRevenue)}
                </span>
              </div>
            </div>

            {/* Cost of Goods Sold */}
            <div>
              <div className="flex justify-between border-b border-slate-200 pb-1.5 font-bold uppercase tracking-wide text-slate-600 dark:border-slate-800 dark:text-slate-400">
                <span>2. Cost of Goods Sold (COGS)</span>
                <span>Amount ({currentCurrency})</span>
              </div>
              <div className="divide-y divide-slate-100 py-1 dark:divide-slate-800/60">
                {cogs.map((c) => (
                  <div key={c.id} className="flex justify-between py-2 text-slate-700 dark:text-slate-300">
                    <span className="pl-4">{c.code} - {c.name}</span>
                    <span className="font-mono font-medium">{money(c.balance)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between border-t border-slate-200 py-2 font-bold text-slate-900 dark:border-slate-800 dark:text-white">
                <span className="pl-2">Total Cost of Goods Sold</span>
                <span className="font-mono font-bold text-rose-500">
                  ({money(totalCogs)})
                </span>
              </div>
            </div>

            {/* Gross Profit Callout */}
            <div className="rounded-xl bg-slate-50 p-3 border border-slate-200 dark:bg-slate-800/60 dark:border-slate-700 flex justify-between font-bold text-sm">
              <span className="text-slate-800 dark:text-white">Gross Profit</span>
              <span className="font-mono text-slate-900 dark:text-white">
                {money(grossProfit)}
              </span>
            </div>

            {/* Operating Expenses */}
            <div>
              <div className="flex justify-between border-b border-slate-200 pb-1.5 font-bold uppercase tracking-wide text-slate-600 dark:border-slate-800 dark:text-slate-400">
                <span>3. Operating Expenses</span>
                <span>Amount ({currentCurrency})</span>
              </div>
              <div className="divide-y divide-slate-100 py-1 dark:divide-slate-800/60">
                {expenses.map((e) => (
                  <div key={e.id} className="flex justify-between py-2 text-slate-700 dark:text-slate-300">
                    <span className="pl-4">{e.code} - {e.name}</span>
                    <span className="font-mono font-medium">{money(e.balance)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between border-t border-slate-200 py-2 font-bold text-slate-900 dark:border-slate-800 dark:text-white">
                <span className="pl-2">Total Operating Expenses</span>
                <span className="font-mono font-bold text-rose-500">
                  ({money(totalExpenses)})
                </span>
              </div>
            </div>

            {/* Net Profit Bottom Line */}
            <div className="rounded-2xl bg-emerald-50/70 p-4 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-900 flex justify-between items-center text-base font-bold">
              <span className="text-emerald-900 dark:text-emerald-300">Net Profit for the Period</span>
              <span className="font-mono text-xl text-emerald-700 dark:text-emerald-400">
                {money(netProfit)}
              </span>
            </div>
          </div>
        )}

        {/* ── BALANCE SHEET REPORT ── */}
        {selectedReport === "balance_sheet" && (
          <div className="mt-6 space-y-6 text-xs">
            {/* Assets */}
            <div>
              <div className="flex justify-between border-b border-slate-200 pb-1.5 font-bold uppercase tracking-wide text-slate-600 dark:border-slate-800">
                <span>Assets</span>
                <span>Balance ({currentCurrency})</span>
              </div>
              <div className="divide-y divide-slate-100 py-1 dark:divide-slate-800">
                {assetAccounts.map((a) => (
                  <div key={a.id} className="flex justify-between py-2 text-slate-700 dark:text-slate-300">
                    <span className="pl-4">{a.code} - {a.name}</span>
                    <span className="font-mono">{money(a.balance)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between border-t border-slate-200 py-2 font-bold text-blue-600 text-sm">
                <span>Total Assets</span>
                <span className="font-mono">{money(totalAssets)}</span>
              </div>
            </div>

            {/* Liabilities */}
            <div>
              <div className="flex justify-between border-b border-slate-200 pb-1.5 font-bold uppercase tracking-wide text-slate-600 dark:border-slate-800">
                <span>Liabilities</span>
                <span>Balance ({currentCurrency})</span>
              </div>
              <div className="divide-y divide-slate-100 py-1 dark:divide-slate-800">
                {liabilityAccounts.map((a) => (
                  <div key={a.id} className="flex justify-between py-2 text-slate-700 dark:text-slate-300">
                    <span className="pl-4">{a.code} - {a.name}</span>
                    <span className="font-mono">{money(Math.abs(a.balance))}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between border-t border-slate-200 py-2 font-bold text-rose-600 text-sm">
                <span>Total Liabilities</span>
                <span className="font-mono">{money(totalLiabilities)}</span>
              </div>
            </div>

            {/* Equity */}
            <div>
              <div className="flex justify-between border-b border-slate-200 pb-1.5 font-bold uppercase tracking-wide text-slate-600 dark:border-slate-800">
                <span>Equity</span>
                <span>Balance ({currentCurrency})</span>
              </div>
              <div className="divide-y divide-slate-100 py-1 dark:divide-slate-800">
                {equityAccounts.map((a) => (
                  <div key={a.id} className="flex justify-between py-2 text-slate-700 dark:text-slate-300">
                    <span className="pl-4">{a.code} - {a.name}</span>
                    <span className="font-mono">{money(a.balance)}</span>
                  </div>
                ))}
                <div className="flex justify-between py-2 text-slate-700 dark:text-slate-300">
                  <span className="pl-4 font-semibold text-emerald-600">Current Period Net Profit</span>
                  <span className="font-mono font-semibold text-emerald-600">
                    {money(netProfit)}
                  </span>
                </div>
              </div>
              <div className="flex justify-between border-t border-slate-200 py-2 font-bold text-purple-600 text-sm">
                <span>Total Equity</span>
                <span className="font-mono">{money(totalEquity)}</span>
              </div>
            </div>

            {/* Balanced Check Verification */}
            <div className="rounded-xl bg-slate-50 p-4 border border-slate-200 dark:bg-slate-800/60 dark:border-slate-700 flex justify-between items-center font-bold text-sm">
              <span className="text-slate-800 dark:text-white">Total Liabilities &amp; Equity</span>
              <span className="font-mono text-blue-600 dark:text-blue-400">
                {money(totalLiabilities + totalEquity)}
              </span>
            </div>
          </div>
        )}

        {/* ── TRIAL BALANCE REPORT ── */}
        {selectedReport === "trial_balance" && (
          <div className="mt-6 text-xs">
            <table className="w-full text-left border border-slate-200 rounded-xl overflow-hidden">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 dark:bg-slate-800">
                <tr>
                  <th className="p-2.5">Code</th>
                  <th className="p-2.5">Account Name</th>
                  <th className="p-2.5">Type</th>
                  <th className="p-2.5 text-right">Debit ({currentCurrency})</th>
                  <th className="p-2.5 text-right">Credit ({currentCurrency})</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {trialBalanceRows.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50/50">
                    <td className="p-2.5 font-mono font-bold text-blue-600">{r.code}</td>
                    <td className="p-2.5 font-medium">{r.name}</td>
                    <td className="p-2.5 uppercase font-mono text-[10px] text-slate-400">{r.type}</td>
                    <td className="p-2.5 text-right font-mono font-semibold">
                      {r.debit > 0 ? money(r.debit) : "-"}
                    </td>
                    <td className="p-2.5 text-right font-mono font-semibold">
                      {r.credit > 0 ? money(r.credit) : "-"}
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-bold dark:bg-slate-800">
                  <td colSpan={3} className="p-2.5 text-right uppercase">
                    Verification Total:
                  </td>
                  <td className="p-2.5 text-right font-mono text-emerald-600">
                    {money(totalTBDebit)}
                  </td>
                  <td className="p-2.5 text-right font-mono text-emerald-600">
                    {money(totalTBCredit)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* ── CASH FLOW STATEMENT ── */}
        {selectedReport === "cash_flow" && (
          <div className="mt-6 space-y-6 text-xs">
            <div>
              <div className="flex justify-between border-b border-slate-200 pb-1.5 font-bold uppercase tracking-wide text-slate-600 dark:border-slate-800">
                <span>1. Cash Flow from Operating Activities</span>
                <span>Amount ({currentCurrency})</span>
              </div>
              <div className="divide-y divide-slate-100 py-1 dark:divide-slate-800">
                <div className="flex justify-between py-2 text-slate-700 pl-4">
                  <span>Net Profit</span>
                  <span className="font-mono">{money(netProfit)}</span>
                </div>
                <div className="flex justify-between py-2 text-slate-700 pl-4">
                  <span>Net movement in cash and bank accounts (posted journals)</span>
                  <span className="font-mono">{money(netCashMovement)}</span>
                </div>
              </div>
              <div className="flex justify-between border-t border-slate-200 py-2 font-bold text-slate-900">
                <span className="pl-2">Net Cash from Operating Activities</span>
                <span className="font-mono text-emerald-600">{money(netCashMovement)}</span>
              </div>
            </div>

            <div>
              <div className="flex justify-between border-b border-slate-200 pb-1.5 font-bold uppercase tracking-wide text-slate-600 dark:border-slate-800">
                <span>2. Cash Flow from Investing Activities</span>
                <span>Amount ({currentCurrency})</span>
              </div>
              <div className="divide-y divide-slate-100 py-1 dark:divide-slate-800">
                <div className="py-2 pl-4 text-slate-500">
                  Investing activity classification will appear when posted journal entries identify fixed-asset transactions.
                </div>
              </div>
              <div className="flex justify-between border-t border-slate-200 py-2 font-bold text-slate-900">
                <span className="pl-2">Net Cash from Investing Activities</span>
                <span className="font-mono text-rose-500">0.00</span>
              </div>
            </div>

            <div className="rounded-xl bg-blue-50 p-4 border border-blue-200 dark:bg-blue-950/40 flex justify-between font-bold text-sm">
              <span className="text-blue-900 dark:text-blue-300">Net Increase in Cash &amp; Bank Balances</span>
              <span className="font-mono text-blue-700 dark:text-blue-300">
                {money(netCashMovement)}
              </span>
            </div>
            {!liveJournalEntries?.length && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                No persisted posted journal entries are available for this organization, so cash flow is currently zero rather than estimated from demo values.
              </p>
            )}
          </div>
        )}

        {/* ── GENERAL LEDGER ── */}
        {selectedReport === "general_ledger" && (
          <div className="mt-6 text-xs">
            <table className="w-full text-left border border-slate-200 rounded-xl overflow-hidden">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 dark:bg-slate-800">
                <tr>
                  <th className="p-2.5">Date</th>
                  <th className="p-2.5">Journal #</th>
                  <th className="p-2.5">Reference</th>
                  <th className="p-2.5">Description</th>
                  <th className="p-2.5 text-right">Debit ({currentCurrency})</th>
                  <th className="p-2.5 text-right">Credit ({currentCurrency})</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredJournalEntries.map((j) => (
                  <tr key={j.id} className="hover:bg-slate-50/50">
                    <td className="p-2.5">{j.date}</td>
                    <td className="p-2.5 font-mono font-bold text-blue-600">{j.entryNumber}</td>
                    <td className="p-2.5 font-mono text-slate-500">{j.reference}</td>
                    <td className="p-2.5 font-medium">{j.description}</td>
                    <td className="p-2.5 text-right font-mono font-semibold">
                      {money(j.totalDebit)}
                    </td>
                    <td className="p-2.5 text-right font-mono font-semibold">
                      {money(j.totalCredit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
