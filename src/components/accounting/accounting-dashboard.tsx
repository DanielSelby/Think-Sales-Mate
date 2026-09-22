"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Calendar,
  Plus,
  Download,
  Shield,
  Search,
  LayoutDashboard,
  FolderTree,
  FileEdit,
  Landmark,
  Receipt,
  ShoppingBag,
  Package,
  FileSpreadsheet,
  Percent,
  Settings,
  ChevronDown,
} from "lucide-react";
import { useAccountingStore } from "@/lib/accounting/accounting-store";
import { OverviewTab } from "./overview-tab";
import { ChartOfAccountsTab } from "./chart-of-accounts-tab";
import { JournalEntriesTab } from "./journal-entries-tab";
import { BankReconciliationTab } from "./bank-reconciliation-tab";
import { CustomerCreditWorkspace } from "./customer-credit-workspace";
import { AccountsPayableTab } from "./accounts-payable-tab";
import { FixedAssetsTab } from "./fixed-assets-tab";
import { FinancialReportsTab } from "./financial-reports-tab";
import { TaxManagementTab } from "./tax-management-tab";
import { AccountingSettingsTab } from "./accounting-settings-tab";
import { AccountingSearchModal } from "./accounting-search-modal";
import { AuditLogDrawer } from "./audit-log-drawer";
import type { AccountsPayableItem } from "@/types/accounting";
import type { AccountsReceivableItem } from "@/types/accounting";
import type { LiveFinancialSnapshot } from "./financial-reports-tab";
import type { AccountingAccount, AccountingSettings, FixedAsset, JournalEntry, TaxFilingSummary, TaxRateConfig } from "@/types/accounting";
import type { CurrencyConfig } from "@/lib/currency";

