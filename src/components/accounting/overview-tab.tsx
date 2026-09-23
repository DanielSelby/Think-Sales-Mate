"use client";

import React, { useState } from "react";
import {
  Wallet,
  ShoppingCart,
  Coins,
  Landmark,
  FileText,
  PieChart as PieChartIcon,
  ChevronRight,
  PlusCircle,
  MinusCircle,
  ArrowUpRight,
  Shield,
  CreditCard,
  Receipt,
  FileSpreadsheet,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useAccountingStore } from "@/lib/accounting/accounting-store";
import { formatMoney } from "@/lib/currency";
import type { AccountsPayableItem, AccountsReceivableItem, AccountingAccount, JournalEntry } from "@/types/accounting";
import type { LiveFinancialSnapshot } from "./financial-reports-tab";

interface OverviewTabProps {
  onOpenJournalModal?: () => void;
  onOpenExpenseModal?: () => void;
  onOpenIncomeModal?: () => void;
  onOpenInvoiceModal?: () => void;
  onOpenBillModal?: () => void;
  liveSnapshot?: LiveFinancialSnapshot;
  liveAccounts?: AccountingAccount[];
  liveJournalEntries?: JournalEntry[];
  liveReceivables?: AccountsReceivableItem[];
  livePayables?: AccountsPayableItem[];
  dateFrom?: string;
  dateTo?: string;
}

