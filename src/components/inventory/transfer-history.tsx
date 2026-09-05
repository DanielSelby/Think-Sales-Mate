"use client";

import { useEffect, useMemo, useState, useTransition, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import {
  Plus,
  Download,
  Printer,
  SlidersHorizontal,
  Search,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Eye,
  Copy,
  Check,
  X,
  ArrowRight,
  ArrowLeftRight,
  Building2,
  Warehouse,
  Store,
  Truck,
  CheckCircle2,
  Clock,
  Package,
  PackageCheck,
  PackageX,
  FileSpreadsheet,
  FileText,
  Calendar,
  Layers,
  MoreVertical,
  TrendingUp,
  ShieldCheck,
  RotateCcw,
  Sparkles,
  Inbox,
  Send,
  Bell,
  MessageSquare,
  HelpCircle,
  AlertTriangle,
  Trash2,
  CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/sales/format";
import {
  updateTransferStatus,
  getTransferItems,
  deleteTransfer,
  type TransferItemDetail,
} from "@/app/(dashboard)/inventory/transfers/actions";
import type { TransferStatus, LocationType } from "@/types/database";

export interface TransferRow {
  id: string;
  label: string;
  referenceNo?: string | null;
  status: TransferStatus;
  reason: string | null;
  notes: string | null;
  shippingCharges: number;
  transferDate: string;
  createdAt: string;
  completedAt: string | null;
  fromLocationId: string;
  fromLocationName: string;
  fromCity?: string;
  toLocationId: string;
  toLocationName: string;
  toCity?: string;
  productCount: number;
  productIds: string[];
  totalQuantity: number;
  totalValue: number;
  requestedByEmail: string;
  transferredByName?: string;
  transferredByRole?: string;
}

export interface TransferFilterLocation {
  id: string;
  name: string;
  type: LocationType;
}

export interface TransferFilterProduct {
  id: string;
  name: string;
  sku: string;
}

interface KpiStat {
  value: number;
  change: number;
}

interface Kpis {
  total: KpiStat;
  completed: KpiStat;
  pending: KpiStat;
  cancelled: KpiStat;
  totalQuantity: KpiStat;
  totalValue: KpiStat;
}

export function TransferHistory({
  transfers = [],
  kpis,
  locations = [],
  products = [],
  canManage = true,
  currency = "GHS",
}: {
  transfers?: TransferRow[];
  kpis?: Kpis;
  locations?: TransferFilterLocation[];
  products?: TransferFilterProduct[];
  canManage?: boolean;
  currency?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Tab filter: "all" | "completed" | "pending" | "cancelled"
  const [activeTab, setActiveTab] = useState<string>("all");

  // Search and filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedLocation, setSelectedLocation] = useState("all");
  // Default dates to empty so no valid records get filtered out
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Modals and Details
  const [selectedTransferForDetail, setSelectedTransferForDetail] = useState<TransferRow | null>(null);
  const [detailItems, setDetailItems] = useState<TransferItemDetail[] | null>(null);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [actionMenuTransferId, setActionMenuTransferId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const exportMenuRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
      if (notificationRef.current && !notificationRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
      if (actionMenuTransferId) {
        setActionMenuTransferId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [actionMenuTransferId]);

  // Fetch real line items when a transfer detail drawer is opened
  useEffect(() => {
    if (selectedTransferForDetail) {
      setIsLoadingItems(true);
      getTransferItems(selectedTransferForDetail.id)
        .then((items) => {
          setDetailItems(items || []);
        })
        .finally(() => setIsLoadingItems(false));
    } else {
      setDetailItems(null);
    }
  }, [selectedTransferForDetail]);

  // ── Real KPI Calculations directly from database records ─────────────────
  const calculatedKpis = useMemo(() => {
    const totalCount = transfers.length;
    const completedCount = transfers.filter((t) => t.status === "completed").length;
    const pendingCount = transfers.filter((t) => t.status === "pending" || t.status === "in_transit").length;
    const cancelledCount = transfers.filter((t) => t.status === "cancelled").length;
    const totalItemsTransferred = transfers.reduce((sum, t) => sum + (t.totalQuantity || 0), 0);

    const completedPct = totalCount > 0 ? ((completedCount / totalCount) * 100).toFixed(1) : "0.0";
    const pendingPct = totalCount > 0 ? ((pendingCount / totalCount) * 100).toFixed(1) : "0.0";

    return {
      totalTransfers: totalCount,
      totalItemsTransferred,
      completedTransfers: completedCount,
      pendingTransfers: pendingCount,
      cancelledTransfers: cancelledCount,
      completedPct,
      pendingPct,
    };
  }, [transfers]);

  // ── Filtered Records using pure database records ─────────────────────────
  const filteredRecords = useMemo(() => {
    return transfers.filter((t) => {
      // Tab filter
      if (activeTab === "completed" && t.status !== "completed") return false;
      if (activeTab === "pending" && t.status !== "pending" && t.status !== "in_transit") return false;
      if (activeTab === "cancelled" && t.status !== "cancelled") return false;

      // Status dropdown
      if (selectedStatus !== "all") {
        if (selectedStatus === "pending" && t.status !== "pending" && t.status !== "in_transit") return false;
        if (selectedStatus !== "pending" && t.status !== selectedStatus) return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesId = t.label?.toLowerCase().includes(q) || (t.referenceNo && t.referenceNo.toLowerCase().includes(q));
        const matchesFrom = t.fromLocationName?.toLowerCase().includes(q);
        const matchesTo = t.toLocationName?.toLowerCase().includes(q);
        const matchesUser = t.transferredByName?.toLowerCase().includes(q) || t.requestedByEmail?.toLowerCase().includes(q);
        const matchesNotes = t.notes && t.notes.toLowerCase().includes(q);
        if (!matchesId && !matchesFrom && !matchesTo && !matchesUser && !matchesNotes) return false;
      }

      // Location filter
      if (selectedLocation !== "all") {
        if (!t.fromLocationName?.toLowerCase().includes(selectedLocation.toLowerCase()) && !t.toLocationName?.toLowerCase().includes(selectedLocation.toLowerCase())) {
          return false;
        }
      }

      // Date Range Filter (only when explicitly provided)
      if (startDate && t.transferDate < startDate) return false;
      if (endDate && t.transferDate > endDate) return false;

      return true;
    });
  }, [transfers, activeTab, selectedStatus, searchQuery, selectedLocation, startDate, endDate]);

  // Paginated records
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRecords.slice(start, start + pageSize);
  }, [filteredRecords, currentPage, pageSize]);

  // Real Status Update Action
  const handleUpdateStatus = (transferId: string, newStatus: TransferStatus) => {
    startTransition(async () => {
      const res = await updateTransferStatus(transferId, newStatus);
      if (res?.error) {
        alert(res.error);
      } else {
        setToastMessage(`Transfer status updated to ${newStatus.replace("_", " ")}.`);
        setTimeout(() => setToastMessage(null), 3000);
        router.refresh();
      }
      setActionMenuTransferId(null);
    });
  };

  // Real Delete Action
  const handleDeleteTransfer = (transferId: string) => {
    if (!confirm("Are you sure you want to cancel and remove this stock transfer? This will restore inventory.")) return;
    startTransition(async () => {
      const res = await deleteTransfer(transferId);
      if (res?.error) {
        alert(res.error);
      } else {
        setToastMessage("Transfer successfully deleted and inventory restored.");
        setTimeout(() => setToastMessage(null), 3000);
        router.refresh();
      }
      setActionMenuTransferId(null);
    });
  };

  // Export handlers
  const handleExportExcel = () => {
    const data = filteredRecords.map((t) => ({
      "Transfer ID": t.label,
      "Reference No": t.referenceNo || "N/A",
      "Date": t.transferDate,
      "From Location": t.fromLocationName,
      "To Location": t.toLocationName,
      "Product Count": t.productCount,
      "Total Quantity": t.totalQuantity,
      [`Total Value (${currency})`]: t.totalValue,
      Status: t.status,
      "Requested By": t.requestedByEmail,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stock Transfers");
    XLSX.writeFile(wb, `Stock_Transfers_${new Date().toISOString().slice(0, 10)}.xlsx`);
    setShowExportMenu(false);
  };

  const handleExportCSV = () => {
    const data = filteredRecords.map((t) => ({
      "Transfer ID": t.label,
      Reference: t.referenceNo || "N/A",
      Date: t.transferDate,
      From: t.fromLocationName,
      To: t.toLocationName,
      Quantity: t.totalQuantity,
      Value: t.totalValue,
      Status: t.status,
      User: t.requestedByEmail,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Stock_Transfers_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    setShowExportMenu(false);
  };

  // Dynamic notifications from real pending/in-transit transfers
  const pendingTransfersList = useMemo(() => {
    return transfers.filter((t) => t.status === "in_transit" || t.status === "pending");
  }, [transfers]);

  return (
    <div className="space-y-6 animate-in fade-in duration-150 pb-16">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-3 rounded-2xl bg-emerald-700 px-5 py-3.5 text-white shadow-2xl animate-in slide-in-from-top-4">
          <CheckCircle2 className="h-5 w-5 text-emerald-200" />
          <span className="text-xs font-semibold">{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="ml-2 rounded-lg p-1 hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Page Header matching reference image ────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ledger-100 pb-5 dark:border-ledger-700">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-900 dark:text-white">
            Stock Transfer History
          </h1>
          <p className="mt-0.5 text-xs text-ledger-400">
            View and track all stock transfers between branches and warehouses.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Active Notifications Bell */}
          <div className="relative" ref={notificationRef}>
            <button
              type="button"
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-ledger-200 bg-white text-ledger-600 shadow-xs hover:bg-ledger-50 dark:border-ledger-700 dark:bg-ink-900 dark:text-ledger-300"
            >
              <Bell className="h-4 w-4" />
              {pendingTransfersList.length > 0 && (
                <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                  {pendingTransfersList.length}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 top-12 z-50 w-80 rounded-2xl border border-ledger-100 bg-white p-3 shadow-2xl dark:border-ledger-700 dark:bg-ink-900 animate-in fade-in duration-150">
                <div className="flex items-center justify-between border-b border-ledger-100 pb-2.5 dark:border-ledger-700">
                  <div className="flex items-center gap-1.5">
                    <Bell className="h-4 w-4 text-emerald-600" />
                    <h4 className="font-bold text-xs text-ink-900 dark:text-white">Transfer Alerts</h4>
                  </div>
                  <span className="text-[10px] text-ledger-400 font-mono">
                    {pendingTransfersList.length} active
                  </span>
                </div>

                <div className="mt-2 space-y-1.5 max-h-72 overflow-y-auto">
                  {pendingTransfersList.length === 0 ? (
                    <p className="py-4 text-center text-xs text-ledger-400">
                      No pending or in-transit stock transfers right now.
                    </p>
                  ) : (
                    pendingTransfersList.map((t) => (
                      <div
                        key={t.id}
                        onClick={() => {
                          setSelectedTransferForDetail(t);
                          setShowNotifications(false);
                        }}
                        className="cursor-pointer rounded-xl bg-emerald-50/50 p-2.5 text-xs transition-colors hover:bg-emerald-100/60 dark:bg-emerald-950/30 dark:hover:bg-emerald-950/60"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-ink-900 dark:text-white font-mono">{t.label}</span>
                          <span className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-400">
                            {t.status === "received" ? "accepted" : t.status.replace("_", " ")}
                          </span>
                        </div>
                        <p className="text-[11px] text-ledger-600 dark:text-ledger-300 mt-0.5">
                          {t.fromLocationName} → {t.toLocationName} ({t.totalQuantity} items)
                        </p>
                        <span className="mt-1 block text-[10px] text-ledger-400 font-mono">{t.transferDate}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Export Dropdown */}
          <div className="relative" ref={exportMenuRef}>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="h-10 gap-1.5 rounded-xl border-ledger-200 text-xs font-semibold text-ink-900 hover:bg-ledger-50 dark:border-ledger-700 dark:text-white"
            >
              <Download className="h-3.5 w-3.5 text-emerald-600" />
              Export
              <ChevronDown className="h-3 w-3 text-ledger-400" />
            </Button>

            {showExportMenu && (
              <div className="absolute right-0 top-11 z-40 w-44 rounded-2xl border border-ledger-100 bg-white p-1.5 shadow-xl dark:border-ledger-700 dark:bg-ink-900">
                <button
                  type="button"
                  onClick={handleExportExcel}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-ink-900 hover:bg-ledger-50 dark:text-white dark:hover:bg-white/[0.04]"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                  Export to Excel (.xlsx)
                </button>
                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-ink-900 hover:bg-ledger-50 dark:text-white dark:hover:bg-white/[0.04]"
                >
                  <FileText className="h-3.5 w-3.5 text-blue-600" />
                  Export to CSV (.csv)
                </button>
              </div>
            )}
          </div>

          {/* Print Button */}
          <Button
            type="button"
            variant="outline"
            onClick={() => window.print()}
            className="h-10 gap-1.5 rounded-xl border-ledger-200 text-xs font-semibold text-ink-900 hover:bg-ledger-50 dark:border-ledger-700 dark:text-white"
          >
            <Printer className="h-3.5 w-3.5 text-purple-600" />
            Print
          </Button>

          {/* Create Transfer Button */}
          <Link href="/inventory/transfers/new">
            <Button
              type="button"
              className="h-10 gap-1.5 rounded-xl bg-emerald-700 px-4 text-xs font-semibold text-white shadow-sm hover:bg-emerald-800"
            >
              <Plus className="h-4 w-4" />
              Create Transfer
            </Button>
          </Link>
        </div>
      </div>

      {/* ── 4 Top KPI Cards (Computed strictly from real data) ────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* 1. Total Transfers */}
        <div className="rounded-2xl border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
              <ArrowLeftRight className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-ledger-400">Total Transfers</p>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="font-display text-2xl font-bold text-ink-900 dark:text-white font-mono">
                  {calculatedKpis.totalTransfers}
                </span>
                {kpis?.total?.change !== undefined && (
                  <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    {kpis.total.change >= 0 ? "↗" : "↘"} {Math.abs(kpis.total.change)}%
                  </span>
                )}
              </div>
            </div>
          </div>
          <p className="mt-2 text-[10px] text-ledger-400">All registered transfers</p>
        </div>

        {/* 2. Total Items Transferred */}
        <div className="rounded-2xl border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-ledger-400">Total Items Transferred</p>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="font-display text-2xl font-bold text-ink-900 dark:text-white font-mono">
                  {calculatedKpis.totalItemsTransferred.toLocaleString()}
                </span>
                <span className="text-[10px] font-mono text-ledger-400">units</span>
              </div>
            </div>
          </div>
          <p className="mt-2 text-[10px] text-ledger-400">Sum of all quantities moved</p>
        </div>

        {/* 3. Completed Transfers */}
        <div className="rounded-2xl border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-ledger-400">Completed Transfers</p>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="font-display text-2xl font-bold text-ink-900 dark:text-white font-mono">
                  {calculatedKpis.completedTransfers}
                </span>
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                  ↑ {calculatedKpis.completedPct}%
                </span>
              </div>
            </div>
          </div>
          <p className="mt-2 text-[10px] text-ledger-400">of total transfers</p>
        </div>

        {/* 4. Pending Transfers */}
        <div className="rounded-2xl border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-ledger-400">Pending Transfers</p>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="font-display text-2xl font-bold text-ink-900 dark:text-white font-mono">
                  {calculatedKpis.pendingTransfers}
                </span>
                <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
                  ↻ {calculatedKpis.pendingPct}%
                </span>
              </div>
            </div>
          </div>
          <p className="mt-2 text-[10px] text-ledger-400">Awaiting transit / receiving</p>
        </div>
      </div>

      {/* ── Status Filter Tabs Bar (Direct Real Counts) ────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-ledger-100 pb-3 dark:border-ledger-700">
        {[
          { id: "all", label: "All Transfers", icon: ArrowLeftRight, count: calculatedKpis.totalTransfers },
          { id: "completed", label: "Completed", icon: CheckCircle2, count: calculatedKpis.completedTransfers },
          { id: "pending", label: "Pending", icon: Clock, count: calculatedKpis.pendingTransfers },
          { id: "cancelled", label: "Cancelled", icon: PackageX, count: calculatedKpis.cancelledTransfers },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                setCurrentPage(1);
              }}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
                isActive
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-300/60 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800"
                  : "text-ledger-600 hover:bg-ledger-50 hover:text-ink-900 dark:text-ledger-300 dark:hover:bg-white/[0.04]"
              }`}
            >
              <Icon className={`h-4 w-4 ${isActive ? "text-emerald-600" : "text-ledger-400"}`} />
              <span>{tab.label}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  isActive
                    ? "bg-emerald-600 text-white"
                    : "bg-ledger-100 text-ledger-600 dark:bg-ledger-800 dark:text-ledger-300"
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Filter Toolbar ────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900 space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12 items-center">
          {/* 1. Search Input */}
          <div className="relative lg:col-span-5">
            <Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-ledger-400" />
            <input
              type="text"
              placeholder="Search by transfer ID, reference, or notes..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="h-10 w-full rounded-xl border border-ledger-200 bg-white pl-10 pr-4 text-xs text-ink-900 placeholder:text-ledger-400 shadow-xs focus:border-emerald-600 focus:outline-hidden dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
            />
          </div>

          {/* 2. Status Dropdown */}
          <div className="relative lg:col-span-2">
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="h-10 w-full appearance-none rounded-xl border border-ledger-200 bg-white px-3 pr-8 text-xs font-semibold text-ink-900 shadow-xs focus:border-emerald-600 focus:outline-hidden dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
            >
              <option value="all">All Status</option>
              <option value="completed">Completed</option>
              <option value="in_transit">In Transit</option>
              <option value="pending">Pending</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-ledger-400" />
          </div>

          {/* 3. Locations Dropdown */}
          <div className="relative lg:col-span-2">
            <select
              value={selectedLocation}
              onChange={(e) => {
                setSelectedLocation(e.target.value);
                setCurrentPage(1);
              }}
              className="h-10 w-full appearance-none rounded-xl border border-ledger-200 bg-white px-3 pr-8 text-xs font-semibold text-ink-900 shadow-xs focus:border-emerald-600 focus:outline-hidden dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
            >
              <option value="all">All Locations</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.name}>
                  {loc.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-ledger-400" />
          </div>

          {/* 4. Date Range */}
          <div className="lg:col-span-2 flex items-center gap-1 rounded-xl border border-ledger-200 bg-white px-2 py-1 shadow-xs dark:border-ledger-700 dark:bg-ink-950">
            <Calendar className="h-3.5 w-3.5 text-ledger-400 shrink-0" />
            <input
              type="date"
              value={startDate}
              placeholder="Start"
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full text-[10px] font-mono text-ink-900 bg-transparent focus:outline-hidden dark:text-white"
            />
            <span className="text-ledger-400 text-xs">-</span>
            <input
              type="date"
              value={endDate}
              placeholder="End"
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full text-[10px] font-mono text-ink-900 bg-transparent focus:outline-hidden dark:text-white"
            />
          </div>

          {/* 5. Filters Toggle */}
          <div className="lg:col-span-1">
            <button
              type="button"
              onClick={() => {
                setStartDate("");
                setEndDate("");
                setSelectedLocation("all");
                setSelectedStatus("all");
                setSearchQuery("");
                setCurrentPage(1);
              }}
              title="Reset Filters"
              className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-ledger-200 bg-white px-3 text-xs font-semibold text-ink-900 shadow-xs hover:bg-ledger-50 dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
            >
              <RotateCcw className="h-3.5 w-3.5 text-ledger-400" />
              <span className="hidden sm:inline">Reset</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Modern Transfers Audit Table (Strictly Real Records) ─────────── */}
      <div className="overflow-hidden rounded-2xl border border-ledger-100 bg-white shadow-card dark:border-ledger-700 dark:bg-ink-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-ledger-100 bg-ledger-50/70 text-[11px] font-semibold text-ledger-500 dark:border-ledger-700 dark:bg-white/[0.02]">
              <tr>
                <th className="px-4 py-3 min-w-[170px]">TRANSFER ID</th>
                <th className="px-4 py-3 min-w-[130px]">DATE &amp; TIME</th>
                <th className="px-4 py-3 min-w-[150px]">FROM</th>
                <th className="px-2 py-3 text-center w-8"></th>
                <th className="px-4 py-3 min-w-[150px]">TO</th>
                <th className="px-4 py-3 text-center min-w-[80px]">ITEMS</th>
                <th className="px-4 py-3 text-center min-w-[90px]">QUANTITY</th>
                <th className="px-4 py-3 min-w-[110px]">STATUS</th>
                <th className="px-4 py-3 min-w-[160px]">REQUESTED BY</th>
                <th className="px-4 py-3 text-center w-16">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ledger-100 dark:divide-ledger-700/50">
              {paginatedRecords.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-14 text-center">
                    <div className="mx-auto max-w-sm space-y-3">
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-ledger-50 text-ledger-400 dark:bg-ledger-800">
                        <ArrowLeftRight className="h-6 w-6" />
                      </div>
                      <p className="font-bold text-sm text-ink-900 dark:text-white">
                        No stock transfer records found
                      </p>
                      <p className="text-xs text-ledger-400">
                        {transfers.length === 0
                          ? "You haven't created any stock transfers yet. Click 'Create Transfer' to initiate your first transfer."
                          : "No transfers match the current filter selection. Try clearing search filters."}
                      </p>
                      <Link href="/inventory/transfers/new" className="inline-block pt-1">
                        <Button size="sm" className="gap-1.5 rounded-xl bg-emerald-700 text-xs text-white">
                          <Plus className="h-3.5 w-3.5" />
                          Create New Transfer
                        </Button>
                      </Link>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedRecords.map((row) => {
                  const isCompleted = row.status === "completed";
                  const isPendingStatus = row.status === "pending" || row.status === "in_transit";
                  const isCancelled = row.status === "cancelled";

                  const iconBg = isCompleted
                    ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
                    : isPendingStatus
                    ? "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
                    : "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400";

                  const userInitials = row.requestedByEmail
                    ? row.requestedByEmail.slice(0, 2).toUpperCase()
                    : "ST";

                  const isMenuOpen = actionMenuTransferId === row.id;

                  return (
                    <tr
                      key={row.id}
                      className="transition-colors hover:bg-ledger-50/40 dark:hover:bg-white/[0.02]"
                    >
                      {/* TRANSFER ID */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
                            {isCompleted ? (
                              <CheckCircle2 className="h-4 w-4" />
                            ) : isPendingStatus ? (
                              <Clock className="h-4 w-4" />
                            ) : (
                              <PackageX className="h-4 w-4" />
                            )}
                          </div>
                          <div>
                            <button
                              type="button"
                              onClick={() => setSelectedTransferForDetail(row)}
                              className="font-bold text-xs font-mono text-ink-900 hover:text-emerald-700 dark:text-white dark:hover:text-emerald-400 text-left"
                            >
                              {row.label}
                            </button>
                            {row.referenceNo && (
                              <span className="block font-mono text-[10px] text-ledger-400">
                                {row.referenceNo}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* DATE & TIME */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className="font-semibold text-ink-900 dark:text-white block font-mono text-xs">
                          {row.transferDate}
                        </span>
                        <span className="text-[10px] text-ledger-400 font-mono">
                          {row.createdAt ? new Date(row.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                        </span>
                      </td>

                      {/* FROM */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <p className="font-semibold text-ink-900 dark:text-white">{row.fromLocationName}</p>
                        <p className="text-[10px] text-ledger-400">{row.fromCity || "Source Location"}</p>
                      </td>

                      {/* ARROW */}
                      <td className="px-2 py-3.5 text-center">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400 mx-auto">
                          <ArrowRight className="h-3 w-3" />
                        </div>
                      </td>

                      {/* TO */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <p className="font-semibold text-ink-900 dark:text-white">{row.toLocationName}</p>
                        <p className="text-[10px] text-ledger-400">{row.toCity || "Destination Location"}</p>
                      </td>

                      {/* ITEMS */}
                      <td className="px-4 py-3.5 text-center font-mono font-semibold text-ink-900 dark:text-white">
                        {row.productCount || 1}
                      </td>

                      {/* QUANTITY */}
                      <td className="px-4 py-3.5 text-center font-mono font-bold text-ink-900 dark:text-white">
                        {row.totalQuantity}
                      </td>

                      {/* STATUS */}
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-bold capitalize ${
                            isCompleted
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800"
                              : isPendingStatus
                              ? "bg-amber-50 text-amber-700 border border-amber-200/80 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800"
                              : "bg-red-50 text-red-700 border border-red-200/80 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800"
                          }`}
                        >
                          {isCompleted ? "✓ Completed" : isPendingStatus ? "⏱ In Transit" : "✕ Cancelled"}
                        </span>
                      </td>

                      {/* REQUESTED BY */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-bold text-[10px] dark:bg-blue-950 dark:text-blue-300">
                            {userInitials}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-ink-900 dark:text-white text-xs truncate max-w-[120px]">
                              {row.requestedByEmail.split("@")[0]}
                            </p>
                            <p className="text-[10px] text-ledger-400 truncate max-w-[120px]">
                              {row.requestedByEmail}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* ACTIONS */}
                      <td className="px-4 py-3.5 text-center relative">
                        <button
                          type="button"
                          onClick={() => setActionMenuTransferId(isMenuOpen ? null : row.id)}
                          className="rounded-lg p-1.5 text-ledger-400 hover:bg-ledger-100 hover:text-ink-900 dark:hover:bg-white/[0.06] dark:hover:text-white"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>

                        {/* Action Popover Menu */}
                        {isMenuOpen && (
                          <div className="absolute right-4 top-10 z-30 w-48 rounded-2xl border border-ledger-100 bg-white p-1.5 shadow-2xl dark:border-ledger-700 dark:bg-ink-900 animate-in fade-in duration-100 text-left">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedTransferForDetail(row);
                                setActionMenuTransferId(null);
                              }}
                              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-ink-900 hover:bg-ledger-50 dark:text-white dark:hover:bg-white/[0.04]"
                            >
                              <Eye className="h-3.5 w-3.5 text-blue-600" />
                              View Items Breakdown
                            </button>

                            {isPendingStatus && (
                              <button
                                type="button"
                                onClick={() => handleUpdateStatus(row.id, "completed")}
                                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                              >
                                <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                                Receive Stock (Complete)
                              </button>
                            )}

                            {isPendingStatus && (
                              <button
                                type="button"
                                onClick={() => handleUpdateStatus(row.id, "cancelled")}
                                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                              >
                                <PackageX className="h-3.5 w-3.5 text-red-500" />
                                Cancel Transfer
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleDeleteTransfer(row.id)}
                              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40 border-t border-ledger-100 dark:border-ledger-700 mt-1 pt-1.5"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-red-500" />
                              Delete Record
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Pagination Footer */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-ledger-100 p-4 text-xs dark:border-ledger-700">
          <div className="text-ledger-400">
            Showing{" "}
            <strong>
              {filteredRecords.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}
            </strong>{" "}
            to{" "}
            <strong>
              {Math.min(currentPage * pageSize, filteredRecords.length)}
            </strong>{" "}
            of <strong>{filteredRecords.length}</strong> results
          </div>

          <div className="flex items-center gap-4">
            {/* Rows Per Page Dropdown */}
            <div className="flex items-center gap-1.5 text-ledger-500">
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="h-8 rounded-xl border border-ledger-200 bg-white px-2.5 text-xs font-semibold text-ink-900 shadow-xs focus:border-emerald-600 focus:outline-hidden dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
              >
                <option value={5}>5 / page</option>
                <option value={10}>10 / page</option>
                <option value={25}>25 / page</option>
                <option value={50}>50 / page</option>
              </select>
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-ledger-200 bg-white text-ledger-600 disabled:opacity-40 hover:bg-ledger-50 dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .slice(0, 4)
                .map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setCurrentPage(p)}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-semibold ${
                      currentPage === p
                        ? "bg-emerald-700 text-white"
                        : "border border-ledger-200 bg-white text-ledger-700 hover:bg-ledger-50 dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
                    }`}
                  >
                    {p}
                  </button>
                ))}

              {totalPages > 4 && (
                <>
                  <span className="px-1 text-ledger-400">...</span>
                  <button
                    type="button"
                    onClick={() => setCurrentPage(totalPages)}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-semibold ${
                      currentPage === totalPages
                        ? "bg-emerald-700 text-white"
                        : "border border-ledger-200 bg-white text-ledger-700 hover:bg-ledger-50 dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
                    }`}
                  >
                    {totalPages}
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-ledger-200 bg-white text-ledger-600 disabled:opacity-40 hover:bg-ledger-50 dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Transfer Details Drawer / Modal ───────────────────────────────── */}
      {selectedTransferForDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-2xl rounded-2xl border border-ledger-100 bg-white p-6 shadow-2xl dark:border-ledger-700 dark:bg-ink-900 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-ledger-100 pb-4 dark:border-ledger-700">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                  <ArrowLeftRight className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-ink-900 dark:text-white">
                    Transfer #{selectedTransferForDetail.label}
                  </h3>
                  <p className="font-mono text-xs text-emerald-700 dark:text-emerald-400">
                    Ref: {selectedTransferForDetail.referenceNo || "N/A"}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedTransferForDetail(null)}
                className="rounded-lg p-1.5 text-ledger-400 hover:bg-ledger-50 dark:hover:bg-white/[0.06]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Metadata Grid */}
            <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-ledger-50/60 p-4 text-xs dark:bg-white/[0.02]">
              <div>
                <span className="text-ledger-400 block text-[10px]">Date</span>
                <strong className="text-ink-900 dark:text-white font-mono">{selectedTransferForDetail.transferDate}</strong>
              </div>
              <div>
                <span className="text-ledger-400 block text-[10px]">Status</span>
                <span className="inline-block font-bold text-emerald-700 dark:text-emerald-400 capitalize">
                  {selectedTransferForDetail.status === "received" ? "accepted" : selectedTransferForDetail.status.replace("_", " ")}
                </span>
              </div>
              <div>
                <span className="text-ledger-400 block text-[10px]">Source (From)</span>
                <strong className="text-ink-900 dark:text-white">{selectedTransferForDetail.fromLocationName}</strong>
              </div>
              <div>
                <span className="text-ledger-400 block text-[10px]">Destination (To)</span>
                <strong className="text-ink-900 dark:text-white">{selectedTransferForDetail.toLocationName}</strong>
              </div>
              <div>
                <span className="text-ledger-400 block text-[10px]">Requested By</span>
                <strong className="text-ink-900 dark:text-white">
                  {selectedTransferForDetail.requestedByEmail}
                </strong>
              </div>
              <div>
                <span className="text-ledger-400 block text-[10px]">Total Transfer Value</span>
                <strong className="text-ink-900 dark:text-white font-mono">
                  {formatCurrency(selectedTransferForDetail.totalValue, currency)}
                </strong>
              </div>
            </div>

            {/* Line Items Table from real database */}
            <div className="mt-5 space-y-2">
              <h4 className="font-semibold text-xs text-ink-900 dark:text-white">Transferred Products</h4>
              <div className="overflow-hidden rounded-xl border border-ledger-100 text-xs dark:border-ledger-700">
                <table className="w-full text-left">
                  <thead className="bg-ledger-50/70 text-[10px] text-ledger-500 font-semibold dark:bg-white/[0.02]">
                    <tr>
                      <th className="p-2.5">Product &amp; SKU</th>
                      <th className="p-2.5 text-center">Quantity</th>
                      <th className="p-2.5 text-right">Unit Cost</th>
                      <th className="p-2.5 text-right">Total Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ledger-100 dark:divide-ledger-700">
                    {isLoadingItems ? (
                      <tr>
                        <td colSpan={4} className="p-4 text-center text-ledger-400">
                          Loading line items...
                        </td>
                      </tr>
                    ) : detailItems && detailItems.length > 0 ? (
                      detailItems.map((item, i) => (
                        <tr key={i}>
                          <td className="p-2.5">
                            <p className="font-semibold text-ink-900 dark:text-white">{item.productName}</p>
                            <span className="font-mono text-[10px] text-ledger-400">{item.sku}</span>
                          </td>
                          <td className="p-2.5 text-center font-mono font-bold text-ink-900 dark:text-white">
                            {item.quantity}
                          </td>
                          <td className="p-2.5 text-right font-mono text-ledger-600 dark:text-ledger-300">
                            {formatCurrency(item.unitCost, currency)}
                          </td>
                          <td className="p-2.5 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(item.quantity * item.unitCost, currency)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="p-4 text-center text-ledger-400">
                          No line items found for this transfer.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="mt-6 flex items-center justify-between border-t border-ledger-100 pt-4 dark:border-ledger-700">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => window.print()}
                className="gap-1.5 rounded-xl text-xs"
              >
                <Printer className="h-3.5 w-3.5" />
                Print Transfer Slip
              </Button>

              <div className="flex items-center gap-2">
                {(selectedTransferForDetail.status === "pending" || selectedTransferForDetail.status === "in_transit") && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      handleUpdateStatus(selectedTransferForDetail.id, "completed");
                      setSelectedTransferForDetail(null);
                    }}
                    className="gap-1.5 rounded-xl bg-emerald-700 text-xs text-white hover:bg-emerald-800"
                  >
                    <CheckCircle className="h-3.5 w-3.5" />
                    Receive &amp; Complete
                  </Button>
                )}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedTransferForDetail(null)}
                  className="rounded-xl text-xs"
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}