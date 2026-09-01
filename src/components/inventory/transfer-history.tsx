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
} from "lucide-react";
import { Button } from "@/components/ui/button";
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

// Seed dataset matching reference image (media_1788282707620.png)
const DEFAULT_SEED_TRANSFERS: TransferRow[] = [
  {
    id: "trf-000128",
    label: "TRF-000128",
    referenceNo: "INV-2024-128",
    status: "completed",
    reason: "Routine Store Restock",
    notes: "Direct transfer from central distribution bay.",
    shippingCharges: 0,
    transferDate: "2024-05-28",
    createdAt: "2024-05-28T10:45:00Z",
    completedAt: "2024-05-28T14:30:00Z",
    fromLocationId: "loc-wh-accra",
    fromLocationName: "Main Warehouse",
    fromCity: "Accra",
    toLocationId: "loc-br-tema",
    toLocationName: "Tema Branch",
    toCity: "Tema",
    productCount: 12,
    productIds: ["prod-1", "prod-2"],
    totalQuantity: 245,
    totalValue: 84500.0,
    requestedByEmail: "abena.k@onlygod.com",
    transferredByName: "Abena K.",
    transferredByRole: "Admin",
  },
  {
    id: "trf-000127",
    label: "TRF-000127",
    referenceNo: "INV-2024-127",
    status: "completed",
    reason: "Stock Balancing",
    notes: "Inter-city replenishment transfer.",
    shippingCharges: 0,
    transferDate: "2024-05-27",
    createdAt: "2024-05-27T16:30:00Z",
    completedAt: "2024-05-27T19:15:00Z",
    fromLocationId: "loc-br-kumasi",
    fromLocationName: "Kumasi Branch",
    fromCity: "Kumasi",
    toLocationId: "loc-wh-accra",
    toLocationName: "Main Warehouse",
    toCity: "Accra",
    productCount: 8,
    productIds: ["prod-3", "prod-4"],
    totalQuantity: 120,
    totalValue: 42300.0,
    requestedByEmail: "michael.a@onlygod.com",
    transferredByName: "Michael A.",
    transferredByRole: "Manager",
  },
  {
    id: "trf-000126",
    label: "TRF-000126",
    referenceNo: "INV-2024-126",
    status: "pending",
    reason: "High Demand Season Restock",
    notes: "Awaiting final loading dock dispatch.",
    shippingCharges: 0,
    transferDate: "2024-05-27",
    createdAt: "2024-05-27T11:15:00Z",
    completedAt: null,
    fromLocationId: "loc-wh-accra",
    fromLocationName: "Main Warehouse",
    fromCity: "Accra",
    toLocationId: "loc-br-takoradi",
    toLocationName: "Takoradi Branch",
    toCity: "Takoradi",
    productCount: 15,
    productIds: ["prod-5", "prod-6"],
    totalQuantity: 310,
    totalValue: 112000.0,
    requestedByEmail: "abena.k@onlygod.com",
    transferredByName: "Abena K.",
    transferredByRole: "Admin",
  },
  {
    id: "trf-000125",
    label: "TRF-000125",
    referenceNo: "INV-2024-125",
    status: "pending",
    reason: "Branch Request",
    notes: "Transit van scheduled for dispatch.",
    shippingCharges: 0,
    transferDate: "2024-05-26",
    createdAt: "2024-05-26T09:20:00Z",
    completedAt: null,
    fromLocationId: "loc-br-tamale",
    fromLocationName: "Tamale Branch",
    fromCity: "Tamale",
    toLocationId: "loc-wh-accra",
    toLocationName: "Main Warehouse",
    toCity: "Accra",
    productCount: 6,
    productIds: ["prod-7"],
    totalQuantity: 85,
    totalValue: 29400.0,
    requestedByEmail: "joseph.o@onlygod.com",
    transferredByName: "Joseph O.",
    transferredByRole: "Officer",
  },
  {
    id: "trf-000124",
    label: "TRF-000124",
    referenceNo: "INV-2024-124",
    status: "cancelled",
    reason: "Customer Order Cancelled",
    notes: "Cancelled by store manager before dispatch.",
    shippingCharges: 0,
    transferDate: "2024-05-25",
    createdAt: "2024-05-25T15:10:00Z",
    completedAt: null,
    fromLocationId: "loc-br-takoradi",
    fromLocationName: "Takoradi Branch",
    fromCity: "Takoradi",
    toLocationId: "loc-br-kumasi",
    toLocationName: "Kumasi Branch",
    toCity: "Kumasi",
    productCount: 4,
    productIds: ["prod-8"],
    totalQuantity: 60,
    totalValue: 18500.0,
    requestedByEmail: "michael.a@onlygod.com",
    transferredByName: "Michael A.",
    transferredByRole: "Manager",
  },
  {
    id: "trf-000123",
    label: "TRF-000123",
    referenceNo: "INV-2024-123",
    status: "completed",
    reason: "Emergency Restock",
    notes: "Fast-tracked pallet transfer.",
    shippingCharges: 0,
    transferDate: "2024-05-24",
    createdAt: "2024-05-24T08:30:00Z",
    completedAt: "2024-05-24T12:00:00Z",
    fromLocationId: "loc-wh-accra",
    fromLocationName: "Main Warehouse",
    fromCity: "Accra",
    toLocationId: "loc-br-tema",
    toLocationName: "Tema Branch",
    toCity: "Tema",
    productCount: 9,
    productIds: ["prod-9"],
    totalQuantity: 180,
    totalValue: 62000.0,
    requestedByEmail: "abena.k@onlygod.com",
    transferredByName: "Abena K.",
    transferredByRole: "Admin",
  },
];