export function OverviewTab({
  onOpenJournalModal,
  onOpenExpenseModal,
  onOpenIncomeModal,
  onOpenInvoiceModal,
  onOpenBillModal,
  liveSnapshot,
  liveAccounts = [],
  liveJournalEntries = [],
  liveReceivables = [],
  livePayables = [],
  dateFrom,
  dateTo,
}: OverviewTabProps) {
  const {
    currentCurrency,
    currentCurrencyCode,
    setActiveTab,
    getKPIs,
    getIncomeVsExpensesTrend,
    getExpenseBreakdown,
    getRecentTransactions,
    getAccountsSummary,
    getAccountBalancesList,
    getReceivablesAging,
    getPayablesAging,
    getFinancialYearProgress,
  } = useAccountingStore();

  const [incomePeriod, setIncomePeriod] = useState("This Year");
  const [expensePeriod, setExpensePeriod] = useState("This Month");

  const fallbackKpis = getKPIs();
  const fallbackTrendData = getIncomeVsExpensesTrend();
  const fallbackExpenseSlices = getExpenseBreakdown();
  const fallbackRecentTransactions = getRecentTransactions();
  const fallbackAccountsSummary = getAccountsSummary();
  const fallbackAccountBalances = getAccountBalancesList();
  const fallbackArAging = getReceivablesAging();
  const fallbackApAging = getPayablesAging();
  const fallbackFyProgress = getFinancialYearProgress();

  const liveKpis = liveSnapshot?.kpis;
  const liveBalanceSheet = liveSnapshot?.balanceSheet;
  const kpis = liveKpis
    ? {
        totalIncome: liveKpis.totalRevenue,
        totalIncomeChangePct: liveKpis.totalRevenueChange,
        totalExpenses: liveKpis.totalExpenses,
        totalExpensesChangePct: liveKpis.totalExpensesChange,
        netProfit: liveKpis.netProfit,
        netProfitChangePct: liveKpis.netProfitChange,
        totalAssets: liveBalanceSheet?.totalAssets ?? 0,
        totalAssetsChangePct: 0,
        totalLiabilities: liveBalanceSheet?.totalLiabilities ?? 0,
        totalLiabilitiesChangePct: 0,
        totalEquity: liveBalanceSheet?.totalEquity ?? 0,
        totalEquityChangePct: 0,
      }
    : fallbackKpis;

  const hasLiveData = Boolean(liveSnapshot);
  const liveAccountsById = new Map(liveAccounts.map((account) => [account.id, account]));
  const postedJournals = liveJournalEntries.filter((journal) => journal.status === "posted");
  const liveExpenseTotals = new Map<string, number>();
  const monthlyTotals = new Map<string, { income: number; expenses: number }>();
  for (const journal of postedJournals) {
    const month = new Date(`${journal.date}T00:00:00`).toLocaleDateString("en-US", { month: "short" });
    const monthTotals = monthlyTotals.get(month) ?? { income: 0, expenses: 0 };
    for (const line of journal.lines) {
      const account = liveAccountsById.get(line.accountId);
      const debit = Number(line.debit ?? 0);
      const credit = Number(line.credit ?? 0);
      if (account?.type === "revenue") monthTotals.income += credit - debit;
      if (account?.type === "expense" || account?.type === "cogs") {
        const amount = debit - credit;
        monthTotals.expenses += amount;
        liveExpenseTotals.set(account.name, (liveExpenseTotals.get(account.name) ?? 0) + amount);
      }
    }
    monthlyTotals.set(month, monthTotals);
  }
  const liveTrendData = [...monthlyTotals.entries()].map(([month, values]) => ({ month, ...values }));
  const liveExpenseTotal = [...liveExpenseTotals.values()].reduce((sum, value) => sum + value, 0);
  const liveExpenseSlices = [...liveExpenseTotals.entries()]
    .sort(([, first], [, second]) => second - first)
    .map(([name, value], index) => ({
      name,
      value,
      percentage: liveExpenseTotal > 0 ? Math.round((value / liveExpenseTotal) * 1000) / 10 : 0,
      color: ["#2563EB", "#0D9488", "#EAB308", "#F97316", "#64748B"][index % 5],
    }));
  const liveRecentTransactions = postedJournals.slice(0, 5).map((journal) => {
    const income = journal.lines.reduce((sum, line) => {
      const account = liveAccountsById.get(line.accountId);
      return sum + (account?.type === "revenue" ? Number(line.credit ?? 0) - Number(line.debit ?? 0) : 0);
    }, 0);
    return {
      id: journal.id,
      date: new Date(`${journal.date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      reference: journal.reference || journal.entryNumber,
      description: journal.description,
      account: journal.lines[0]?.accountName ?? "Journal entry",
      type: income > 0 ? "Income" as const : "Expense" as const,
      amount: Math.max(Number(journal.totalDebit ?? 0), Number(journal.totalCredit ?? 0)),
      status: journal.status === "posted" ? "Posted" as const : journal.status === "reversed" ? "Reversed" as const : "Draft" as const,
    };
  });
  const liveAccountsSummary = liveAccounts.map((account) => ({ name: `${account.code} - ${account.name}`, balance: account.balance }));
  const liveAccountBalances = liveAccounts.map((account) => ({
    name: account.name,
    balance: account.balance,
    type: account.subType || account.type,
    icon: account.type === "asset" ? "landmark" : account.type === "liability" ? "credit-card" : "wallet",
  }));
  const aging = (items: { outstandingAmount: number; daysOutstanding: number }[]) => {
    const buckets = [0, 0, 0, 0];
    for (const item of items) {
      if (item.outstandingAmount <= 0) continue;
      if (item.daysOutstanding <= 0) buckets[0] += item.outstandingAmount;
      else if (item.daysOutstanding <= 30) buckets[1] += item.outstandingAmount;
      else if (item.daysOutstanding <= 60) buckets[2] += item.outstandingAmount;
      else buckets[3] += item.outstandingAmount;
    }
    const total = buckets.reduce((sum, value) => sum + value, 0);
    const pct = (value: number) => total > 0 ? Math.round((value / total) * 1000) / 10 : 0;
    return { current: buckets[0], currentPct: pct(buckets[0]), days30: buckets[1], days30Pct: pct(buckets[1]), days60: buckets[2], days60Pct: pct(buckets[2]), over60: buckets[3], over60Pct: pct(buckets[3]), total };
  };
  const arAging = hasLiveData ? aging(liveReceivables) : fallbackArAging;
  const apAging = hasLiveData ? aging(livePayables) : fallbackApAging;
  const trendData = hasLiveData ? liveTrendData : fallbackTrendData;
  const expenseSlices = hasLiveData ? liveExpenseSlices : fallbackExpenseSlices;
  const recentTransactions = hasLiveData ? liveRecentTransactions : fallbackRecentTransactions;
  const accountsSummary = hasLiveData ? liveAccountsSummary : fallbackAccountsSummary;
  const accountBalances = hasLiveData ? liveAccountBalances : fallbackAccountBalances;
  const fyProgress = hasLiveData && dateFrom && dateTo
    ? { percentage: Math.min(100, Math.max(0, Math.round(((new Date(dateTo).getTime() - new Date(dateFrom).getTime() + 86400000) / (365 * 86400000)) * 100))), label: `${dateFrom} to ${dateTo}` }
    : fallbackFyProgress;

  const formatCurrency = (val: number) => val < 0 ? `(${formatMoney(Math.abs(val), currentCurrencyCode)})` : formatMoney(val, currentCurrencyCode);

  const totalExpenseVal = expenseSlices.reduce((sum, s) => sum + s.value, 0);

  return (
    <div className="space-y-6">
      {/* ── 1. KPI Cards Row (6 Cards) ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
        {/* Total Income */}
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
              <Wallet className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Income</p>
              <p className="font-display text-lg font-bold text-slate-900 dark:text-white truncate">
                {formatCurrency(kpis.totalIncome)}
              </p>
            </div>
          </div>
          <div className="mt-2.5 flex items-center text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            <span>▲ {kpis.totalIncomeChangePct}%</span>
            <span className="ml-1 text-slate-400 dark:text-slate-500 font-normal">vs last month</span>
          </div>
        </div>

        {/* Total Expenses */}
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-500 dark:bg-rose-950/60 dark:text-rose-400">
              <ShoppingCart className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Expenses</p>
              <p className="font-display text-lg font-bold text-slate-900 dark:text-white truncate">
                {formatCurrency(kpis.totalExpenses)}
              </p>
            </div>
          </div>
          <div className="mt-2.5 flex items-center text-xs text-rose-500 dark:text-rose-400 font-medium">
            <span>▲ {kpis.totalExpensesChangePct}%</span>
            <span className="ml-1 text-slate-400 dark:text-slate-500 font-normal">vs last month</span>
          </div>
        </div>

        {/* Net Profit */}
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
              <Coins className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Net Profit</p>
              <p className="font-display text-lg font-bold text-slate-900 dark:text-white truncate">
                {formatCurrency(kpis.netProfit)}
              </p>
            </div>
          </div>
          <div className="mt-2.5 flex items-center text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            <span>▲ {kpis.netProfitChangePct}%</span>
            <span className="ml-1 text-slate-400 dark:text-slate-500 font-normal">vs last month</span>
          </div>
        </div>

        {/* Total Assets */}
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600 dark:bg-teal-950/60 dark:text-teal-400">
              <Landmark className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Assets</p>
              <p className="font-display text-lg font-bold text-slate-900 dark:text-white truncate">
                {formatCurrency(kpis.totalAssets)}
              </p>
            </div>
          </div>
          <div className="mt-2.5 flex items-center text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            <span>▲ {kpis.totalAssetsChangePct}%</span>
            <span className="ml-1 text-slate-400 dark:text-slate-500 font-normal">vs last month</span>
          </div>
        </div>

        {/* Total Liabilities */}
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-500 dark:bg-rose-950/60 dark:text-rose-400">
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Liabilities</p>
              <p className="font-display text-lg font-bold text-slate-900 dark:text-white truncate">
                {formatCurrency(kpis.totalLiabilities)}
              </p>
            </div>
          </div>
          <div className="mt-2.5 flex items-center text-xs text-rose-500 dark:text-rose-400 font-medium">
            <span>▲ {kpis.totalLiabilitiesChangePct}%</span>
            <span className="ml-1 text-slate-400 dark:text-slate-500 font-normal">vs last month</span>
          </div>
        </div>

        {/* Total Equity */}
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
              <PieChartIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Equity</p>
              <p className="font-display text-lg font-bold text-slate-900 dark:text-white truncate">
                {formatCurrency(kpis.totalEquity)}
              </p>
            </div>
          </div>
          <div className="mt-2.5 flex items-center text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            <span>▲ {kpis.totalEquityChangePct}%</span>
            <span className="ml-1 text-slate-400 dark:text-slate-500 font-normal">vs last month</span>
          </div>
        </div>
      </div>

      {/* ── 2. Middle Row: Charts & Quick Actions (3 Columns) ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Income vs Expenses Bar Chart (5 cols) */}
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:col-span-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">Income vs Expenses</h3>
              <div className="mt-1 flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-600" /> Income
                </span>
                <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Expenses
                </span>
              </div>
            </div>
            <select
              value={incomePeriod}
              onChange={(e) => setIncomePeriod(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 outline-none hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="This Year">This Year</option>
              <option value="This Quarter">This Quarter</option>
              <option value="Last Year">Last Year</option>
            </select>
          </div>

          <div className="mt-4 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <XAxis
                  dataKey="month"
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: "#e2e8f0" }}
                />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => `${val / 1000}K`}
                />
                <RechartsTooltip
                  formatter={(val: number) => [formatCurrency(val), ""]}
                  contentStyle={{
                    backgroundColor: "#1e293b",
                    borderRadius: "8px",
                    border: "none",
                    color: "#fff",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="income" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={14} />
                <Bar dataKey="expenses" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Expense Breakdown Donut Chart (4 cols) */}
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:col-span-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">Expense Breakdown</h3>
            <select
              value={expensePeriod}
              onChange={(e) => setExpensePeriod(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 outline-none hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="This Month">This Month</option>
              <option value="This Quarter">This Quarter</option>
              <option value="This Year">This Year</option>
            </select>
          </div>

          <div className="mt-2 flex flex-col items-center justify-between sm:flex-row gap-4">
            {/* Donut with center text */}
            <div className="relative h-52 w-52 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={expenseSlices}
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={82}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {expenseSlices.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    formatter={(val: number) => [formatCurrency(val), ""]}
                    contentStyle={{
                      backgroundColor: "#1e293b",
                      borderRadius: "8px",
                      border: "none",
                      color: "#fff",
                      fontSize: "12px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{currentCurrency}</span>
                <span className="font-display text-sm font-bold text-slate-800 dark:text-white">
                  {formatCurrency(totalExpenseVal)}
                </span>
              </div>
            </div>

            {/* Category breakdown legend */}
            <div className="min-w-0 flex-1 space-y-1.5 text-xs">
              {expenseSlices.map((slice) => (
                <div key={slice.name} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 truncate text-slate-600 dark:text-slate-400">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: slice.color }} />
                    <span className="truncate">{slice.name}</span>
                  </span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200 shrink-0">
                    {slice.percentage}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Quick Actions (3 cols) */}
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:col-span-3">
          <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">Quick Actions</h3>
          <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            <button
              onClick={() => (onOpenJournalModal ? onOpenJournalModal() : setActiveTab("journal"))}
              className="flex w-full items-center justify-between py-2.5 text-left text-xs font-medium text-slate-700 transition-colors hover:text-blue-600 dark:text-slate-300"
            >
              <span className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950">
                  <PlusCircle className="h-4 w-4" />
                </span>
                Create Journal Entry
              </span>
              <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            </button>

            <button
              onClick={() => (onOpenExpenseModal ? onOpenExpenseModal() : setActiveTab("overview"))}
              className="flex w-full items-center justify-between py-2.5 text-left text-xs font-medium text-slate-700 transition-colors hover:text-rose-600 dark:text-slate-300"
            >
              <span className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-500 dark:bg-rose-950">
                  <MinusCircle className="h-4 w-4" />
                </span>
                Record Expense
              </span>
              <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            </button>

            <button
              onClick={() => (onOpenIncomeModal ? onOpenIncomeModal() : setActiveTab("overview"))}
              className="flex w-full items-center justify-between py-2.5 text-left text-xs font-medium text-slate-700 transition-colors hover:text-emerald-600 dark:text-slate-300"
            >
              <span className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950">
                  <ArrowUpRight className="h-4 w-4" />
                </span>
                Record Income
              </span>
              <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            </button>

            <button
              onClick={() => setActiveTab("reconciliation")}
              className="flex w-full items-center justify-between py-2.5 text-left text-xs font-medium text-slate-700 transition-colors hover:text-teal-600 dark:text-slate-300"
            >
              <span className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-teal-600 dark:bg-teal-950">
                  <Landmark className="h-4 w-4" />
                </span>
                Reconcile Bank Account
              </span>
              <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            </button>

            <button
              onClick={() => (onOpenInvoiceModal ? onOpenInvoiceModal() : setActiveTab("receivables"))}
              className="flex w-full items-center justify-between py-2.5 text-left text-xs font-medium text-slate-700 transition-colors hover:text-blue-600 dark:text-slate-300"
            >
              <span className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950">
                  <FileText className="h-4 w-4" />
                </span>
                Create Invoice
              </span>
              <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            </button>

            <button
              onClick={() => (onOpenBillModal ? onOpenBillModal() : setActiveTab("payables"))}
              className="flex w-full items-center justify-between py-2.5 text-left text-xs font-medium text-slate-700 transition-colors hover:text-rose-600 dark:text-slate-300"
            >
              <span className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-500 dark:bg-rose-950">
                  <Receipt className="h-4 w-4" />
                </span>
                Create Bill
              </span>
              <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            </button>

            <button
              onClick={() => setActiveTab("reports")}
              className="flex w-full items-center justify-between py-2.5 text-left text-xs font-medium text-slate-700 transition-colors hover:text-indigo-600 dark:text-slate-300"
            >
              <span className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950">
                  <FileSpreadsheet className="h-4 w-4" />
                </span>
                View Financial Reports
              </span>
              <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            </button>
          </div>
        </div>
      </div>

      {/* ── 3. Lower Section: Recent Transactions, Accounts Summary, Account Balances & FY Progress ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Recent Transactions (5 cols) */}
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:col-span-5">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">Recent Transactions</h3>
            <button
              onClick={() => setActiveTab("journal")}
              className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
            >
              View All
            </button>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-semibold text-slate-400 dark:border-slate-800">
                  <th className="pb-2">Date</th>
                  <th className="pb-2">Reference</th>
                  <th className="pb-2">Description</th>
                  <th className="pb-2">Account</th>
                  <th className="pb-2">Type</th>
                  <th className="pb-2 text-right">Amount</th>
                  <th className="pb-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                {recentTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    <td className="py-2.5 whitespace-nowrap text-slate-500">{tx.date}</td>
                    <td className="py-2.5 whitespace-nowrap font-mono font-medium text-slate-800 dark:text-slate-200">
                      {tx.reference}
                    </td>
                    <td className="py-2.5 whitespace-nowrap text-slate-700 dark:text-slate-300">{tx.description}</td>
                    <td className="py-2.5 whitespace-nowrap text-slate-500">{tx.account}</td>
                    <td className="py-2.5 whitespace-nowrap">
                      <span
                        className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                          tx.type === "Income"
                            ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400"
                            : "bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400"
                        }`}
                      >
                        {tx.type}
                      </span>
                    </td>
                    <td className="py-2.5 whitespace-nowrap text-right font-medium text-slate-900 dark:text-white">
                      {formatCurrency(tx.amount)}
                    </td>
                    <td className="py-2.5 whitespace-nowrap text-center">
                      <span className="inline-flex rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                        {tx.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Accounts Summary (4 cols) */}
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:col-span-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">Accounts Summary</h3>
            <button
              onClick={() => setActiveTab("coa")}
              className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
            >
              View All
            </button>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-semibold text-slate-400 dark:border-slate-800">
                  <th className="pb-2">Account Name</th>
                  <th className="pb-2 text-right">Balance ({currentCurrency})</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                {accountsSummary.map((acc, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    <td className="py-2.5 font-medium text-slate-700 dark:text-slate-200">{acc.name}</td>
                    <td
                      className={`py-2.5 text-right font-semibold ${
                        acc.balance < 0 ? "text-rose-500" : "text-slate-900 dark:text-white"
                      }`}
                    >
                      {acc.balance < 0
                        ? `(${formatCurrency(Math.abs(acc.balance))})`
                        : formatCurrency(acc.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Account Balances & FY Progress (3 cols) */}
        <div className="space-y-6 lg:col-span-3">
          {/* Account Balances */}
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">Account Balances</h3>
              <button
                onClick={() => setActiveTab("reconciliation")}
                className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
              >
                View All
              </button>
            </div>

            <div className="mt-3 space-y-3">
              {accountBalances.map((bal, idx) => {
                let iconEl = <Wallet className="h-4 w-4" />;
                let bgClass = "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400";
                if (bal.icon === "landmark") {
                  iconEl = <Landmark className="h-4 w-4" />;
                  bgClass = "bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400";
                } else if (bal.icon === "shield") {
                  iconEl = <Shield className="h-4 w-4" />;
                  bgClass = "bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400";
                } else if (bal.icon === "receipt") {
                  iconEl = <Receipt className="h-4 w-4" />;
                  bgClass = "bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400";
                } else if (bal.icon === "credit-card") {
                  iconEl = <CreditCard className="h-4 w-4" />;
                  bgClass = "bg-rose-50 text-rose-500 dark:bg-rose-950/60 dark:text-rose-400";
                }

                return (
                  <div key={idx} className="flex items-center gap-3">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${bgClass}`}>
                      {iconEl}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{bal.name}</p>
                      <p className="font-display text-xs font-bold text-slate-900 dark:text-white">
                        {formatCurrency(bal.balance)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Financial Year Progress */}
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">Financial Year Progress</h3>
              <span className="font-display text-base font-bold text-blue-600 dark:text-blue-400">
                {fyProgress.percentage}%
              </span>
            </div>
            <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-blue-600 transition-all duration-500"
                style={{ width: `${fyProgress.percentage}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-slate-400">{fyProgress.label}</p>
          </div>
        </div>
      </div>

      {/* ── 4. Bottom Row: Aging Summaries (Receivables & Payables) ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Aging Summary (Receivables) */}
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
              Aging Summary (Receivables)
            </h3>
            <button
              onClick={() => setActiveTab("receivables")}
              className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
            >
              View Details
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {/* Current */}
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 dark:border-emerald-950/40 dark:bg-emerald-950/20">
              <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">Current</p>
              <p className="mt-1 font-display text-sm font-bold text-slate-900 dark:text-white">
                {formatCurrency(arAging.current)}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">{arAging.currentPct}%</p>
            </div>

            {/* 1 - 30 Days */}
            <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3 dark:border-amber-950/40 dark:bg-amber-950/20">
              <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">1 - 30 Days</p>
              <p className="mt-1 font-display text-sm font-bold text-slate-900 dark:text-white">
                {formatCurrency(arAging.days30)}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">{arAging.days30Pct}%</p>
            </div>

            {/* 31 - 60 Days */}
            <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-3 dark:border-rose-950/40 dark:bg-rose-950/20">
              <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400">31 - 60 Days</p>
              <p className="mt-1 font-display text-sm font-bold text-slate-900 dark:text-white">
                {formatCurrency(arAging.days60)}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">{arAging.days60Pct}%</p>
            </div>

            {/* Over 60 Days */}
            <div className="rounded-xl border border-rose-200 bg-rose-100/50 p-3 dark:border-rose-900/60 dark:bg-rose-950/40">
              <p className="text-[11px] font-medium text-rose-700 dark:text-rose-300">Over 60 Days</p>
              <p className="mt-1 font-display text-sm font-bold text-slate-900 dark:text-white">
                {formatCurrency(arAging.over60)}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">{arAging.over60Pct}%</p>
            </div>
          </div>
        </div>

        {/* Aging Summary (Payables) */}
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">Aging Summary (Payables)</h3>
            <button
              onClick={() => setActiveTab("payables")}
              className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
            >
              View Details
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {/* Current */}
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 dark:border-emerald-950/40 dark:bg-emerald-950/20">
              <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">Current</p>
              <p className="mt-1 font-display text-sm font-bold text-slate-900 dark:text-white">
                {formatCurrency(apAging.current)}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">{apAging.currentPct}%</p>
            </div>

            {/* 1 - 30 Days */}
            <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3 dark:border-amber-950/40 dark:bg-amber-950/20">
              <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">1 - 30 Days</p>
              <p className="mt-1 font-display text-sm font-bold text-slate-900 dark:text-white">
                {formatCurrency(apAging.days30)}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">{apAging.days30Pct}%</p>
            </div>

            {/* 31 - 60 Days */}
            <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-3 dark:border-rose-950/40 dark:bg-rose-950/20">
              <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400">31 - 60 Days</p>
              <p className="mt-1 font-display text-sm font-bold text-slate-900 dark:text-white">
                {formatCurrency(apAging.days60)}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">{apAging.days60Pct}%</p>
            </div>

            {/* Over 60 Days */}
            <div className="rounded-xl border border-rose-200 bg-rose-100/50 p-3 dark:border-rose-900/60 dark:bg-rose-950/40">
              <p className="text-[11px] font-medium text-rose-700 dark:text-rose-300">Over 60 Days</p>
              <p className="mt-1 font-display text-sm font-bold text-slate-900 dark:text-white">
                {formatCurrency(apAging.over60)}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">{apAging.over60Pct}%</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
