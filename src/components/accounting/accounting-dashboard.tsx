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
import { AccountsReceivableTab } from "./accounts-receivable-tab";
import { AccountsPayableTab } from "./accounts-payable-tab";
import { FixedAssetsTab } from "./fixed-assets-tab";
import { FinancialReportsTab } from "./financial-reports-tab";
import { TaxManagementTab } from "./tax-management-tab";
import { AccountingSettingsTab } from "./accounting-settings-tab";
import { AccountingSearchModal } from "./accounting-search-modal";
import { AuditLogDrawer } from "./audit-log-drawer";

export function AccountingDashboard() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { activeTab, setActiveTab, currentCurrency, currentBranch } = useAccountingStore();

  const [dateRangeText, setDateRangeText] = useState("May 1, 2026 - May 31, 2026");
  const [isDateMenuOpen, setIsDateMenuOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isAuditDrawerOpen, setIsAuditDrawerOpen] = useState(false);

  // Quick Action Modals Trigger States
  const [openNewJournalModal, setOpenNewJournalModal] = useState(false);
  const [openNewBillModal, setOpenNewBillModal] = useState(false);

  // Sync tab from URL if present
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam && tabParam !== activeTab) {
      setActiveTab(tabParam as any);
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
                  { label: "Today", val: "Today · May 31, 2026" },
                  { label: "This Week", val: "May 25, 2026 - May 31, 2026" },
                  { label: "This Month (Default)", val: "May 1, 2026 - May 31, 2026" },
                  { label: "Last Month", val: "Apr 1, 2026 - Apr 30, 2026" },
                  { label: "This Quarter", val: "Apr 1, 2026 - Jun 30, 2026" },
                  { label: "Financial Year 2026", val: "Jan 1, 2026 - Dec 31, 2026" },
                ].map((item) => (
                  <button
                    key={item.label}
                    onClick={() => {
                      setDateRangeText(item.val);
                      setIsDateMenuOpen(false);
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
            onOpenBillModal={() => {
              setActiveTab("payables");
              setOpenNewBillModal(true);
            }}
            onOpenInvoiceModal={() => {
              setActiveTab("receivables");
            }}
          />
        )}

        {activeTab === "coa" && <ChartOfAccountsTab />}

        {activeTab === "journal" && (
          <JournalEntriesTab
            initialOpenNewModal={openNewJournalModal}
            onModalClosed={() => setOpenNewJournalModal(false)}
          />
        )}

        {activeTab === "reconciliation" && <BankReconciliationTab />}

        {activeTab === "receivables" && <AccountsReceivableTab />}

        {activeTab === "payables" && (
          <AccountsPayableTab
            initialOpenBillModal={openNewBillModal}
            onModalClosed={() => setOpenNewBillModal(false)}
          />
        )}

        {activeTab === "fixed_assets" && <FixedAssetsTab />}

        {activeTab === "reports" && <FinancialReportsTab />}

        {activeTab === "tax" && <TaxManagementTab />}

        {activeTab === "settings" && <AccountingSettingsTab />}
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