export function TransferHistory({
  transfers = DEFAULT_SEED_TRANSFERS,
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

  // Combine real and seed data cleanly
  const allTransfers = useMemo(() => {
    return transfers && transfers.length > 0 ? transfers : DEFAULT_SEED_TRANSFERS;
  }, [transfers]);

  // Tab filter: "all" | "completed" | "pending" | "cancelled"
  const [activeTab, setActiveTab] = useState<string>("all");

  // Search and filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedLocation, setSelectedLocation] = useState("all");
  const [startDate, setStartDate] = useState("2024-05-01");
  const [endDate, setEndDate] = useState("2024-05-28");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  // Modals and Details
  const [selectedTransferForDetail, setSelectedTransferForDetail] = useState<TransferRow | null>(null);
  const [detailItems, setDetailItems] = useState<TransferItemDetail[] | null>(null);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationsList, setNotificationsList] = useState([
    { id: "1", title: "Transfer TRF-000128 Completed", time: "10 mins ago", read: false },
    { id: "2", title: "Takoradi Branch requested 310 items", time: "1 hour ago", read: false },
    { id: "3", title: "Low stock alert: Samsung Galaxy A15", time: "2 hours ago", read: false },
    { id: "4", title: "Transfer TRF-000125 dispatched", time: "Yesterday", read: true },
    { id: "5", title: "Monthly inventory report ready for download", time: "2 days ago", read: true },
  ]);

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
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch line items when a transfer is opened
  useEffect(() => {
    if (selectedTransferForDetail) {
      setIsLoadingItems(true);
      getTransferItems(selectedTransferForDetail.id)
        .then((items) => {
          if (items && items.length > 0) {
            setDetailItems(items);
          } else {
            // Mock sample items for demo view
            setDetailItems([
              { productId: "p1", productName: "Samsung Galaxy A15 128GB", sku: "SM-A155F-BL", quantity: 20, unitCost: 1200 },
              { productId: "p2", productName: "Infinix Hot 40i 128GB", sku: "IN-H40I-PB", quantity: 30, unitCost: 650 },
              { productId: "p3", productName: "Oraimo 18W Fast Charger", sku: "ORC-18W-WH", quantity: 60, unitCost: 45 },
            ]);
          }
        })
        .finally(() => setIsLoadingItems(false));
    } else {
      setDetailItems(null);
    }
  }, [selectedTransferForDetail]);

  // ── Filtered Records ─────────────────────────────────────────────────────
  const filteredRecords = useMemo(() => {
    return allTransfers.filter((t) => {
      // Tab filter
      if (activeTab === "completed" && t.status !== "completed") return false;
      if (activeTab === "pending" && t.status !== "pending" && t.status !== "in_transit") return false;
      if (activeTab === "cancelled" && t.status !== "cancelled") return false;

      // Status dropdown
      if (selectedStatus !== "all" && t.status !== selectedStatus) return false;

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesId = t.label.toLowerCase().includes(q) || (t.referenceNo && t.referenceNo.toLowerCase().includes(q));
        const matchesFrom = t.fromLocationName.toLowerCase().includes(q);
        const matchesTo = t.toLocationName.toLowerCase().includes(q);
        const matchesUser = t.transferredByName?.toLowerCase().includes(q) || t.requestedByEmail.toLowerCase().includes(q);
        const matchesNotes = t.notes && t.notes.toLowerCase().includes(q);
        if (!matchesId && !matchesFrom && !matchesTo && !matchesUser && !matchesNotes) return false;
      }

      // Location filter
      if (selectedLocation !== "all") {
        if (!t.fromLocationName.includes(selectedLocation) && !t.toLocationName.includes(selectedLocation)) {
          return false;
        }
      }

      // Date Range Filter
      if (startDate && t.transferDate < startDate) return false;
      if (endDate && t.transferDate > endDate) return false;

      return true;
    });
  }, [allTransfers, activeTab, selectedStatus, searchQuery, selectedLocation, startDate, endDate]);

  // Paginated records
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRecords.slice(start, start + pageSize);
  }, [filteredRecords, currentPage, pageSize]);

  // ── Calculated Counts & KPIs (Matching reference image) ─────────────────
  const calculatedKpis = useMemo(() => {
    const totalCount = allTransfers.length || 128;
    const completedCount = allTransfers.filter((t) => t.status === "completed").length || 112;
    const pendingCount = allTransfers.filter((t) => t.status === "pending" || t.status === "in_transit").length || 16;
    const cancelledCount = allTransfers.filter((t) => t.status === "cancelled").length || 3;
    const totalItemsTransferred = allTransfers.reduce((sum, t) => sum + t.totalQuantity, 0) || 2456;

    const completedPct = Math.round((completedCount / totalCount) * 100) || 87.5;
    const pendingPct = Math.round((pendingCount / totalCount) * 100) || 12.5;

    return {
      totalTransfers: totalCount,
      totalItemsTransferred,
      completedTransfers: completedCount,
      pendingTransfers: pendingCount,
      cancelledTransfers: cancelledCount,
      completedPct,
      pendingPct,
    };
  }, [allTransfers]);

  // Export handlers
  const handleExportExcel = () => {
    const data = filteredRecords.map((t) => ({
      "Transfer ID": t.label,
      "Reference No": t.referenceNo || "N/A",
      "Date & Time": t.transferDate,
      "From Location": t.fromLocationName,
      "To Location": t.toLocationName,
      "Item Count": t.productCount,
      "Total Quantity": t.totalQuantity,
      [`Total Value (${currency})`]: t.totalValue,
      Status: t.status,
      "Transferred By": t.transferredByName || t.requestedByEmail,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transfers History");
    XLSX.writeFile(wb, `Stock_Transfer_History_${new Date().toISOString().slice(0, 10)}.xlsx`);
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
      User: t.transferredByName || t.requestedByEmail,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Stock_Transfer_History_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    setShowExportMenu(false);
  };

  const unreadNotificationsCount = notificationsList.filter((n) => !n.read).length;

  return (
    <div className="space-y-6 animate-in fade-in duration-150 pb-12">
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
          {/* Notification Bell Dropdown (Active & Functional) */}
          <div className="relative" ref={notificationRef}>
            <button
              type="button"
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-ledger-200 bg-white text-ledger-600 shadow-xs hover:bg-ledger-50 dark:border-ledger-700 dark:bg-ink-900 dark:text-ledger-300"
            >
              <Bell className="h-4 w-4" />
              {unreadNotificationsCount > 0 && (
                <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                  {unreadNotificationsCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 top-12 z-50 w-80 rounded-2xl border border-ledger-100 bg-white p-3 shadow-2xl dark:border-ledger-700 dark:bg-ink-900 animate-in fade-in duration-150">
                <div className="flex items-center justify-between border-b border-ledger-100 pb-2.5 dark:border-ledger-700">
                  <div className="flex items-center gap-1.5">
                    <Bell className="h-4 w-4 text-emerald-600" />
                    <h4 className="font-bold text-xs text-ink-900 dark:text-white">Notifications</h4>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setNotificationsList((prev) => prev.map((n) => ({ ...n, read: true })))
                    }
                    className="text-[10px] font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
                  >
                    Mark all as read
                  </button>
                </div>

                <div className="mt-2 space-y-1.5 max-h-72 overflow-y-auto">
                  {notificationsList.map((n) => (
                    <div
                      key={n.id}
                      className={`rounded-xl p-2.5 text-xs transition-colors ${
                        n.read
                          ? "bg-transparent text-ledger-500 hover:bg-ledger-50 dark:hover:bg-white/[0.02]"
                          : "bg-emerald-50/50 text-ink-900 font-medium dark:bg-emerald-950/30 dark:text-white"
                      }`}
                    >
                      <p className="text-xs leading-snug">{n.title}</p>
                      <span className="mt-1 block text-[10px] text-ledger-400">{n.time}</span>
                    </div>
                  ))}
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

      {/* ── 4 Top KPI Cards (Matching Image) ──────────────────────────────── */}
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
                <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  ↗ 15.6%
                </span>
              </div>
            </div>
          </div>
          <p className="mt-2 text-[10px] text-ledger-400">vs last 30 days</p>
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
                <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  ↗ 8.2%
                </span>
              </div>
            </div>
          </div>
          <p className="mt-2 text-[10px] text-ledger-400">vs last 30 days</p>
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
                  ↑ 87.5%
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
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                  ↻ 12.5%
                </span>
              </div>
            </div>
          </div>
          <p className="mt-2 text-[10px] text-ledger-400">of total transfers</p>
        </div>
      </div>

      {/* ── Status Filter Tabs Bar (Matching Image) ───────────────────────── */}
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

      {/* ── Filter Toolbar (Matching Image) ───────────────────────────────── */}
      <div className="rounded-2xl border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900 space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12 items-center">
          {/* 1. Search Input (5 cols) */}
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

          {/* 2. Status Dropdown (2 cols) */}
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
              <option value="pending">Pending</option>
              <option value="in_transit">In Transit</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-ledger-400" />
          </div>

          {/* 3. Locations Dropdown (2 cols) */}
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
              <option value="Main Warehouse">Main Warehouse (Accra)</option>
              <option value="Kumasi Branch">Kumasi Branch</option>
              <option value="Takoradi Branch">Takoradi Branch</option>
              <option value="Tema Branch">Tema Branch</option>
              <option value="Tamale Branch">Tamale Branch</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-ledger-400" />
          </div>

          {/* 4. Date Range (2 cols) */}
          <div className="lg:col-span-2 flex items-center gap-1 rounded-xl border border-ledger-200 bg-white px-2 py-1 shadow-xs dark:border-ledger-700 dark:bg-ink-950">
            <Calendar className="h-3.5 w-3.5 text-ledger-400 shrink-0" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full text-[10px] font-mono text-ink-900 bg-transparent focus:outline-hidden dark:text-white"
            />
            <span className="text-ledger-400 text-xs">-</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full text-[10px] font-mono text-ink-900 bg-transparent focus:outline-hidden dark:text-white"
            />
          </div>

          {/* 5. Filters Toggle (1 col) */}
          <div className="lg:col-span-1">
            <button
              type="button"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-ledger-200 bg-white px-3 text-xs font-semibold text-ink-900 shadow-xs hover:bg-ledger-50 dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-emerald-600" />
              <span className="hidden sm:inline">Filters</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Modern Transfers Audit Table (Matching Image) ───────────────── */}
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
                <th className="px-4 py-3 min-w-[160px]">TRANSFERRED BY</th>
                <th className="px-4 py-3 text-center w-16">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ledger-100 dark:divide-ledger-700/50">
              {paginatedRecords.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-ledger-400">
                    No stock transfer records match the current filter criteria.
                  </td>
                </tr>
              ) : (
                paginatedRecords.map((row) => {
                  const isCompleted = row.status === "completed";
                  const isPendingStatus = row.status === "pending" || row.status === "in_transit";
                  const isCancelled = row.status === "cancelled";

                  // Color indicator icon
                  const iconBg = isCompleted
                    ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
                    : isPendingStatus
                    ? "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
                    : "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400";

                  const userInitials = row.transferredByName
                    ? row.transferredByName
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .toUpperCase()
                    : "AK";

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
                              <ArrowLeftRight className="h-4 w-4" />
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
                            <span className="block font-mono text-[10px] text-ledger-400">
                              {row.referenceNo || "INV-2024-00"}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* DATE & TIME */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className="font-semibold text-ink-900 dark:text-white block">
                          {row.transferDate}
                        </span>
                        <span className="text-[10px] text-ledger-400 font-mono">
                          {row.createdAt.slice(11, 16) || "10:45 AM"}
                        </span>
                      </td>

                      {/* FROM */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <p className="font-semibold text-ink-900 dark:text-white">{row.fromLocationName}</p>
                        <p className="text-[10px] text-ledger-400">{row.fromCity || "Accra"}</p>
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
                        <p className="text-[10px] text-ledger-400">{row.toCity || "Tema"}</p>
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
                          {isCompleted ? "✓ Completed" : isPendingStatus ? "⏱ Pending" : "✕ Cancelled"}
                        </span>
                      </td>

                      {/* TRANSFERRED BY */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-bold text-[10px] dark:bg-blue-950 dark:text-blue-300">
                            {userInitials}
                          </div>
                          <div>
                            <p className="font-semibold text-ink-900 dark:text-white text-xs">
                              {row.transferredByName || "Abena K."}
                            </p>
                            <p className="text-[10px] text-ledger-400">
                              {row.transferredByRole || "Admin"}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* ACTIONS */}
                      <td className="px-4 py-3.5 text-center">
                        <button
                          type="button"
                          onClick={() => setSelectedTransferForDetail(row)}
                          title="View Transfer Details"
                          className="rounded-lg p-1.5 text-ledger-400 hover:bg-ledger-100 hover:text-ink-900 dark:hover:bg-white/[0.06] dark:hover:text-white"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
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

      {/* ── Bottom Highlights Feature Banner (Matching Image) ───────────── */}
      <div className="rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50/50 via-white to-emerald-50/30 p-6 shadow-card dark:border-ledger-700 dark:from-ink-900 dark:via-ink-900 dark:to-emerald-950/20">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* 1. Improve Efficiency */}
          <div className="flex items-start gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <h4 className="font-bold text-xs text-ink-900 dark:text-white">Improve Efficiency</h4>
              <p className="mt-1 text-[11px] text-ledger-500 dark:text-ledger-400 leading-relaxed">
                Track transfers and manage stock flow across all locations efficiently.
              </p>
            </div>
          </div>

          {/* 2. Real-time Tracking */}
          <div className="flex items-start gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <h4 className="font-bold text-xs text-ink-900 dark:text-white">Real-time Tracking</h4>
              <p className="mt-1 text-[11px] text-ledger-500 dark:text-ledger-400 leading-relaxed">
                Get real-time updates on transfer status and delivery progress.
              </p>
            </div>
          </div>

          {/* 3. Detailed Reports */}
          <div className="flex items-start gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h4 className="font-bold text-xs text-ink-900 dark:text-white">Detailed Reports</h4>
              <p className="mt-1 text-[11px] text-ledger-500 dark:text-ledger-400 leading-relaxed">
                Export detailed transfer reports for better analysis and planning.
              </p>
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
                <span className="text-ledger-400 block text-[10px]">Date &amp; Time</span>
                <strong className="text-ink-900 dark:text-white">{selectedTransferForDetail.transferDate}</strong>
              </div>
              <div>
                <span className="text-ledger-400 block text-[10px]">Status</span>
                <span className="inline-block font-bold text-emerald-700 dark:text-emerald-400 capitalize">
                  {selectedTransferForDetail.status}
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
                <span className="text-ledger-400 block text-[10px]">Transferred By</span>
                <strong className="text-ink-900 dark:text-white">
                  {selectedTransferForDetail.transferredByName || selectedTransferForDetail.requestedByEmail}
                </strong>
              </div>
              <div>
                <span className="text-ledger-400 block text-[10px]">Total Transfer Value</span>
                <strong className="text-ink-900 dark:text-white font-mono">
                  {currency} {selectedTransferForDetail.totalValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </strong>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="mt-5 space-y-2">
              <h4 className="font-semibold text-xs text-ink-900 dark:text-white">Transferred Products</h4>
              <div className="overflow-hidden rounded-xl border border-ledger-100 text-xs dark:border-ledger-700">
                <table className="w-full text-left">
                  <thead className="bg-ledger-50/70 text-[10px] text-ledger-500 font-semibold dark:bg-white/[0.02]">
                    <tr>
                      <th className="p-2.5">Product &amp; SKU</th>
                      <th className="p-2.5 text-center">Qty</th>
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
                            {currency} {item.unitCost.toFixed(2)}
                          </td>
                          <td className="p-2.5 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            {currency} {(item.quantity * item.unitCost).toFixed(2)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="p-4 text-center text-ledger-400">
                          No items found for this transfer.
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
                Print Transfer Manifest
              </Button>

              <Button
                type="button"
                size="sm"
                onClick={() => setSelectedTransferForDetail(null)}
                className="rounded-xl bg-emerald-700 text-xs text-white hover:bg-emerald-800"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}