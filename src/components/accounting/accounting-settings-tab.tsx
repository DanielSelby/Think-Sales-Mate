"use client";

import React, { useState } from "react";
import {
  Settings,
  Calendar,
  Lock,
  Unlock,
  Coins,
  FileText,
  ShieldCheck,
  CheckCircle2,
  Save,
} from "lucide-react";
import { useAccountingStore } from "@/lib/accounting/accounting-store";

export function AccountingSettingsTab() {
  const { settings, updateSettings, currentCurrency } = useAccountingStore();

  const [savedMsg, setSavedMsg] = useState(false);

  // Form State
  const [fyStart, setFyStart] = useState(settings.financialYearStart);
  const [fyEnd, setFyEnd] = useState(settings.financialYearEnd);
  const [lockDate, setLockDate] = useState(settings.periodLockDate);
  const [defCurrency, setDefCurrency] = useState(settings.defaultCurrency);
  const [approvalThreshold, setApprovalThreshold] = useState(settings.approvalThreshold);

  const [autoRules, setAutoRules] = useState({ ...settings.autoJournalRules });
  const [sequences, setSequences] = useState({ ...settings.numberSequences });

  // 12 Accounting Periods Mock
  const [periods, setPeriods] = useState([
    { month: "January 2026", status: "Closed", lock: true },
    { month: "February 2026", status: "Closed", lock: true },
    { month: "March 2026", status: "Closed", lock: true },
    { month: "April 2026", status: "Closed", lock: true },
    { month: "May 2026", status: "Open", lock: false },
    { month: "June 2026", status: "Open", lock: false },
    { month: "July 2026", status: "Open", lock: false },
    { month: "August 2026", status: "Open", lock: false },
    { month: "September 2026", status: "Open", lock: false },
    { month: "October 2026", status: "Open", lock: false },
    { month: "November 2026", status: "Open", lock: false },
    { month: "December 2026", status: "Open", lock: false },
  ]);

  const togglePeriodLock = (idx: number) => {
    const updated = [...periods];
    updated[idx].lock = !updated[idx].lock;
    updated[idx].status = updated[idx].lock ? "Closed" : "Open";
    setPeriods(updated);
  };

  const handleSaveAll = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings({
      financialYearStart: fyStart,
      financialYearEnd: fyEnd,
      periodLockDate: lockDate,
      defaultCurrency: defCurrency,
      approvalThreshold,
      autoJournalRules: autoRules,
      numberSequences: sequences,
    });
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 3000);
  };

  return (
    <form onSubmit={handleSaveAll} className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            Accounting Configuration &amp; Policies
          </h2>
          <p className="text-xs text-slate-500">
            Configure financial years, closing periods, auto-journal triggers, and approval workflows
          </p>
        </div>
        <button
          type="submit"
          className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition-all"
        >
          <Save className="h-3.5 w-3.5" /> Save Configuration
        </button>
      </div>

      {savedMsg && (
        <div className="rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
          <CheckCircle2 className="inline h-4 w-4 mr-1.5" />
          Settings successfully updated across ThinkSales Pro Accounting System.
        </div>
      )}

      {/* ── Section 1: Financial Year & Period Closing ── */}
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
          <Calendar className="h-4 w-4 text-blue-600" />
          <h3>Financial Year &amp; Closing Period</h3>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 text-xs">
          <div>
            <label className="font-medium text-slate-700 dark:text-slate-300">Financial Year Start</label>
            <input
              type="date"
              value={fyStart}
              onChange={(e) => setFyStart(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="font-medium text-slate-700 dark:text-slate-300">Financial Year End</label>
            <input
              type="date"
              value={fyEnd}
              onChange={(e) => setFyEnd(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="font-medium text-slate-700 dark:text-slate-300">Hard Period Lock Date</label>
            <input
              type="date"
              value={lockDate}
              onChange={(e) => setLockDate(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800"
            />
            <p className="mt-1 text-[10px] text-slate-400">Transactions prior to this date cannot be modified</p>
          </div>
        </div>

        {/* 12 Months Status Table */}
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
          <p className="font-semibold text-xs text-slate-700 dark:text-slate-300 mb-2.5">
            FY 2026 Monthly Accounting Periods
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6 text-xs">
            {periods.map((p, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between rounded-xl border border-slate-100 p-2.5 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-800/40"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-[11px] text-slate-800 dark:text-slate-200 truncate">{p.month}</p>
                  <p className={`text-[10px] font-bold ${p.lock ? "text-rose-500" : "text-emerald-600"}`}>{p.status}</p>
                </div>
                <button
                  type="button"
                  onClick={() => togglePeriodLock(idx)}
                  className={`rounded-lg p-1 ${p.lock ? "text-rose-500 hover:bg-rose-50" : "text-emerald-600 hover:bg-emerald-50"}`}
                >
                  {p.lock ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Section 2: Automated Double-Entry Rules ── */}
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          <h3>Automated General Ledger Posting Rules</h3>
        </div>
        <p className="text-xs text-slate-500">
          When transactions occur in other ThinkSales ERP modules, automatically generate balanced journal entries:
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
          <label className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-800/40 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRules.sales}
              onChange={(e) => setAutoRules({ ...autoRules, sales: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <p className="font-semibold text-slate-800 dark:text-white">Sales &amp; POS Module Integration</p>
              <p className="text-[11px] text-slate-400">Auto-post Dr Cash/Bank, Cr Sales Revenue, Cr Tax Payable</p>
            </div>
          </label>

          <label className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-800/40 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRules.purchases}
              onChange={(e) => setAutoRules({ ...autoRules, purchases: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <p className="font-semibold text-slate-800 dark:text-white">Purchases &amp; Receiving Integration</p>
              <p className="text-[11px] text-slate-400">Auto-post Dr Inventory / COGS, Cr Accounts Payable</p>
            </div>
          </label>

          <label className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-800/40 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRules.expenses}
              onChange={(e) => setAutoRules({ ...autoRules, expenses: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <p className="font-semibold text-slate-800 dark:text-white">Expense Approvals &amp; Payouts</p>
              <p className="text-[11px] text-slate-400">Auto-post Dr Expense Account, Cr Bank/Cash Account</p>
            </div>
          </label>

          <label className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-800/40 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRules.inventoryAdjustments}
              onChange={(e) => setAutoRules({ ...autoRules, inventoryAdjustments: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <p className="font-semibold text-slate-800 dark:text-white">Inventory Stock Adjustments</p>
              <p className="text-[11px] text-slate-400">Auto-post Dr Stock Loss / Gain, Cr Inventory Asset</p>
            </div>
          </label>
        </div>
      </div>

      {/* ── Section 3: Document Number Sequences & Approvals ── */}
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
          <FileText className="h-4 w-4 text-purple-600" />
          <h3>Document Number Sequences &amp; Approval Workflows</h3>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4 text-xs">
          <div>
            <label className="font-medium text-slate-700 dark:text-slate-300">Journal Entry Prefix</label>
            <input
              type="text"
              value={sequences.journalPrefix}
              onChange={(e) => setSequences({ ...sequences, journalPrefix: e.target.value })}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="font-medium text-slate-700 dark:text-slate-300">Invoice Prefix</label>
            <input
              type="text"
              value={sequences.invoicePrefix}
              onChange={(e) => setSequences({ ...sequences, invoicePrefix: e.target.value })}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="font-medium text-slate-700 dark:text-slate-300">Supplier Bill Prefix</label>
            <input
              type="text"
              value={sequences.billPrefix}
              onChange={(e) => setSequences({ ...sequences, billPrefix: e.target.value })}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="font-medium text-slate-700 dark:text-slate-300">
              Journal Approval Threshold ({currentCurrency})
            </label>
            <input
              type="number"
              value={approvalThreshold}
              onChange={(e) => setApprovalThreshold(parseFloat(e.target.value) || 0)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
        </div>
      </div>
    </form>
  );
}
