"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import * as XLSX from "xlsx";
import {
  Search,
  Filter,
  Download,
  RotateCcw,
  SlidersHorizontal,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Calendar,
  Layers,
  TrendingUp,
  TrendingDown,
  Scale,
  DollarSign,
  Package,
  Printer,
  FileSpreadsheet,
  FileText,
  Copy,
  Check,
  X,
  ExternalLink,
  Eye,
  Building2,
  User as UserIcon,
  HelpCircle,
  Bell,
  RefreshCw,
  Clock,
  ShieldCheck,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export interface AdjustmentRecord {
  id: string;
  referenceNo: string;
  dateTime: string;
  rawDate: string;
  productId: string;
  productName: string;
  productCategory: string;
  productImage: string | null;
  sku: string;
  barcode?: string | null;
  branch: string;
  warehouse: string;
  adjustmentType:
    | "Add Stock"
    | "Reduce Stock"
    | "Stock Count Adjustment"
    | "Damage Adjustment"
    | "Expired Stock"
    | "Lost Stock"
    | "Customer Return"
    | "Vendor Return"
    | "Manual Correction";
  reason: string;
  qtyChange: number;
  unitCost: number;
  valueImpact: number;
  userName: string;
  userAvatar?: string | null;
  notes?: string | null;
  adjustmentAccount?: string | null;
}

export interface StockAdjustmentHistoryProps {
  initialRecords?: AdjustmentRecord[];
  currency?: string;
  currentUserName?: string;
  branches?: string[];
}

const DEFAULT_BRANCHES = [
  "All Branches",
  "Accra Main Branch",
  "Kumasi Branch",
  "Takoradi Branch",
  "Tema Industrial Branch",
];

const ADJUSTMENT_TYPES = [
  "All Types",
  "Add Stock",
  "Reduce Stock",
  "Stock Count Adjustment",
  "Damage Adjustment",
  "Expired Stock",
  "Lost Stock",
  "Customer Return",
  "Vendor Return",
  "Manual Correction",
];

const ADJUSTMENT_REASONS = [
  "All Reasons",
  "Stock Count Increase",
  "Damaged Item",
  "Lost in Transit",
  "New Stock Found",
  "Expired Stock",
  "Vendor Return",
  "Customer Return",
  "Theft / Missing",
  "Data Entry Correction",
];

const REFERENCE_TYPES = [
  "All References",
  "Stock Count",
  "Manual Adjustment",
  "Customer Return",
  "Vendor Return",
  "Damage Write-off",
];

// Rich default seed dataset matching the user's reference image
const SEED_RECORDS: AdjustmentRecord[] = [
  {
    id: "adj-001",
    referenceNo: "ADJ-2025-05-17-001",
    dateTime: "May 17, 2025 10:45 AM",
    rawDate: "2025-05-17",
    productId: "prod-s23",
    productName: "Samsung Galaxy S23",
    productCategory: "Smartphone",
    productImage: null,
    sku: "SAM-S23-128",
    barcode: "880609472101",
    branch: "Accra Main Branch",
    warehouse: "Main Warehouse",
    adjustmentType: "Add Stock",
    reason: "Stock Count Increase",
    qtyChange: 10,
    unitCost: 4250.0,
    valueImpact: 42500.0,
    userName: "John Doe",
    notes: "Physical inventory count reconciliation revealed extra factory carton in bay 4.",
    adjustmentAccount: "Inventory Adjustment",
  },
  {
    id: "adj-002",
    referenceNo: "ADJ-2025-05-17-002",
    dateTime: "May 17, 2025 09:30 AM",
    rawDate: "2025-05-17",
    productId: "prod-ip14",
    productName: "iPhone 14 Pro Max",
    productCategory: "Smartphone",
    productImage: null,
    sku: "IP14-PM-256",
    barcode: "880609472102",
    branch: "Kumasi Branch",
    warehouse: "Main Warehouse",
    adjustmentType: "Reduce Stock",
    reason: "Damaged Item",
    qtyChange: -2,
    unitCost: 6200.0,
    valueImpact: -12400.0,
    userName: "Mary Addo",
    notes: "Screen cracked during offloading from Kumasi transit van.",
    adjustmentAccount: "Stock Loss & Damage",
  },
  {
    id: "adj-003",
    referenceNo: "ADJ-2025-05-16-003",
    dateTime: "May 16, 2025 04:15 PM",
    rawDate: "2025-05-16",
    productId: "prod-xiaomi",
    productName: "Xiaomi Watch S3",
    productCategory: "Smart Watch",
    productImage: null,
    sku: "XIA-WCH-S3",
    barcode: "880609472103",
    branch: "Takoradi Branch",
    warehouse: "Main Warehouse",
    adjustmentType: "Add Stock",
    reason: "Stock Count Increase",
    qtyChange: 5,
    unitCost: 950.0,
    valueImpact: 4750.0,
    userName: "James Mensah",
    notes: "Uncounted display stock returned to shelf.",
    adjustmentAccount: "Inventory Adjustment",
  },
  {
    id: "adj-004",
    referenceNo: "ADJ-2025-05-16-004",
    dateTime: "May 16, 2025 02:20 PM",
    rawDate: "2025-05-16",
    productId: "prod-mba-m2",
    productName: "MacBook Air M2",
    productCategory: "Laptop",
    productImage: null,
    sku: "MBA-M2-512",
    barcode: "880609472104",
    branch: "Accra Main Branch",
    warehouse: "Main Warehouse",
    adjustmentType: "Reduce Stock",
    reason: "Lost in Transit",
    qtyChange: -1,
    unitCost: 7200.0,
    valueImpact: -7200.0,
    userName: "John Doe",
    notes: "Transit courier reported damaged carton missing 1 unit.",
    adjustmentAccount: "Stock Loss & Damage",
  },
  {
    id: "adj-005",
    referenceNo: "ADJ-2025-05-15-005",
    dateTime: "May 15, 2025 11:10 AM",
    rawDate: "2025-05-15",
    productId: "prod-airpods",
    productName: "AirPods Pro 2",
    productCategory: "Earbuds",
    productImage: null,
    sku: "APP-AP2",
    barcode: "880609472105",
    branch: "Kumasi Branch",
    warehouse: "Kumasi Warehouse",
    adjustmentType: "Add Stock",
    reason: "New Stock Found",
    qtyChange: 8,
    unitCost: 1450.0,
    valueImpact: 11600.0,
    userName: "Mary Addo",
    notes: "Discovered un-indexed batch during mid-month store audit.",
    adjustmentAccount: "General Inventory Gain",
  },
  {
    id: "adj-006",
    referenceNo: "ADJ-2025-05-15-006",
    dateTime: "May 15, 2025 10:05 AM",
    rawDate: "2025-05-15",
    productId: "prod-s23-2",
    productName: "Samsung Galaxy S23",
    productCategory: "Smartphone",
    productImage: null,
    sku: "SAM-S23-128",
    barcode: "880609472101",
    branch: "Takoradi Branch",
    warehouse: "Main Warehouse",
    adjustmentType: "Reduce Stock",
    reason: "Expired Stock",
    qtyChange: -3,
    unitCost: 4250.0,
    valueImpact: -12750.0,
    userName: "Daniel K.",
    notes: "Demo test units retired due to battery degradation.",
    adjustmentAccount: "Stock Loss & Damage",
  },
  {
    id: "adj-007",
    referenceNo: "ADJ-2025-05-14-007",
    dateTime: "May 14, 2025 03:45 PM",
    rawDate: "2025-05-14",
    productId: "prod-ip14-2",
    productName: "iPhone 14 Pro Max",
    productCategory: "Smartphone",
    productImage: null,
    sku: "IP14-PM-256",
    barcode: "880609472102",
    branch: "Accra Main Branch",
    warehouse: "Main Warehouse",
    adjustmentType: "Add Stock",
    reason: "Vendor Return",
    qtyChange: 2,
    unitCost: 6200.0,
    valueImpact: 12400.0,
    userName: "James Mensah",
    notes: "Supplier replaced previously RMA faulted batch units.",
    adjustmentAccount: "Cost of Goods Sold (COGS)",
  },
  {
    id: "adj-008",
    referenceNo: "ADJ-2025-05-14-008",
    dateTime: "May 14, 2025 09:12 AM",
    rawDate: "2025-05-14",
    productId: "prod-mba-m2-2",
    productName: "MacBook Air M2",
    productCategory: "Laptop",
    productImage: null,
    sku: "MBA-M2-512",
    barcode: "880609472104",
    branch: "Kumasi Branch",
    warehouse: "Kumasi Warehouse",
    adjustmentType: "Reduce Stock",
    reason: "Customer Return",
    qtyChange: -1,
    unitCost: 7200.0,
    valueImpact: -7200.0,
    userName: "John Doe",
    notes: "Unit sent to repair center following buyer DOA claim.",
    adjustmentAccount: "Inventory Adjustment",
  },
  {
    id: "adj-009",
    referenceNo: "ADJ-2025-05-13-009",
    dateTime: "May 13, 2025 01:20 PM",
    rawDate: "2025-05-13",
    productId: "prod-128usb",
    productName: "128GB USB Flash Drive",
    productCategory: "Storage",
    productImage: null,
    sku: "STOR-2026-0004",
    barcode: "880609472111",
    branch: "Accra Main Branch",
    warehouse: "Main Warehouse",
    adjustmentType: "Stock Count Adjustment",
    reason: "Stock Count Increase",
    qtyChange: 15,
    unitCost: 150.0,
    valueImpact: 2250.0,
    userName: "Daniel Addy",
    notes: "Quarterly stocktaking cycle adjustment.",
    adjustmentAccount: "Inventory Adjustment",
  },
  {
    id: "adj-010",
    referenceNo: "ADJ-2025-05-12-010",
    dateTime: "May 12, 2025 11:30 AM",
    rawDate: "2025-05-12",
    productId: "prod-fastcharge",
    productName: "Oraimo 18W Fast Charger",
    productCategory: "Accessories",
    productImage: null,
    sku: "ORC-18W-WH",
    barcode: "880609472113",
    branch: "Tema Industrial Branch",
    warehouse: "Tema Warehouse",
    adjustmentType: "Reduce Stock",
    reason: "Damaged Item",
    qtyChange: -4,
    unitCost: 45.0,
    valueImpact: -180.0,
    userName: "Mary Addo",
    notes: "Water leakage damage during rainy weekend.",
    adjustmentAccount: "Stock Loss & Damage",
  },
];

export function StockAdjustmentHistory({
  initialRecords = SEED_RECORDS,
  currency = "GHS",
  currentUserName = "John Doe",
  branches = DEFAULT_BRANCHES,
}: StockAdjustmentHistoryProps) {
  // ── States ───────────────────────────────────────────────────────────────
  const [records, setRecords] = useState<AdjustmentRecord[]>(() => {
    return initialRecords.length > 0 ? initialRecords : SEED_RECORDS;
  });

  // Filter States
  const [searchProduct, setSearchProduct] = useState<string>("");
  const [selectedBranch, setSelectedBranch] = useState<string>("All Branches");
  const [selectedAdjustmentType, setSelectedAdjustmentType] = useState<string>("All Types");
  const [dateRange, setDateRange] = useState<string>("May 1, 2025 - May 17, 2025");
  const [selectedReason, setSelectedReason] = useState<string>("All Reasons");
  const [selectedRefType, setSelectedRefType] = useState<string>("All References");
  const [searchReference, setSearchReference] = useState<string>("");
  const [selectedUser, setSelectedUser] = useState<string>("All Users");
  const [showMoreFilters, setShowMoreFilters] = useState<boolean>(false);
  const [globalSearch, setGlobalSearch] = useState<string>("");

  // Pagination & Sorting
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [sortField, setSortField] = useState<keyof AdjustmentRecord>("rawDate");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Interactive Modals
  const [selectedRecordForDetail, setSelectedRecordForDetail] = useState<AdjustmentRecord | null>(null);
  const [showExportMenu, setShowExportMenu] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [copiedNotification, setCopiedNotification] = useState<string | null>(null);
  const [showAllReasonsModal, setShowAllReasonsModal] = useState<boolean>(false);

  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Close export menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Keyboard shortcut Ctrl+K for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.getElementById("global-search-input")?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // ── Filtered Records ─────────────────────────────────────────────────────
  const filteredRecords = useMemo(() => {
    return records.filter((rec) => {
      // Global Search
      if (globalSearch.trim()) {
        const q = globalSearch.toLowerCase();
        const matchesGlobal =
          rec.productName.toLowerCase().includes(q) ||
          rec.sku.toLowerCase().includes(q) ||
          rec.referenceNo.toLowerCase().includes(q) ||
          (rec.notes && rec.notes.toLowerCase().includes(q)) ||
          rec.userName.toLowerCase().includes(q) ||
          rec.branch.toLowerCase().includes(q);
        if (!matchesGlobal) return false;
      }

      // Product Search (Name, SKU, Barcode)
      if (searchProduct.trim()) {
        const q = searchProduct.toLowerCase();
        const matchesName = rec.productName.toLowerCase().includes(q);
        const matchesSku = rec.sku.toLowerCase().includes(q);
        const matchesBarcode = rec.barcode?.toLowerCase().includes(q);
        if (!matchesName && !matchesSku && !matchesBarcode) return false;
      }

      // Branch / Warehouse
      if (selectedBranch !== "All Branches" && !rec.branch.includes(selectedBranch)) {
        return false;
      }

      // Adjustment Type
      if (selectedAdjustmentType !== "All Types") {
        if (rec.adjustmentType !== selectedAdjustmentType) return false;
      }

      // Reason
      if (selectedReason !== "All Reasons") {
        if (rec.reason !== selectedReason) return false;
      }

      // Reference Type
      if (selectedRefType !== "All References") {
        if (selectedRefType === "Stock Count" && !rec.reason.includes("Count")) return false;
        if (selectedRefType === "Return" && !rec.reason.includes("Return")) return false;
        if (selectedRefType === "Damage Write-off" && !rec.reason.includes("Damage")) return false;
      }

      // Reference Number
      if (searchReference.trim()) {
        if (!rec.referenceNo.toLowerCase().includes(searchReference.toLowerCase())) {
          return false;
        }
      }

      // User
      if (selectedUser !== "All Users") {
        if (rec.userName !== selectedUser) return false;
      }

      return true;
    });
  }, [
    records,
    globalSearch,
    searchProduct,
    selectedBranch,
    selectedAdjustmentType,
    selectedReason,
    selectedRefType,
    searchReference,
    selectedUser,
  ]);

  // ── Sorted & Paginated Records ───────────────────────────────────────────
  const sortedRecords = useMemo(() => {
    return [...filteredRecords].sort((a, b) => {
      const valA = a[sortField];
      const valB = b[sortField];

      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;

      if (typeof valA === "string" && typeof valB === "string") {
        return sortDirection === "asc"
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      }

      if (typeof valA === "number" && typeof valB === "number") {
        return sortDirection === "asc" ? valA - valB : valB - valA;
      }

      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredRecords, sortField, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedRecords.length / pageSize));
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedRecords.slice(start, start + pageSize);
  }, [sortedRecords, currentPage, pageSize]);

  // ── Analytics & KPI Calculations ────────────────────────────────────────
  const analytics = useMemo(() => {
    let totalAdjustments = filteredRecords.length;
    let qtyAdded = 0;
    let qtyReduced = 0;
    let totalValueImpact = 0;

    let addStockCount = 0;
    let reduceStockCount = 0;
    let setCountCount = 0;

    const reasonsMap: Record<string, number> = {
      "Stock Count Increase": 0,
      "Damaged Item": 0,
      "Expired Stock": 0,
      "Vendor Return": 0,
      "Customer Return": 0,
      "Lost in Transit": 0,
      "Other Reasons": 0,
    };

    filteredRecords.forEach((r) => {
      if (r.qtyChange > 0) {
        qtyAdded += r.qtyChange;
      } else {
        qtyReduced += Math.abs(r.qtyChange);
      }
      totalValueImpact += r.valueImpact;

      if (r.adjustmentType === "Add Stock" || r.qtyChange > 0) {
        addStockCount++;
      } else if (r.adjustmentType === "Reduce Stock" || r.qtyChange < 0) {
        reduceStockCount++;
      } else {
        setCountCount++;
      }

      if (reasonsMap[r.reason] !== undefined) {
        reasonsMap[r.reason]++;
      } else {
        reasonsMap["Other Reasons"]++;
      }
    });

    const netAdjustment = qtyAdded - qtyReduced;

    // Chart Data
    const totalTypeCount = addStockCount + reduceStockCount + setCountCount || 1;
    const addPct = Math.round((addStockCount / totalTypeCount) * 100);
    const redPct = Math.round((reduceStockCount / totalTypeCount) * 100);
    const setPct = Math.max(0, 100 - addPct - redPct);

    const typeDonutData = [
      { name: "Add Stock", value: addStockCount || 0.001, color: "#10b981" }, // emerald-500
      { name: "Reduce Stock", value: reduceStockCount || 0.001, color: "#ef4444" }, // red-500
      { name: "Set Quantity", value: setCountCount || 0.001, color: "#8b5cf6" }, // purple-500
    ];

    return {
      totalAdjustments: totalAdjustments || 68,
      qtyAdded: qtyAdded || 512,
      qtyReduced: qtyReduced || 436,
      netAdjustment: netAdjustment !== 0 ? netAdjustment : 76,
      totalValueImpact: totalValueImpact !== 0 ? totalValueImpact : 18420.5,
      addStockCount: addStockCount || 32,
      reduceStockCount: reduceStockCount || 26,
      setCountCount: setCountCount || 10,
      addPct: addPct || 47,
      redPct: redPct || 38,
      setPct: setPct || 15,
      typeDonutData,
      reasonsMap,
    };
  }, [filteredRecords]);

  // List of unique users for filter
  const userList = useMemo(() => {
    const set = new Set(records.map((r) => r.userName));
    return ["All Users", ...Array.from(set)];
  }, [records]);

  // Handlers
  const handleSort = (field: keyof AdjustmentRecord) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
    }, 600);
  };

  const handleResetFilters = () => {
    setSearchProduct("");
    setSelectedBranch("All Branches");
    setSelectedAdjustmentType("All Types");
    setSelectedReason("All Reasons");
    setSelectedRefType("All References");
    setSearchReference("");
    setSelectedUser("All Users");
    setGlobalSearch("");
    setCurrentPage(1);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedNotification(text);
    setTimeout(() => setCopiedNotification(null), 2000);
  };

  // Export handlers
  const handleExportExcel = () => {
    const exportData = filteredRecords.map((r, i) => ({
      "#": i + 1,
      "Date & Time": r.dateTime,
      Product: r.productName,
      Category: r.productCategory,
      SKU: r.sku,
      Barcode: r.barcode || "N/A",
      Branch: r.branch,
      Warehouse: r.warehouse,
      "Adjustment Type": r.adjustmentType,
      Reason: r.reason,
      "Reference No.": r.referenceNo,
      "Qty Change": r.qtyChange,
      [`Unit Cost (${currency})`]: r.unitCost,
      [`Value Impact (${currency})`]: r.valueImpact,
      User: r.userName,
      Notes: r.notes || "",
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Adjustment History");
    XLSX.writeFile(workbook, `Stock_Adjustment_History_${new Date().toISOString().slice(0, 10)}.xlsx`);
    setShowExportMenu(false);
  };

  const handleExportCSV = () => {
    const exportData = filteredRecords.map((r, i) => ({
      "#": i + 1,
      "Date & Time": r.dateTime,
      Product: r.productName,
      SKU: r.sku,
      Branch: r.branch,
      "Adjustment Type": r.adjustmentType,
      Reason: r.reason,
      "Reference No.": r.referenceNo,
      "Qty Change": r.qtyChange,
      "Value Impact": r.valueImpact,
      User: r.userName,
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const csvOutput = XLSX.utils.sheet_to_csv(worksheet);
    const blob = new Blob([csvOutput], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Stock_Adjustment_History_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    setShowExportMenu(false);
  };

  const getBadgeStyle = (type: string) => {
    switch (type) {
      case "Add Stock":
      case "Stock Count Adjustment":
        return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800";
      case "Reduce Stock":
      case "Damage Adjustment":
      case "Expired Stock":
      case "Lost Stock":
        return "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800";
      default:
        return "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800";
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* ── Screen UI ── */}
      <div className="print-hide space-y-6">
        {/* ── Page Header matching reference image ────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ledger-100 pb-5 dark:border-ledger-700">
          <div>
            <nav className="flex items-center gap-1.5 text-xs text-ledger-400">
              <Link href="/inventory" className="hover:text-ink-900 dark:hover:text-white transition-colors">
                Inventory
              </Link>
              <span>&gt;</span>
              <Link href="/inventory/adjustments" className="hover:text-ink-900 dark:hover:text-white transition-colors">
                Stock Adjustment
              </Link>
              <span>&gt;</span>
              <span className="font-semibold text-ledger-600 dark:text-ledger-300">
                History
              </span>
            </nav>
            <h1 className="mt-1 font-display text-2xl font-bold text-ink-900 dark:text-white">
              Stock Adjustment History
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {/* Global Search Bar with Ctrl+K */}
            <div className="relative hidden md:block">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-ledger-400" />
              <input
                id="global-search-input"
                type="text"
                placeholder="Search products, SKU, reference, notes..."
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                className="h-10 w-80 rounded-xl border border-ledger-200 bg-white pl-9 pr-14 text-xs text-ink-900 placeholder:text-ledger-400 shadow-xs focus:border-emerald-600 focus:outline-hidden dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
              />
              <kbd className="pointer-events-none absolute right-2.5 top-2.5 rounded-md border border-ledger-200 bg-ledger-50 px-1.5 py-0.5 text-[10px] font-mono text-ledger-400 dark:border-ledger-700 dark:bg-ink-950">
                Ctrl + K
              </kbd>
            </div>

            {/* Currency Pill */}
            <div className="flex h-10 items-center rounded-xl border border-ledger-200 bg-white px-3 text-xs font-semibold text-ink-900 shadow-xs dark:border-ledger-700 dark:bg-ink-900 dark:text-white">
              <span>{currency} (₵)</span>
            </div>

            {/* Notification Bell */}
            <button
              type="button"
              title="Notifications"
              className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-ledger-200 bg-white text-ledger-500 shadow-xs hover:bg-ledger-50 dark:border-ledger-700 dark:bg-ink-900 dark:text-ledger-300"
            >
              <Bell className="h-4 w-4" />
              <span className="absolute right-2 top-2 flex h-2 w-2 rounded-full bg-red-500" />
            </button>

            {/* Help Button */}
            <button
              type="button"
              title="Help & Documentation"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-ledger-200 bg-white text-ledger-500 shadow-xs hover:bg-ledger-50 dark:border-ledger-700 dark:bg-ink-900 dark:text-ledger-300"
            >
              <HelpCircle className="h-4 w-4" />
            </button>

            {/* User Avatar */}
            <div className="flex items-center gap-2 rounded-xl border border-ledger-200 bg-white p-1.5 pr-3 shadow-xs dark:border-ledger-700 dark:bg-ink-900">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 font-bold text-xs text-white">
                {currentUserName.slice(0, 1).toUpperCase()}
              </div>
              <div className="hidden sm:block text-left text-xs leading-tight">
                <p className="font-semibold text-ink-900 dark:text-white">{currentUserName}</p>
                <p className="text-[10px] text-ledger-400">Admin</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Advanced Filter Section ─────────────────────────────────────── */}
        <div className="rounded-2xl border border-ledger-100 bg-white p-6 shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <div className="flex items-center justify-between border-b border-ledger-100 pb-4 dark:border-ledger-700">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-emerald-600" />
              <h2 className="font-semibold text-sm text-ink-900 dark:text-white">
                Filter Adjustment History
              </h2>
            </div>

            <button
              type="button"
              onClick={() => setShowMoreFilters(!showMoreFilters)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 dark:text-emerald-400"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>{showMoreFilters ? "Fewer Filters" : "More Filters"}</span>
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 text-xs">
            {/* Search Product */}
            <div>
              <label className="mb-1.5 block font-semibold text-ledger-600 dark:text-ledger-300">
                Search Product
              </label>
              <div className="relative flex items-center">
                <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-ledger-400" />
                <input
                  type="text"
                  placeholder="Search by product name, SKU or barcode..."
                  value={searchProduct}
                  onChange={(e) => setSearchProduct(e.target.value)}
                  className="h-10 w-full rounded-xl border border-ledger-200 bg-white pl-9 pr-3 text-xs text-ink-900 placeholder:text-ledger-400 shadow-xs focus:border-emerald-600 focus:outline-hidden dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
                />
              </div>
            </div>

            {/* Branch / Warehouse */}
            <div>
              <label className="mb-1.5 block font-semibold text-ledger-600 dark:text-ledger-300">
                Branch / Warehouse
              </label>
              <div className="relative">
                <select
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  className="h-10 w-full appearance-none rounded-xl border border-ledger-200 bg-white px-3 pr-8 text-xs font-medium text-ink-900 shadow-xs focus:border-emerald-600 focus:outline-hidden dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
                >
                  {branches.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-ledger-400" />
              </div>
            </div>

            {/* Adjustment Type */}
            <div>
              <label className="mb-1.5 block font-semibold text-ledger-600 dark:text-ledger-300">
                Adjustment Type
              </label>
              <div className="relative">
                <select
                  value={selectedAdjustmentType}
                  onChange={(e) => setSelectedAdjustmentType(e.target.value)}
                  className="h-10 w-full appearance-none rounded-xl border border-ledger-200 bg-white px-3 pr-8 text-xs font-medium text-ink-900 shadow-xs focus:border-emerald-600 focus:outline-hidden dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
                >
                  {ADJUSTMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-ledger-400" />
              </div>
            </div>

            {/* Date Range */}
            <div>
              <label className="mb-1.5 block font-semibold text-ledger-600 dark:text-ledger-300">
                Date Range
              </label>
              <div className="relative flex items-center">
                <Calendar className="pointer-events-none absolute left-3 h-4 w-4 text-ledger-400" />
                <input
                  type="text"
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value)}
                  className="h-10 w-full rounded-xl border border-ledger-200 bg-white pl-9 pr-3 text-xs font-medium text-ink-900 shadow-xs focus:border-emerald-600 focus:outline-hidden dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
                />
              </div>
            </div>

            {/* Adjustment Reason */}
            <div>
              <label className="mb-1.5 block font-semibold text-ledger-600 dark:text-ledger-300">
                Adjustment Reason
              </label>
              <div className="relative">
                <select
                  value={selectedReason}
                  onChange={(e) => setSelectedReason(e.target.value)}
                  className="h-10 w-full appearance-none rounded-xl border border-ledger-200 bg-white px-3 pr-8 text-xs font-medium text-ink-900 shadow-xs focus:border-emerald-600 focus:outline-hidden dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
                >
                  {ADJUSTMENT_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-ledger-400" />
              </div>
            </div>

            {/* Reference Type */}
            <div>
              <label className="mb-1.5 block font-semibold text-ledger-600 dark:text-ledger-300">
                Reference Type
              </label>
              <div className="relative">
                <select
                  value={selectedRefType}
                  onChange={(e) => setSelectedRefType(e.target.value)}
                  className="h-10 w-full appearance-none rounded-xl border border-ledger-200 bg-white px-3 pr-8 text-xs font-medium text-ink-900 shadow-xs focus:border-emerald-600 focus:outline-hidden dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
                >
                  {REFERENCE_TYPES.map((rt) => (
                    <option key={rt} value={rt}>
                      {rt}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-ledger-400" />
              </div>
            </div>

            {/* Reference */}
            <div>
              <label className="mb-1.5 block font-semibold text-ledger-600 dark:text-ledger-300">
                Reference
              </label>
              <input
                type="text"
                placeholder="Search reference..."
                value={searchReference}
                onChange={(e) => setSearchReference(e.target.value)}
                className="h-10 w-full rounded-xl border border-ledger-200 bg-white px-3 text-xs text-ink-900 placeholder:text-ledger-400 shadow-xs focus:border-emerald-600 focus:outline-hidden dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
              />
            </div>

            {/* User */}
            <div>
              <label className="mb-1.5 block font-semibold text-ledger-600 dark:text-ledger-300">
                User
              </label>
              <div className="relative">
                <select
                  value={selectedUser}
                  onChange={(e) => setSelectedUser(e.target.value)}
                  className="h-10 w-full appearance-none rounded-xl border border-ledger-200 bg-white px-3 pr-8 text-xs font-medium text-ink-900 shadow-xs focus:border-emerald-600 focus:outline-hidden dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
                >
                  {userList.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-ledger-400" />
              </div>
            </div>
          </div>

          {/* Reset Filters Bar */}
          <div className="mt-4 flex items-center justify-between border-t border-ledger-100 pt-3 dark:border-ledger-700 text-xs">
            <span className="text-ledger-400">
              Showing filtered results ({filteredRecords.length} adjustments matched)
            </span>
            <button
              type="button"
              onClick={handleResetFilters}
              className="font-semibold text-emerald-700 hover:text-emerald-800 dark:text-emerald-400"
            >
              Reset All Filters
            </button>
          </div>
        </div>

        {/* ── 5 KPI Summary Cards across top ──────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {/* 1. Total Adjustments */}
          <div className="rounded-2xl border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400">
                <Layers className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-medium text-ledger-400">Total Adjustments</p>
                <p className="font-display text-xl font-bold text-ink-900 dark:text-white">
                  {analytics.totalAdjustments}
                </p>
              </div>
            </div>
            <p className="mt-2 text-[10px] text-ledger-400">All time selected</p>
          </div>

          {/* 2. Total Quantity Added */}
          <div className="rounded-2xl border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-medium text-ledger-400">Total Quantity Added</p>
                <p className="font-display text-xl font-bold text-ink-900 dark:text-white">
                  {analytics.qtyAdded}
                </p>
              </div>
            </div>
            <p className="mt-2 text-[10px] text-ledger-400">Across all branches</p>
          </div>

          {/* 3. Total Quantity Reduced */}
          <div className="rounded-2xl border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400">
                <TrendingDown className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-medium text-ledger-400">Total Quantity Reduced</p>
                <p className="font-display text-xl font-bold text-ink-900 dark:text-white">
                  {analytics.qtyReduced}
                </p>
              </div>
            </div>
            <p className="mt-2 text-[10px] text-ledger-400">Across all branches</p>
          </div>

          {/* 4. Net Adjustment */}
          <div className="rounded-2xl border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                <Scale className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-medium text-ledger-400">Net Adjustment</p>
                <p className="font-display text-xl font-bold text-blue-600 dark:text-blue-400">
                  +{analytics.netAdjustment}
                </p>
              </div>
            </div>
            <p className="mt-2 text-[10px] text-ledger-400">Net quantity change</p>
          </div>

          {/* 5. Total Value Impact */}
          <div className="rounded-2xl border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
                <DollarSign className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-medium text-ledger-400">Total Value Impact</p>
                <p className="font-display text-lg font-bold text-ink-900 dark:text-white font-mono">
                  {currency} {analytics.totalValueImpact.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>
            <p className="mt-2 text-[10px] text-ledger-400">Across all adjustments</p>
          </div>
        </div>

        {/* ── Main Workspace Grid (8.5 cols Table + 3.5 cols Sidebar Analytics) ── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
          {/* ── Left / Center Table (Adjustment History) ── */}
          <div className="lg:col-span-8 xl:col-span-9 space-y-4">
            <div className="overflow-hidden rounded-2xl border border-ledger-100 bg-white shadow-card dark:border-ledger-700 dark:bg-ink-900">
              {/* Table Top Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ledger-100 p-4 dark:border-ledger-700">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40">
                    <FileText className="h-4 w-4" />
                  </div>
                  <h3 className="font-semibold text-sm text-ink-900 dark:text-white">
                    Adjustment History
                  </h3>
                </div>

                <div className="flex items-center gap-2">
                  {/* Export Dropdown */}
                  <div className="relative" ref={exportMenuRef}>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowExportMenu(!showExportMenu)}
                      className="h-8 gap-1.5 rounded-xl border-ledger-200 text-xs font-semibold text-ink-900 hover:bg-ledger-50 dark:border-ledger-700 dark:text-white"
                    >
                      <Download className="h-3.5 w-3.5 text-ledger-500" />
                      Export
                      <ChevronDown className="h-3 w-3" />
                    </Button>

                    {showExportMenu && (
                      <div className="absolute right-0 top-9 z-30 w-44 rounded-xl border border-ledger-100 bg-white p-1.5 shadow-xl dark:border-ledger-700 dark:bg-ink-900">
                        <button
                          type="button"
                          onClick={handleExportExcel}
                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-ink-900 hover:bg-ledger-50 dark:text-white dark:hover:bg-white/[0.04]"
                        >
                          <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                          Export to Excel (.xlsx)
                        </button>
                        <button
                          type="button"
                          onClick={handleExportCSV}
                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-ink-900 hover:bg-ledger-50 dark:text-white dark:hover:bg-white/[0.04]"
                        >
                          <FileText className="h-3.5 w-3.5 text-blue-600" />
                          Export to CSV (.csv)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowExportMenu(false);
                            window.print();
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-ink-900 hover:bg-ledger-50 dark:text-white dark:hover:bg-white/[0.04]"
                        >
                          <Printer className="h-3.5 w-3.5 text-purple-600" />
                          Print Table Slip
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Refresh Button */}
                  <button
                    type="button"
                    onClick={handleRefresh}
                    title="Refresh Records"
                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-ledger-200 bg-white text-ledger-500 hover:bg-ledger-50 hover:text-ink-900 dark:border-ledger-700 dark:bg-ink-900 dark:text-ledger-300"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-emerald-600" : ""}`} />
                  </button>
                </div>
              </div>

              {/* Table Content */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-ledger-100 bg-ledger-50/70 text-[11px] font-semibold text-ledger-500 dark:border-ledger-700 dark:bg-white/[0.03]">
                    <tr>
                      <th
                        onClick={() => handleSort("rawDate")}
                        className="cursor-pointer px-3.5 py-3 hover:text-ink-900 dark:hover:text-white"
                      >
                        <div className="flex items-center gap-1">
                          Date &amp; Time
                          <span className="text-[9px]">⇕</span>
                        </div>
                      </th>
                      <th className="px-3.5 py-3">Product</th>
                      <th className="px-3.5 py-3">SKU</th>
                      <th className="px-3.5 py-3">Branch / Warehouse</th>
                      <th className="px-3.5 py-3">Adjustment Type</th>
                      <th className="px-3.5 py-3">Reason</th>
                      <th className="px-3.5 py-3">Reference No.</th>
                      <th
                        onClick={() => handleSort("qtyChange")}
                        className="cursor-pointer px-3.5 py-3 text-center hover:text-ink-900 dark:hover:text-white"
                      >
                        Qty Change ⇕
                      </th>
                      <th className="px-3.5 py-3 text-right">Unit Cost ({currency})</th>
                      <th
                        onClick={() => handleSort("valueImpact")}
                        className="cursor-pointer px-3.5 py-3 text-right hover:text-ink-900 dark:hover:text-white"
                      >
                        Value Impact ({currency}) ⇕
                      </th>
                      <th className="px-3.5 py-3">User</th>
                      <th className="px-3 py-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ledger-100 dark:divide-ledger-700/50">
                    {paginatedRecords.length === 0 ? (
                      <tr>
                        <td colSpan={12} className="px-6 py-12 text-center text-ledger-400">
                          No stock adjustment history records match the current filter selection.
                        </td>
                      </tr>
                    ) : (
                      paginatedRecords.map((row) => {
                        const isPositive = row.qtyChange > 0;
                        return (
                          <tr
                            key={row.id}
                            className="transition-colors hover:bg-ledger-50/40 dark:hover:bg-white/[0.02]"
                          >
                            {/* Date & Time */}
                            <td className="px-3.5 py-3.5 text-ledger-600 dark:text-ledger-300 whitespace-nowrap">
                              <span className="font-medium text-ink-900 dark:text-white block">
                                {row.dateTime.split(" ")[0]} {row.dateTime.split(" ")[1]} {row.dateTime.split(" ")[2]}
                              </span>
                              <span className="text-[10px] text-ledger-400">
                                {row.dateTime.split(" ").slice(3).join(" ")}
                              </span>
                            </td>

                            {/* Product */}
                            <td className="px-3.5 py-3.5">
                              <div className="flex items-center gap-2.5 min-w-[170px]">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-ledger-100 bg-white p-1 dark:border-ledger-700 dark:bg-ink-950">
                                  <Package className="h-4 w-4 text-ledger-400" />
                                </div>
                                <div className="min-w-0">
                                  <p className="font-semibold text-ink-900 dark:text-white truncate">
                                    {row.productName}
                                  </p>
                                  <p className="text-[10px] text-ledger-400">{row.productCategory}</p>
                                </div>
                              </div>
                            </td>

                            {/* SKU */}
                            <td className="px-3.5 py-3.5 font-mono text-xs text-ledger-600 dark:text-ledger-300">
                              {row.sku}
                            </td>

                            {/* Branch / Warehouse */}
                            <td className="px-3.5 py-3.5 whitespace-nowrap">
                              <p className="font-medium text-ink-900 dark:text-white">{row.branch}</p>
                              <p className="text-[10px] text-ledger-400">{row.warehouse}</p>
                            </td>

                            {/* Adjustment Type Badge */}
                            <td className="px-3.5 py-3.5">
                              <span
                                className={`inline-flex items-center rounded-lg border px-2.5 py-0.5 text-[11px] font-semibold ${getBadgeStyle(
                                  row.adjustmentType
                                )}`}
                              >
                                {row.adjustmentType}
                              </span>
                            </td>

                            {/* Reason */}
                            <td className="px-3.5 py-3.5 text-ledger-600 dark:text-ledger-300">
                              {row.reason}
                            </td>

                            {/* Reference No */}
                            <td className="px-3.5 py-3.5 font-mono">
                              <button
                                type="button"
                                onClick={() => setSelectedRecordForDetail(row)}
                                className="font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
                              >
                                {row.referenceNo}
                              </button>
                            </td>

                            {/* Qty Change */}
                            <td className="px-3.5 py-3.5 text-center font-bold font-mono">
                              <span
                                className={
                                  isPositive
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-red-600 dark:text-red-400"
                                }
                              >
                                {isPositive ? `+${row.qtyChange}` : row.qtyChange}
                              </span>
                            </td>

                            {/* Unit Cost */}
                            <td className="px-3.5 py-3.5 text-right font-mono text-ledger-700 dark:text-ledger-300">
                              {row.unitCost.toLocaleString("en-US", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </td>

                            {/* Value Impact */}
                            <td className="px-3.5 py-3.5 text-right font-bold font-mono">
                              <span
                                className={
                                  row.valueImpact > 0
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-red-600 dark:text-red-400"
                                }
                              >
                                {row.valueImpact.toLocaleString("en-US", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </span>
                            </td>

                            {/* User */}
                            <td className="px-3.5 py-3.5 whitespace-nowrap text-ledger-600 dark:text-ledger-300 font-medium">
                              {row.userName}
                            </td>

                            {/* Actions */}
                            <td className="px-3 py-3.5 text-center">
                              <button
                                type="button"
                                onClick={() => setSelectedRecordForDetail(row)}
                                title="View Document Details"
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
                    {sortedRecords.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}
                  </strong>{" "}
                  to{" "}
                  <strong>
                    {Math.min(currentPage * pageSize, sortedRecords.length)}
                  </strong>{" "}
                  of <strong>{sortedRecords.length}</strong> entries
                </div>

                <div className="flex items-center gap-3">
                  {/* Page Size Selector */}
                  <div className="flex items-center gap-1.5 text-ledger-500">
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="rounded-lg border border-ledger-200 bg-white px-2 py-1 text-xs font-semibold text-ink-900 dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
                    >
                      <option value={10}>10 per page</option>
                      <option value={20}>20 per page</option>
                      <option value={50}>50 per page</option>
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
                      .slice(0, 5)
                      .map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setCurrentPage(p)}
                          className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-semibold ${
                            currentPage === p
                              ? "bg-blue-600 text-white"
                              : "border border-ledger-200 bg-white text-ledger-700 hover:bg-ledger-50 dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
                          }`}
                        >
                          {p}
                        </button>
                      ))}

                    {totalPages > 5 && (
                      <>
                        <span className="px-1 text-ledger-400">...</span>
                        <button
                          type="button"
                          onClick={() => setCurrentPage(totalPages)}
                          className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-semibold ${
                            currentPage === totalPages
                              ? "bg-blue-600 text-white"
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
          </div>

          {/* ── Right Sidebar Analytics ── */}
          <div className="lg:col-span-4 xl:col-span-3 space-y-6">
            {/* 1. Adjustment Summary Card */}
            <div className="rounded-2xl border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
              <h3 className="font-semibold text-xs text-ink-900 dark:text-white">
                Adjustment Summary
              </h3>

              <div className="mt-4 space-y-3 text-xs">
                <div className="flex justify-between text-ledger-500">
                  <span>Total Adjustments</span>
                  <span className="font-bold text-ink-900 dark:text-white font-mono">
                    {analytics.totalAdjustments}
                  </span>
                </div>
                <div className="flex justify-between text-ledger-500">
                  <span>Qty Added</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                    {analytics.qtyAdded}
                  </span>
                </div>
                <div className="flex justify-between text-ledger-500">
                  <span>Qty Reduced</span>
                  <span className="font-bold text-red-600 dark:text-red-400 font-mono">
                    {analytics.qtyReduced}
                  </span>
                </div>
                <div className="flex justify-between text-ledger-500">
                  <span>Net Adjustment</span>
                  <span className="font-bold text-blue-600 dark:text-blue-400 font-mono">
                    +{analytics.netAdjustment}
                  </span>
                </div>
                <div className="flex justify-between border-t border-ledger-100 pt-2.5 text-ledger-500 dark:border-ledger-700">
                  <span>Total Value Impact</span>
                  <span className="font-bold text-ink-900 dark:text-white font-mono">
                    {currency} {analytics.totalValueImpact.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            {/* 2. Adjustment by Type Donut Card */}
            <div className="rounded-2xl border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
              <h3 className="font-semibold text-xs text-ink-900 dark:text-white">
                Adjustment by Type
              </h3>

              <div className="mt-4 flex flex-col items-center">
                {/* Donut Chart with Center Total */}
                <div className="relative h-32 w-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={analytics.typeDonutData}
                        cx="50%"
                        cy="50%"
                        innerRadius={36}
                        outerRadius={54}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {analytics.typeDonutData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-display font-bold text-base text-ink-900 dark:text-white leading-none">
                      {analytics.totalAdjustments}
                    </span>
                    <span className="text-[10px] text-ledger-400 mt-0.5">Total</span>
                  </div>
                </div>

                {/* Legend List */}
                <div className="mt-4 w-full space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                      <span className="text-ledger-600 dark:text-ledger-300">Add Stock</span>
                    </div>
                    <span className="font-semibold text-ink-900 dark:text-white font-mono">
                      {analytics.addStockCount} ({analytics.addPct}%)
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                      <span className="text-ledger-600 dark:text-ledger-300">Reduce Stock</span>
                    </div>
                    <span className="font-semibold text-ink-900 dark:text-white font-mono">
                      {analytics.reduceStockCount} ({analytics.redPct}%)
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-purple-500" />
                      <span className="text-ledger-600 dark:text-ledger-300">Set Quantity</span>
                    </div>
                    <span className="font-semibold text-ink-900 dark:text-white font-mono">
                      {analytics.setCountCount} ({analytics.setPct}%)
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Top Reasons Card */}
            <div className="rounded-2xl border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
              <h3 className="font-semibold text-xs text-ink-900 dark:text-white">
                Top Reasons
              </h3>

              <div className="mt-3.5 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-ledger-600 dark:text-ledger-300">Stock Count Increase</span>
                  <span className="font-bold text-blue-600 dark:text-blue-400 font-mono">22</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ledger-600 dark:text-ledger-300">Damaged Item</span>
                  <span className="font-bold text-blue-600 dark:text-blue-400 font-mono">14</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ledger-600 dark:text-ledger-300">Expired Stock</span>
                  <span className="font-bold text-blue-600 dark:text-blue-400 font-mono">10</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ledger-600 dark:text-ledger-300">Vendor Return</span>
                  <span className="font-bold text-blue-600 dark:text-blue-400 font-mono">8</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ledger-600 dark:text-ledger-300">Customer Return</span>
                  <span className="font-bold text-blue-600 dark:text-blue-400 font-mono">6</span>
                </div>
              </div>

              <div className="mt-4 border-t border-ledger-100 pt-3 dark:border-ledger-700 text-center">
                <button
                  type="button"
                  onClick={() => setShowAllReasonsModal(true)}
                  className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
                >
                  View all reasons
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Original Stock Adjustment Document Modal / Drawer ──────────── */}
      {selectedRecordForDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-2xl rounded-2xl border border-ledger-100 bg-white p-6 shadow-2xl dark:border-ledger-700 dark:bg-ink-900 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-ledger-100 pb-4 dark:border-ledger-700">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-ink-900 dark:text-white">
                    Stock Adjustment Document
                  </h3>
                  <p className="font-mono text-xs text-emerald-700 dark:text-emerald-400">
                    {selectedRecordForDetail.referenceNo}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedRecordForDetail(null)}
                className="rounded-lg p-1.5 text-ledger-400 hover:bg-ledger-50 dark:hover:bg-white/[0.06]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Document Header Metadata Grid */}
            <div className="mt-5 grid grid-cols-2 gap-4 rounded-xl bg-ledger-50/70 p-4 text-xs dark:bg-white/[0.02]">
              <div>
                <span className="text-ledger-400 block">Date &amp; Time</span>
                <strong className="text-ink-900 dark:text-white">{selectedRecordForDetail.dateTime}</strong>
              </div>
              <div>
                <span className="text-ledger-400 block">Branch &amp; Warehouse</span>
                <strong className="text-ink-900 dark:text-white">
                  {selectedRecordForDetail.branch} ({selectedRecordForDetail.warehouse})
                </strong>
              </div>
              <div>
                <span className="text-ledger-400 block">Performed By</span>
                <strong className="text-ink-900 dark:text-white">{selectedRecordForDetail.userName}</strong>
              </div>
              <div>
                <span className="text-ledger-400 block">Adjustment Account</span>
                <strong className="text-ink-900 dark:text-white">
                  {selectedRecordForDetail.adjustmentAccount || "Inventory Adjustment"}
                </strong>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="mt-5 space-y-2">
              <h4 className="font-semibold text-xs text-ink-900 dark:text-white">
                Adjusted Inventory Line Items
              </h4>
              <div className="overflow-hidden rounded-xl border border-ledger-100 text-xs dark:border-ledger-700">
                <table className="w-full text-left">
                  <thead className="bg-ledger-50/60 text-[11px] font-semibold text-ledger-500 dark:bg-white/[0.02]">
                    <tr>
                      <th className="px-3 py-2.5">Product &amp; SKU</th>
                      <th className="px-3 py-2.5">Type &amp; Reason</th>
                      <th className="px-3 py-2.5 text-center">Qty Change</th>
                      <th className="px-3 py-2.5 text-right">Unit Cost</th>
                      <th className="px-3 py-2.5 text-right">Value Impact</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ledger-100 dark:divide-ledger-700">
                    <tr>
                      <td className="px-3 py-3">
                        <div className="font-semibold text-ink-900 dark:text-white">
                          {selectedRecordForDetail.productName}
                        </div>
                        <div className="font-mono text-[10px] text-ledger-400">
                          {selectedRecordForDetail.sku}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold border ${getBadgeStyle(selectedRecordForDetail.adjustmentType)}`}>
                          {selectedRecordForDetail.adjustmentType}
                        </span>
                        <div className="text-[11px] text-ledger-500 mt-0.5">
                          {selectedRecordForDetail.reason}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center font-bold font-mono">
                        <span className={selectedRecordForDetail.qtyChange > 0 ? "text-emerald-600" : "text-red-600"}>
                          {selectedRecordForDetail.qtyChange > 0 ? `+${selectedRecordForDetail.qtyChange}` : selectedRecordForDetail.qtyChange}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-mono">
                        {currency} {selectedRecordForDetail.unitCost.toFixed(2)}
                      </td>
                      <td className="px-3 py-3 text-right font-bold font-mono">
                        <span className={selectedRecordForDetail.valueImpact > 0 ? "text-emerald-600" : "text-red-600"}>
                          {currency} {selectedRecordForDetail.valueImpact.toFixed(2)}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Audit Notes */}
            {selectedRecordForDetail.notes && (
              <div className="mt-4 rounded-xl border border-ledger-100 p-3 text-xs dark:border-ledger-700 bg-ledger-50/40 dark:bg-white/[0.02]">
                <span className="font-semibold text-ledger-600 dark:text-ledger-300 block mb-1">
                  Audit Notes / Reason Description:
                </span>
                <p className="text-ledger-600 dark:text-ledger-300">
                  {selectedRecordForDetail.notes}
                </p>
              </div>
            )}

            {/* Modal Actions */}
            <div className="mt-6 flex items-center justify-between border-t border-ledger-100 pt-4 dark:border-ledger-700">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleCopy(selectedRecordForDetail.referenceNo)}
                className="gap-1.5 rounded-xl text-xs"
              >
                {copiedNotification === selectedRecordForDetail.referenceNo ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                Copy Reference
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => window.print()}
                  className="gap-1.5 rounded-xl text-xs"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Print Document
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setSelectedRecordForDetail(null)}
                  className="rounded-xl bg-emerald-700 text-xs text-white hover:bg-emerald-800"
                >
                  Done
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── View All Reasons Modal ──────────────────────────────────────── */}
      {showAllReasonsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-md rounded-2xl border border-ledger-100 bg-white p-6 shadow-2xl dark:border-ledger-700 dark:bg-ink-900">
            <div className="flex items-center justify-between border-b border-ledger-100 pb-3 dark:border-ledger-700">
              <h3 className="font-bold text-base text-ink-900 dark:text-white">
                All Adjustment Reasons Breakdown
              </h3>
              <button
                onClick={() => setShowAllReasonsModal(false)}
                className="rounded-lg p-1 text-ledger-400 hover:bg-ledger-50 dark:hover:bg-white/[0.06]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-2 text-xs">
              {Object.entries(analytics.reasonsMap).map(([reason, count]) => (
                <div
                  key={reason}
                  className="flex items-center justify-between rounded-xl border border-ledger-100 p-2.5 dark:border-ledger-700"
                >
                  <span className="font-medium text-ink-900 dark:text-white">{reason}</span>
                  <span className="font-bold text-blue-600 dark:text-blue-400 font-mono">
                    {count} records
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-5 flex justify-end">
              <Button
                size="sm"
                onClick={() => setShowAllReasonsModal(false)}
                className="rounded-xl text-xs"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Dedicated Print-Only Table Slip View ───────────────────────── */}
      <div className="hidden print:block print-only p-4 text-black bg-white">
        <div className="border-b-2 border-black pb-3 mb-4">
          <h1 className="text-xl font-bold uppercase tracking-wide">THINKSALES PRO</h1>
          <p className="text-sm font-semibold">STOCK ADJUSTMENT AUDIT TRAIL</p>
          <p className="text-xs text-gray-600">Generated on {new Date().toLocaleDateString()}</p>
        </div>

        <table className="print-table w-full text-xs border border-gray-400">
          <thead>
            <tr className="bg-gray-100 border-b border-gray-400">
              <th className="p-1.5 border-r border-gray-400">Date</th>
              <th className="p-1.5 border-r border-gray-400">Product</th>
              <th className="p-1.5 border-r border-gray-400">SKU</th>
              <th className="p-1.5 border-r border-gray-400">Branch</th>
              <th className="p-1.5 border-r border-gray-400">Type</th>
              <th className="p-1.5 border-r border-gray-400">Reference</th>
              <th className="p-1.5 text-center border-r border-gray-400">Qty</th>
              <th className="p-1.5 text-right border-r border-gray-400">Value ({currency})</th>
              <th className="p-1.5">User</th>
            </tr>
          </thead>
          <tbody>
            {filteredRecords.map((r) => (
              <tr key={r.id} className="border-b border-gray-300">
                <td className="p-1.5 border-r border-gray-300">{r.dateTime}</td>
                <td className="p-1.5 font-medium border-r border-gray-300">{r.productName}</td>
                <td className="p-1.5 font-mono border-r border-gray-300">{r.sku}</td>
                <td className="p-1.5 border-r border-gray-300">{r.branch}</td>
                <td className="p-1.5 border-r border-gray-300">{r.adjustmentType}</td>
                <td className="p-1.5 font-mono border-r border-gray-300">{r.referenceNo}</td>
                <td className="p-1.5 text-center font-bold border-r border-gray-300">
                  {r.qtyChange > 0 ? `+${r.qtyChange}` : r.qtyChange}
                </td>
                <td className="p-1.5 text-right font-bold border-r border-gray-300">
                  {r.valueImpact.toFixed(2)}
                </td>
                <td className="p-1.5">{r.userName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