export function AccountingDashboard({ initialPayables = [], initialBranches = [], initialReceivables = [], initialAuditLogs = [], initialPayments = [], liveFinancialSnapshot, liveAccounts = [], liveJournalEntries = [], liveTaxSummary, liveTaxRates = [], liveTaxFilings = [], liveBankAccounts = [], liveBankTransactions = {}, liveFixedAssets = [], liveAccountingSettings, initialDateFrom, initialDateTo, liveCurrencyConfig }: { initialPayables?: AccountsPayableItem[]; initialBranches?: string[]; initialReceivables?: AccountsReceivableItem[]; initialAuditLogs?: { userName: string; action: string; module: string; createdAt: string }[]; initialPayments?: { id: string; invoiceId: string; amount: number; paymentMethod: string; paymentDate: string; recordedBy: string }[]; liveFinancialSnapshot?: LiveFinancialSnapshot; liveAccounts?: AccountingAccount[]; liveJournalEntries?: JournalEntry[]; liveTaxSummary?: { periodLabel: string; grossSales: number; outputTax: number; inputTax: number }; liveTaxRates?: TaxRateConfig[]; liveTaxFilings?: TaxFilingSummary[]; liveBankAccounts?: import("@/types/accounting").BankAccountItem[]; liveBankTransactions?: Record<string, { id: string; date: string; reference: string; description: string; amount: number; type: "deposit" | "withdrawal"; matched: boolean }[]>; liveFixedAssets?: FixedAsset[]; liveAccountingSettings?: AccountingSettings; initialDateFrom?: string; initialDateTo?: string; liveCurrencyConfig?: CurrencyConfig }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { activeTab, setActiveTab, setCurrencyConfig } = useAccountingStore();
  const currentCurrency = useAccountingStore((state) => state.currentCurrency);

  const formatDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const [dateRangeText, setDateRangeText] = useState(() => `${formatDate(initialDateFrom ?? new Date().toISOString().slice(0, 10))} - ${formatDate(initialDateTo ?? new Date().toISOString().slice(0, 10))}`);
  const [isDateMenuOpen, setIsDateMenuOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isAuditDrawerOpen, setIsAuditDrawerOpen] = useState(false);

  // Quick Action Modals Trigger States
  const [openNewJournalModal, setOpenNewJournalModal] = useState(false);

  useEffect(() => {
    if (liveCurrencyConfig) setCurrencyConfig(liveCurrencyConfig.code, liveCurrencyConfig.symbol, liveCurrencyConfig);
  }, [liveCurrencyConfig, setCurrencyConfig]);

  // Sync tab from URL if present
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam && tabParam !== activeTab) {
      if (TABS.some((tab) => tab.key === tabParam)) setActiveTab(tabParam as any);
    }
  }, [searchParams, activeTab, setActiveTab]);

  // Global Ctrl + K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "/")) {
        e.preventDefault();
        setIsSearchModalOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleTabChange = (tabKey: string) => {
    setActiveTab(tabKey as any);
    router.replace(`/accounting?tab=${tabKey}`, { scroll: false });
  };

  const TABS = [
    { key: "overview", label: "Overview", icon: LayoutDashboard },
    { key: "coa", label: "Chart of Accounts", icon: FolderTree },
    { key: "journal", label: "Journal Entries", icon: FileEdit },
    { key: "reconciliation", label: "Bank Reconciliation", icon: Landmark },
    { key: "receivables", label: "Accounts Receivable", icon: Receipt },
    { key: "payables", label: "Accounts Payable", icon: ShoppingBag },
    { key: "fixed_assets", label: "Fixed Assets", icon: Package },
    { key: "reports", label: "Financial Reports", icon: FileSpreadsheet },
    { key: "tax", label: "Tax Management", icon: Percent },
    { key: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="space-y-6 pb-16">
      {/* ── Top Bar Header (Matches reference image header) ── */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Accounting
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Financial management, general ledger, and bookkeeping
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Audit Trail Drawer Trigger */}
          <button
            onClick={() => setIsAuditDrawerOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <Shield className="h-3.5 w-3.5 text-slate-400" />
            <span>Audit Trail</span>
          </button>

          {/* Date Range Selector Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsDateMenuOpen(!isDateMenuOpen)}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              <span>{dateRangeText}</span>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            </button>

            {isDateMenuOpen && (
              <div className="absolute right-0 z-40 mt-1 w-56 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-800 text-xs">
                {[
                  ...(() => {
                    const today = new Date();
                    const startOfWeek = new Date(today);
                    startOfWeek.setDate(today.getDate() - today.getDay());
                    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
                    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                    const startOfYear = new Date(today.getFullYear(), 0, 1);
                    const endOfYear = new Date(today.getFullYear(), 11, 31);
                    const format = (date: Date) => date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                    return [
                      { label: "Today", val: format(today), from: today.toISOString().slice(0, 10), to: today.toISOString().slice(0, 10) },
                      { label: "This Week", val: `${format(startOfWeek)} - ${format(today)}`, from: startOfWeek.toISOString().slice(0, 10), to: today.toISOString().slice(0, 10) },
                      { label: "This Month", val: `${format(startOfMonth)} - ${format(endOfMonth)}`, from: startOfMonth.toISOString().slice(0, 10), to: endOfMonth.toISOString().slice(0, 10) },
                      { label: "Financial Year", val: `${format(startOfYear)} - ${format(endOfYear)}`, from: startOfYear.toISOString().slice(0, 10), to: endOfYear.toISOString().slice(0, 10) },
                    ];
                  })(),
                ].map((item) => (
                  <button
                    key={item.label}
                    onClick={() => {
                      setDateRangeText(item.val);
                      setIsDateMenuOpen(false);
                      router.replace(`/accounting?tab=${activeTab}&from=${item.from}&to=${item.to}`, { scroll: false });
                    }}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* New Journal Entry Button */}
          <button
            onClick={() => {
              setActiveTab("journal");
              setOpenNewJournalModal(true);
            }}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition-all"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Journal Entry</span>
          </button>
        </div>
      </div>

      {/* ── Secondary Navigation: Multi-Tab Bar (Matches reference image tabs exactly) ── */}
      <div className="border-b border-slate-200 dark:border-slate-800 overflow-x-auto scrollbar-none">
        <nav className="flex space-x-1 sm:space-x-2 min-w-max" aria-label="Accounting Tabs">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={`flex items-center gap-2 border-b-2 px-3.5 py-3 text-xs font-semibold transition-all whitespace-nowrap ${
                  isActive
                    ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400 font-bold"
                    : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? "text-blue-600 dark:text-blue-400" : "text-slate-400"}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* ── Active Tab View ── */}
      <div>
        {activeTab === "overview" && (
          <OverviewTab
            onOpenJournalModal={() => {
              setActiveTab("journal");
              setOpenNewJournalModal(true);
            }}
            onOpenExpenseModal={() => {
              router.push("/expenses/new");
            }}
            onOpenIncomeModal={() => {
              setActiveTab("journal");
              setOpenNewJournalModal(true);
            }}
            onOpenBillModal={() => {
              router.push("/purchases/new");
            }}
            onOpenInvoiceModal={() => {
              router.push("/accounting/invoices/new");
            }}
          />
        )}

        {activeTab === "coa" && <ChartOfAccountsTab initialAccounts={liveAccounts} />}

        {activeTab === "journal" && (
          <JournalEntriesTab
            initialJournalEntries={liveJournalEntries}
            initialAccounts={liveAccounts}
            initialOpenNewModal={openNewJournalModal}
            onModalClosed={() => setOpenNewJournalModal(false)}
          />
        )}

        {activeTab === "reconciliation" && <BankReconciliationTab initialBankAccounts={liveBankAccounts} initialBankTransactions={liveBankTransactions} />}

        {activeTab === "receivables" && <CustomerCreditWorkspace initialReceivables={initialReceivables} initialAuditLogs={initialAuditLogs} initialPayments={initialPayments} />}

        {activeTab === "payables" && (
          <AccountsPayableTab
            initialPayables={initialPayables}
            initialBranches={initialBranches}
          />
        )}

        {activeTab === "fixed_assets" && <FixedAssetsTab initialFixedAssets={liveFixedAssets} />}

        {activeTab === "reports" && <FinancialReportsTab liveSnapshot={liveFinancialSnapshot} liveAccounts={liveAccounts} liveJournalEntries={liveJournalEntries} />}

        {activeTab === "tax" && <TaxManagementTab liveSummary={liveTaxSummary} initialTaxRates={liveTaxRates} initialTaxFilings={liveTaxFilings} />}

        {activeTab === "settings" && <AccountingSettingsTab initialSettings={liveAccountingSettings} />}
      </div>

      {/* ── Global Search Modal (Ctrl + K) ── */}
      <AccountingSearchModal
        open={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
      />

      {/* ── Audit Log Drawer ── */}
      <AuditLogDrawer
        open={isAuditDrawerOpen}
        onClose={() => setIsAuditDrawerOpen(false)}
      />
    </div>
  );
}
