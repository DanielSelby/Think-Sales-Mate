"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronRight,
  ChevronDown,
  Pencil,
  MoreVertical,
  Sliders,
  Truck,
  Plus,
  RefreshCw,
  Download,
  FileSpreadsheet,
  FileText,
  FileCode,
  ArrowUp,
  ArrowDown,
  GitFork,
  ShoppingBag,
  ShoppingCart,
  Layers,
  Search,
  Calendar,
  Barcode as BarcodeIcon,
  Copy,
  Check,
  Eye,
  Trash2,
  Package,
  Printer,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ProductDetailsData,
  StockMovement,
  formatLedgerMoney,
  exportMovementsToExcel,
  exportMovementsToCSV,
} from "@/lib/inventory/stock-ledger";
import { SourceDocumentModal } from "./source-document-modal";
import {
  QuickAdjustmentModal,
  QuickTransferModal,
  BarcodePrintModal,
  AuditTrailModal,
} from "./stock-action-modals";
import { ProductTabViews } from "./product-tab-views";
import { deleteProduct, toggleProductActive, duplicateProduct } from "@/app/(dashboard)/inventory/actions";

interface ProductDetailsViewProps {
  initialData: ProductDetailsData;
}

const TABS = [
  "Overview",
  "Transactions",
  "Stock Transfers",
  "Purchases",
  "Sales",
  "Adjustments",
  "Stock Levels",
  "Serial / Batch",
  "Documents",
] as const;

export function ProductDetailsView({ initialData }: ProductDetailsViewProps) {
  const router = useRouter();
  const [product, setProduct] = useState<ProductDetailsData>(initialData);
  const [activeTab, setActiveTab] = useState<string>("Transactions");

  // Filter states
  const [typeFilter, setTypeFilter] = useState<string>("All Types");
  const [branchFilter, setBranchFilter] = useState<string>("All Branches");
  const [referenceFilter, setReferenceFilter] = useState<string>("All References");
  const [dateRange, setDateRange] = useState<string>("May 1, 2025 - May 17, 2025");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Pagination states
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // UI Dropdown & Modals state
  const [showExportMenu, setShowExportMenu] = useState<boolean>(false);
  const [showActionsMenu, setShowActionsMenu] = useState<boolean>(false);
  const [rowMenuOpenId, setRowMenuOpenId] = useState<string | null>(null);
  const [selectedDocMovement, setSelectedDocMovement] = useState<StockMovement | null>(null);
  const [showAdjustModal, setShowAdjustModal] = useState<boolean>(false);
  const [showTransferModal, setShowTransferModal] = useState<boolean>(false);
  const [showBarcodeModal, setShowBarcodeModal] = useState<boolean>(false);
  const [showAuditModal, setShowAuditModal] = useState<boolean>(false);
  const [copiedSku, setCopiedSku] = useState<boolean>(false);

  const [isPending, startTransition] = useTransition();

  const currency = product.currency || "GHS";

  // Filter movements
  const filteredMovements = useMemo(() => {
    return product.movements.filter((m) => {
      // Type filter
      if (typeFilter !== "All Types") {
        if (typeFilter === "Purchase" && m.type !== "Purchase") return false;
        if (typeFilter === "Sale" && m.type !== "Sale") return false;
        if (typeFilter === "Stock Transfer" && !m.type.includes("Transfer")) return false;
        if (typeFilter === "Stock Adjustment" && m.type !== "Stock Adjustment") return false;
        if (typeFilter === "Return" && !m.type.includes("Return")) return false;
      }

      // Branch filter
      if (branchFilter !== "All Branches" && m.branchName !== branchFilter) {
        return false;
      }

      // Reference filter
      if (referenceFilter !== "All References" && m.referenceType !== referenceFilter) {
        return false;
      }

      // Search query (matches reference, user, or note)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesRef = m.referenceNo.toLowerCase().includes(q);
        const matchesUser = m.userName.toLowerCase().includes(q);
        const matchesBranch = m.branchName.toLowerCase().includes(q);
        if (!matchesRef && !matchesUser && !matchesBranch) return false;
      }

      return true;
    });
  }, [product.movements, typeFilter, branchFilter, referenceFilter, searchQuery]);

  // Paginated movements
  const totalEntries = filteredMovements.length;
  const totalPages = Math.max(1, Math.ceil(totalEntries / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedMovements = filteredMovements.slice(startIndex, startIndex + pageSize);

  const handleCopySku = () => {
    navigator.clipboard.writeText(product.sku);
    setCopiedSku(true);
    setTimeout(() => setCopiedSku(false), 2000);
  };

  const handleRefresh = () => {
    setTypeFilter("All Types");
    setBranchFilter("All Branches");
    setReferenceFilter("All References");
    setSearchQuery("");
    setCurrentPage(1);
    router.refresh();
  };

  const handleDuplicate = () => {
    setShowActionsMenu(false);
    startTransition(async () => {
      const res = await duplicateProduct(product.id);
      if (res?.error) {
        alert(res.error);
      } else {
        router.push("/inventory");
      }
    });
  };

  const handleToggleActive = () => {
    setShowActionsMenu(false);
    startTransition(async () => {
      const newActive = !product.isActive;
      const res = await toggleProductActive(product.id, newActive);
      if (res?.error) {
        alert(res.error);
      } else {
        setProduct((prev) => ({ ...prev, isActive: newActive }));
      }
    });
  };

  const handleDelete = () => {
    setShowActionsMenu(false);
    if (!confirm(`Are you sure you want to delete "${product.name}"? This action cannot be undone.`)) return;
    startTransition(async () => {
      const res = await deleteProduct(product.id);
      if (res?.error) {
        alert(res.error);
      } else {
        router.push("/inventory");
      }
    });
  };

  const handleAdjustmentSuccess = (newStock: { branchId: string; newQty: number }) => {
    setProduct((prev) => {
      const updatedBranches = prev.branches.map((b) =>
        b.id === newStock.branchId ? { ...b, quantity: newStock.newQty } : b
      );
      const totalQty = updatedBranches.reduce((sum, b) => sum + b.quantity, 0);
      return {
        ...prev,
        stockQuantity: totalQty,
        branches: updatedBranches,
        summary: {
          ...prev.summary,
          currentBalance: totalQty,
          stockValue: totalQty * prev.costPrice,
        },
      };
    });
  };

  const handleTransferSuccess = (fromBranchId: string, toBranchId: string, qty: number) => {
    setProduct((prev) => {
      const updatedBranches = prev.branches.map((b) => {
        if (b.id === fromBranchId) return { ...b, quantity: Math.max(0, b.quantity - qty) };
        if (b.id === toBranchId) return { ...b, quantity: b.quantity + qty };
        return b;
      });
      return {
        ...prev,
        branches: updatedBranches,
      };
    });
  };

  return (
    <div className="space-y-6">
      {/* ── Breadcrumb & Top Bar ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          {/* Breadcrumbs */}
          <nav className="flex items-center gap-1.5 text-xs text-ledger-400">
            <Link href="/inventory" className="hover:text-ink-900 dark:hover:text-white transition-colors">
              Inventory
            </Link>
            <ChevronRight className="h-3 w-3 opacity-60" />
            <Link href="/inventory" className="hover:text-ink-900 dark:hover:text-white transition-colors">
              Products
            </Link>
            <ChevronRight className="h-3 w-3 opacity-60" />
            <span className="font-medium text-ledger-600 dark:text-ledger-300">Product Details</span>
          </nav>

          {/* Title with Back Button */}
          <div className="mt-2 flex items-center gap-2.5">
            <button
              onClick={() => router.back()}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-ledger-200 bg-white text-ink-900 transition-colors hover:bg-ledger-50 dark:border-ledger-700 dark:bg-ink-900 dark:text-white dark:hover:bg-white/[0.06]"
              title="Go back"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <h1 className="font-display text-2xl font-bold text-ink-900 dark:text-white">
              Product Details
            </h1>
          </div>
        </div>
      </div>

      {/* ── Product Information Card + Current Stock Card ────────────── */}
      <div className="rounded-2xl border border-ledger-100 bg-white p-6 shadow-card dark:border-ledger-700 dark:bg-ink-900">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left: Product Thumbnail Image */}
          <div className="lg:col-span-2 flex flex-col items-center justify-start">
            <div className="relative flex h-36 w-36 items-center justify-center overflow-hidden rounded-2xl border border-ledger-200 bg-white p-2 shadow-xs dark:border-ledger-700 dark:bg-ink-950">
              {product.imageUrls && product.imageUrls.length > 0 ? (
                <Image
                  src={product.imageUrls[0]}
                  alt={product.name}
                  fill
                  className="object-contain p-2"
                  unoptimized
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center rounded-xl bg-ledger-50 text-ledger-400 dark:bg-white/[0.03]">
                  <Package className="h-12 w-12 stroke-[1.25]" />
                  <span className="mt-1 text-[10px] uppercase font-semibold">No Image</span>
                </div>
              )}
            </div>
          </div>

          {/* Middle: Product Metadata Grid */}
          <div className="lg:col-span-7 space-y-4">
            {/* Name + Status Badge */}
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-display text-xl font-bold text-ink-900 dark:text-white">
                {product.name}
              </h2>
              {product.isActive ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-ledger-100 px-2.5 py-0.5 text-xs font-semibold text-ledger-600 dark:bg-white/[0.08] dark:text-ledger-300">
                  Inactive
                </span>
              )}
            </div>

            {/* 2-Row Attribute Grid */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4 text-xs">
              {/* SKU */}
              <div>
                <span className="text-ledger-400">SKU</span>
                <div className="mt-0.5 flex items-center gap-1 font-mono font-medium text-ink-900 dark:text-white">
                  <span>{product.sku}</span>
                  <button
                    onClick={handleCopySku}
                    className="text-ledger-400 hover:text-ink-900 dark:hover:text-white"
                    title="Copy SKU"
                  >
                    {copiedSku ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
              </div>

              {/* Barcode */}
              <div>
                <span className="text-ledger-400">Barcode</span>
                <div className="mt-0.5 flex items-center gap-1 font-mono font-medium text-ink-900 dark:text-white">
                  <span>{product.barcode || "8806094721234"}</span>
                  <button
                    onClick={() => setShowBarcodeModal(true)}
                    className="text-blue-600 hover:text-blue-700 dark:text-blue-400"
                    title="Print Barcode"
                  >
                    <BarcodeIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Category */}
              <div>
                <span className="text-ledger-400">Category</span>
                <p className="mt-0.5 font-medium text-ink-900 dark:text-white">
                  {product.category || "Smartphones"}
                </p>
              </div>

              {/* Brand */}
              <div>
                <span className="text-ledger-400">Brand</span>
                <p className="mt-0.5 font-medium text-ink-900 dark:text-white">
                  {product.brand || "Samsung"}
                </p>
              </div>

              {/* Unit */}
              <div>
                <span className="text-ledger-400">Unit</span>
                <p className="mt-0.5 font-medium text-ink-900 dark:text-white">
                  {product.unit || "Piece"}
                </p>
              </div>

              {/* Cost Price */}
              <div>
                <span className="text-ledger-400">Cost Price ({currency})</span>
                <p className="mt-0.5 font-semibold text-ink-900 dark:text-white">
                  {formatLedgerMoney(product.costPrice, currency)}
                </p>
              </div>

              {/* Selling Price */}
              <div>
                <span className="text-ledger-400">Selling Price ({currency})</span>
                <p className="mt-0.5 font-semibold text-ink-900 dark:text-white">
                  {formatLedgerMoney(product.sellingPrice, currency)}
                </p>
              </div>

              {/* Tax Rate */}
              <div>
                <span className="text-ledger-400">Tax Rate</span>
                <p className="mt-0.5 font-medium text-ink-900 dark:text-white">
                  {product.taxRate}%
                </p>
              </div>

              {/* Created On */}
              <div className="sm:col-span-2">
                <span className="text-ledger-400">Created On</span>
                <p className="mt-0.5 font-medium text-ink-900 dark:text-white">
                  {new Date(product.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}{" "}
                  {new Date(product.createdAt).toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>

              {/* Description */}
              <div className="sm:col-span-2">
                <span className="text-ledger-400">Description</span>
                <p className="mt-0.5 truncate font-medium text-ink-900 dark:text-white">
                  {product.description || `${product.name} High Performance Device`}
                </p>
              </div>
            </div>
          </div>

          {/* Right: Actions & Current Stock Summary Box */}
          <div className="lg:col-span-3 flex flex-col justify-between border-t border-ledger-100 pt-4 lg:border-t-0 lg:border-l lg:pl-6 lg:pt-0 dark:border-ledger-700">
            {/* Action Buttons Top */}
            <div className="flex items-center justify-end gap-2">
              <Link href={`/inventory/${product.id}/edit`}>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 rounded-xl border-ledger-200 text-xs font-semibold text-ink-900 hover:bg-ledger-50 dark:border-ledger-700 dark:text-white dark:hover:bg-white/[0.06]"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit Product
                </Button>
              </Link>

              <div className="relative">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowActionsMenu(!showActionsMenu)}
                  className="h-9 gap-1 rounded-xl border-ledger-200 text-xs font-semibold text-ink-900 hover:bg-ledger-50 dark:border-ledger-700 dark:text-white dark:hover:bg-white/[0.06]"
                >
                  Actions
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>

                {showActionsMenu && (
                  <div className="absolute right-0 top-10 z-30 w-52 rounded-xl border border-ledger-100 bg-white py-1.5 shadow-xl dark:border-ledger-700 dark:bg-ink-900">
                    <Link
                      href={`/inventory/${product.id}/edit`}
                      className="flex items-center gap-2.5 px-3.5 py-2 text-xs text-ledger-600 hover:bg-ledger-50 dark:text-ledger-300 dark:hover:bg-white/[0.06]"
                      onClick={() => setShowActionsMenu(false)}
                    >
                      <Pencil className="h-3.5 w-3.5 text-ledger-400" />
                      Edit Product Details
                    </Link>
                    <button
                      onClick={handleDuplicate}
                      className="flex w-full items-center gap-2.5 px-3.5 py-2 text-xs text-ledger-600 hover:bg-ledger-50 dark:text-ledger-300 dark:hover:bg-white/[0.06]"
                    >
                      <Copy className="h-3.5 w-3.5 text-ledger-400" />
                      Duplicate Product
                    </button>
                    <button
                      onClick={() => {
                        setShowActionsMenu(false);
                        setShowAdjustModal(true);
                      }}
                      className="flex w-full items-center gap-2.5 px-3.5 py-2 text-xs text-ledger-600 hover:bg-ledger-50 dark:text-ledger-300 dark:hover:bg-white/[0.06]"
                    >
                      <Sliders className="h-3.5 w-3.5 text-amber-500" />
                      Stock Adjustment
                    </button>
                    <button
                      onClick={() => {
                        setShowActionsMenu(false);
                        setShowTransferModal(true);
                      }}
                      className="flex w-full items-center gap-2.5 px-3.5 py-2 text-xs text-ledger-600 hover:bg-ledger-50 dark:text-ledger-300 dark:hover:bg-white/[0.06]"
                    >
                      <Truck className="h-3.5 w-3.5 text-blue-500" />
                      Stock Transfer
                    </button>
                    <button
                      onClick={() => {
                        setShowActionsMenu(false);
                        setShowBarcodeModal(true);
                      }}
                      className="flex w-full items-center gap-2.5 px-3.5 py-2 text-xs text-ledger-600 hover:bg-ledger-50 dark:text-ledger-300 dark:hover:bg-white/[0.06]"
                    >
                      <BarcodeIcon className="h-3.5 w-3.5 text-purple-500" />
                      Print Barcode Label
                    </button>
                    <button
                      onClick={() => {
                        setShowActionsMenu(false);
                        setShowAuditModal(true);
                      }}
                      className="flex w-full items-center gap-2.5 px-3.5 py-2 text-xs text-ledger-600 hover:bg-ledger-50 dark:text-ledger-300 dark:hover:bg-white/[0.06]"
                    >
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                      Security Audit Trail
                    </button>
                    <div className="my-1 border-t border-ledger-100 dark:border-ledger-700" />
                    <button
                      onClick={handleToggleActive}
                      className="flex w-full items-center gap-2.5 px-3.5 py-2 text-xs text-ledger-600 hover:bg-ledger-50 dark:text-ledger-300 dark:hover:bg-white/[0.06]"
                    >
                      {product.isActive ? <Eye className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      {product.isActive ? "Deactivate Product" : "Activate Product"}
                    </button>
                    <button
                      onClick={handleDelete}
                      className="flex w-full items-center gap-2.5 px-3.5 py-2 text-xs text-alert hover:bg-alert-soft"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete Product
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Current Stock Card (Box matching screenshot) */}
            <div className="mt-4 rounded-xl bg-ledger-50/70 p-4 dark:bg-white/[0.03]">
              <span className="text-xs font-semibold text-ledger-500 dark:text-ledger-400">
                Current Stock
              </span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-display text-3xl font-bold text-blue-600 dark:text-blue-400">
                  {product.stockQuantity}
                </span>
              </div>
              <p className="text-xs text-ledger-400">
                Across {product.branches.length} branches
              </p>

              <div className="my-3 border-t border-ledger-200/70 dark:border-ledger-700/60" />

              <span className="text-xs font-semibold text-ledger-500 dark:text-ledger-400">
                Stock Value ({currency})
              </span>
              <p className="mt-1 font-display text-lg font-bold text-blue-700 dark:text-blue-300">
                {formatLedgerMoney(product.summary.stockValue, currency)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Navigation Tabs ─────────────────────────────────────────────── */}
      <div className="border-b border-ledger-200 dark:border-ledger-700">
        <nav className="flex space-x-6 overflow-x-auto text-sm font-medium">
          {TABS.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`relative whitespace-nowrap pb-3 transition-colors ${
                  isActive
                    ? "font-semibold text-blue-600 dark:text-blue-400"
                    : "text-ledger-500 hover:text-ink-900 dark:text-ledger-400 dark:hover:text-white"
                }`}
              >
                {tab}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-blue-600 dark:bg-blue-400" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ── Transactions Tab View (Primary View from Image) ─────────────── */}
      {activeTab === "Transactions" ? (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* 1. Transaction Filters Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              {/* Transaction Type */}
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-ledger-400">
                  Transaction Type
                </label>
                <select
                  value={typeFilter}
                  onChange={(e) => {
                    setTypeFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="h-9 rounded-xl border border-ledger-200 bg-white px-3 text-xs font-medium text-ink-900 shadow-xs focus:border-blue-600 focus:outline-hidden dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                >
                  <option value="All Types">All Types</option>
                  <option value="Purchase">Purchase</option>
                  <option value="Sale">Sale</option>
                  <option value="Stock Transfer">Stock Transfer</option>
                  <option value="Stock Adjustment">Stock Adjustment</option>
                  <option value="Return">Return / Sales Return</option>
                </select>
              </div>

              {/* Branch / Warehouse */}
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-ledger-400">
                  Branch / Warehouse
                </label>
                <select
                  value={branchFilter}
                  onChange={(e) => {
                    setBranchFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="h-9 rounded-xl border border-ledger-200 bg-white px-3 text-xs font-medium text-ink-900 shadow-xs focus:border-blue-600 focus:outline-hidden dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                >
                  <option value="All Branches">All Branches</option>
                  {product.branches.map((b) => (
                    <option key={b.id} value={b.name}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Reference Type */}
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-ledger-400">
                  Reference Type
                </label>
                <select
                  value={referenceFilter}
                  onChange={(e) => {
                    setReferenceFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="h-9 rounded-xl border border-ledger-200 bg-white px-3 text-xs font-medium text-ink-900 shadow-xs focus:border-blue-600 focus:outline-hidden dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                >
                  <option value="All References">All References</option>
                  <option value="Invoice">Invoice</option>
                  <option value="Purchase Order">Purchase Order</option>
                  <option value="Stock Transfer">Stock Transfer</option>
                  <option value="Stock Adjustment">Stock Adjustment</option>
                  <option value="Sales Return">Sales Return</option>
                </select>
              </div>

              {/* Date Range Selector */}
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-ledger-400">
                  Date Range
                </label>
                <div className="flex h-9 items-center gap-2 rounded-xl border border-ledger-200 bg-white px-3 text-xs font-medium text-ink-900 shadow-xs dark:border-ledger-700 dark:bg-ink-900 dark:text-white">
                  <Calendar className="h-3.5 w-3.5 text-ledger-400" />
                  <span>{dateRange}</span>
                </div>
              </div>
            </div>

            {/* Export & Refresh Actions */}
            <div className="flex items-center gap-2 pt-4 sm:pt-0">
              <div className="relative">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  className="h-9 gap-1.5 rounded-xl border-ledger-200 text-xs font-semibold text-ink-900 hover:bg-ledger-50 dark:border-ledger-700 dark:text-white dark:hover:bg-white/[0.06]"
                >
                  <Download className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  Export
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                </Button>

                {showExportMenu && (
                  <div className="absolute right-0 top-10 z-30 w-44 rounded-xl border border-ledger-100 bg-white py-1.5 shadow-xl dark:border-ledger-700 dark:bg-ink-900">
                    <button
                      onClick={() => {
                        setShowExportMenu(false);
                        exportMovementsToExcel(product, filteredMovements);
                      }}
                      className="flex w-full items-center gap-2 px-3.5 py-2 text-xs text-ledger-600 hover:bg-ledger-50 dark:text-ledger-300 dark:hover:bg-white/[0.06]"
                    >
                      <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                      Export to Excel (.xlsx)
                    </button>
                    <button
                      onClick={() => {
                        setShowExportMenu(false);
                        exportMovementsToCSV(product, filteredMovements);
                      }}
                      className="flex w-full items-center gap-2 px-3.5 py-2 text-xs text-ledger-600 hover:bg-ledger-50 dark:text-ledger-300 dark:hover:bg-white/[0.06]"
                    >
                      <FileCode className="h-4 w-4 text-blue-600" />
                      Export to CSV (.csv)
                    </button>
                    <button
                      onClick={() => {
                        setShowExportMenu(false);
                        window.print();
                      }}
                      className="flex w-full items-center gap-2 px-3.5 py-2 text-xs text-ledger-600 hover:bg-ledger-50 dark:text-ledger-300 dark:hover:bg-white/[0.06]"
                    >
                      <FileText className="h-4 w-4 text-red-600" />
                      Print Statement (.pdf)
                    </button>
                  </div>
                )}
              </div>

              <button
                onClick={handleRefresh}
                title="Refresh Ledger"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-ledger-200 bg-white text-ledger-500 hover:bg-ledger-50 hover:text-ink-900 dark:border-ledger-700 dark:bg-ink-900 dark:text-ledger-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* 2. Inventory Analytics Cards (6 cards matching image) */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {/* 1. Total In */}
            <div className="flex items-center gap-3 rounded-2xl border border-ledger-100 bg-white p-3.5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                <ArrowUp className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-medium text-ledger-400">Total In</span>
                <p className="font-display text-base font-bold text-ink-900 dark:text-white">
                  {product.analytics.totalInQty} <span className="text-xs font-normal text-ledger-400">Qty</span>
                </p>
              </div>
            </div>

            {/* 2. Total Out */}
            <div className="flex items-center gap-3 rounded-2xl border border-ledger-100 bg-white p-3.5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400">
                <ArrowDown className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-medium text-ledger-400">Total Out</span>
                <p className="font-display text-base font-bold text-ink-900 dark:text-white">
                  {product.analytics.totalOutQty} <span className="text-xs font-normal text-ledger-400">Qty</span>
                </p>
              </div>
            </div>

            {/* 3. Net Movement */}
            <div className="flex items-center gap-3 rounded-2xl border border-ledger-100 bg-white p-3.5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                <GitFork className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-medium text-ledger-400">Net Movement</span>
                <p className="font-display text-base font-bold text-ink-900 dark:text-white">
                  +{product.analytics.netMovement} <span className="text-xs font-normal text-ledger-400">Qty</span>
                </p>
              </div>
            </div>

            {/* 4. Total Purchases */}
            <div className="flex items-center gap-3 rounded-2xl border border-ledger-100 bg-white p-3.5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400">
                <ShoppingBag className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-medium text-ledger-400">Total Purchases</span>
                <p className="font-display text-base font-bold text-ink-900 dark:text-white">
                  {product.analytics.totalPurchasesQty} <span className="text-xs font-normal text-ledger-400">Qty</span>
                </p>
              </div>
            </div>

            {/* 5. Total Sales */}
            <div className="flex items-center gap-3 rounded-2xl border border-ledger-100 bg-white p-3.5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400">
                <ShoppingCart className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-medium text-ledger-400">Total Sales</span>
                <p className="font-display text-base font-bold text-ink-900 dark:text-white">
                  {product.analytics.totalSalesQty} <span className="text-xs font-normal text-ledger-400">Qty</span>
                </p>
              </div>
            </div>

            {/* 6. Total Adjustments */}
            <div className="flex items-center gap-3 rounded-2xl border border-ledger-100 bg-white p-3.5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
                <Layers className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-medium text-ledger-400">Total Adjustments</span>
                <p className="font-display text-base font-bold text-ink-900 dark:text-white">
                  {product.analytics.totalAdjustmentsQty} <span className="text-xs font-normal text-ledger-400">Qty</span>
                </p>
              </div>
            </div>
          </div>

          {/* 3. Main Grid (9 Columns Table + 3 Columns Sidebar) */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
            {/* ── Movement History Table (Left 9 cols) ── */}
            <div className="lg:col-span-9 space-y-4">
              <div className="overflow-hidden rounded-2xl border border-ledger-100 bg-white shadow-card dark:border-ledger-700 dark:bg-ink-900">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-ledger-100 bg-white text-[11px] font-semibold text-ink-900 dark:border-ledger-700 dark:bg-ink-900 dark:text-white">
                      <tr>
                        <th className="px-3 py-3 min-w-[110px] whitespace-nowrap">Date & Time</th>
                        <th className="px-2 py-3 min-w-[110px] whitespace-nowrap">Type</th>
                        <th className="px-3 py-3 min-w-[130px] whitespace-nowrap">Reference No.</th>
                        <th className="px-3 py-3 min-w-[130px] whitespace-nowrap">Reference Type</th>
                        <th className="px-3 py-3 min-w-[150px] whitespace-nowrap">Branch / Warehouse</th>
                        <th className="px-2 py-3 min-w-[80px] text-center whitespace-nowrap">In Qty</th>
                        <th className="px-2 py-3 min-w-[80px] text-center whitespace-nowrap">Out Qty</th>
                        <th className="px-2 py-3 min-w-[80px] text-center whitespace-nowrap">Balance</th>
                        <th className="px-3 py-3 min-w-[130px] text-right whitespace-nowrap">Unit Cost ({currency})</th>
                        <th className="px-3 py-3 min-w-[140px] text-right whitespace-nowrap">Total Value ({currency})</th>
                        <th className="px-3 py-3 min-w-[110px] whitespace-nowrap">User</th>
                        <th className="px-2 py-3 min-w-[50px] text-right whitespace-nowrap"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ledger-100 dark:divide-ledger-700/50">
                      {paginatedMovements.length === 0 ? (
                        <tr>
                          <td colSpan={12} className="px-4 py-8 text-center text-ledger-400">
                            No stock movement records match the selected filters.
                          </td>
                        </tr>
                      ) : (
                        paginatedMovements.map((m) => {
                          const isSale = m.type === "Sale";
                          const isPurchase = m.type === "Purchase";
                          const isTransfer = m.type.includes("Transfer");
                          const isAdjustment = m.type === "Stock Adjustment";
                          const isReturn = m.type.includes("Return");

                          return (
                            <tr
                              key={m.id}
                              className="transition-colors hover:bg-ledger-50/50 dark:hover:bg-white/[0.02]"
                            >
                              {/* Date & Time */}
                              <td className="px-3 py-3 whitespace-nowrap">
                                <span className="font-medium text-ink-900 dark:text-white">{m.dateFormatted}</span>
                                <span className="block text-[10px] text-ledger-400">{m.timeFormatted}</span>
                              </td>

                              {/* Type Badge */}
                              <td className="px-2 py-3 whitespace-nowrap">
                                {isSale && (
                                  <span className="inline-flex rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600 dark:bg-red-950/40 dark:text-red-400">
                                    Sale
                                  </span>
                                )}
                                {isPurchase && (
                                  <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                                    Purchase
                                  </span>
                                )}
                                {isTransfer && (
                                  <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">
                                    Stock Transfer
                                  </span>
                                )}
                                {isAdjustment && (
                                  <div>
                                    <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                                      Adjustment
                                    </span>
                                    {m.subTypeNote && (
                                      <span className="block text-[10px] text-ledger-400">
                                        {m.subTypeNote}
                                      </span>
                                    )}
                                  </div>
                                )}
                                {isReturn && (
                                  <span className="inline-flex rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-700 dark:bg-orange-950/40 dark:text-orange-400">
                                    Return
                                  </span>
                                )}
                                {!isSale && !isPurchase && !isTransfer && !isAdjustment && !isReturn && (
                                  <span className="inline-flex rounded-full bg-ledger-100 px-2 py-0.5 text-[11px] font-semibold text-ledger-600 dark:bg-white/[0.08] dark:text-ledger-300">
                                    {m.type}
                                  </span>
                                )}
                              </td>

                              {/* Reference No */}
                              <td className="px-3 py-3 whitespace-nowrap">
                                <button
                                  onClick={() => setSelectedDocMovement(m)}
                                  className="font-mono text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
                                >
                                  {m.referenceNo}
                                </button>
                              </td>

                              {/* Reference Type */}
                              <td className="px-3 py-3 text-ledger-600 dark:text-ledger-300 whitespace-nowrap">
                                {m.referenceType}
                              </td>

                              {/* Branch / Warehouse */}
                              <td className="px-3 py-3 font-medium text-ink-900 dark:text-white whitespace-nowrap">
                                {m.branchName}
                              </td>

                              {/* In Qty */}
                              <td className="px-2 py-3 text-center font-bold text-ink-900 dark:text-white">
                                {m.inQty !== null ? m.inQty : "-"}
                              </td>

                              {/* Out Qty */}
                              <td className="px-2 py-3 text-center font-bold text-ink-900 dark:text-white">
                                {m.outQty !== null ? m.outQty : "-"}
                              </td>

                              {/* Balance */}
                              <td className="px-2 py-3 text-center font-bold text-ink-900 dark:text-white">
                                {m.runningBalance}
                              </td>

                              {/* Unit Cost */}
                              <td className="px-3 py-3 text-right font-medium text-ledger-600 dark:text-ledger-300 whitespace-nowrap">
                                {formatLedgerMoney(m.unitCost, currency)}
                              </td>

                              {/* Total Value */}
                              <td className="px-3 py-3 text-right font-semibold text-ink-900 dark:text-white whitespace-nowrap">
                                {formatLedgerMoney(m.totalValue, currency)}
                              </td>

                              {/* User */}
                              <td className="px-3 py-3 text-ledger-600 dark:text-ledger-300 whitespace-nowrap">
                                {m.userName}
                              </td>

                              {/* Actions Menu */}
                              <td className="px-2 py-3 text-right whitespace-nowrap">
                                <div className="relative inline-block text-left">
                                  <button
                                    onClick={() => setRowMenuOpenId(rowMenuOpenId === m.id ? null : m.id)}
                                    className="rounded-lg p-1 text-ledger-400 hover:bg-ledger-100 hover:text-ink-900 dark:hover:bg-white/[0.06] dark:hover:text-white"
                                  >
                                    <MoreVertical className="h-3.5 w-3.5" />
                                  </button>

                                  {rowMenuOpenId === m.id && (
                                    <div className="absolute right-0 top-6 z-20 w-44 rounded-xl border border-ledger-100 bg-white py-1 shadow-lg dark:border-ledger-700 dark:bg-ink-900">
                                      <button
                                        onClick={() => {
                                          setRowMenuOpenId(null);
                                          setSelectedDocMovement(m);
                                        }}
                                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ledger-600 hover:bg-ledger-50 dark:text-ledger-300 dark:hover:bg-white/[0.06]"
                                      >
                                        <Eye className="h-3.5 w-3.5" />
                                        View Document
                                      </button>
                                      <button
                                        onClick={() => {
                                          setRowMenuOpenId(null);
                                          setSelectedDocMovement(m);
                                          setTimeout(() => window.print(), 200);
                                        }}
                                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ledger-600 hover:bg-ledger-50 dark:text-ledger-300 dark:hover:bg-white/[0.06]"
                                      >
                                        <Printer className="h-3.5 w-3.5" />
                                        Print Voucher
                                      </button>
                                      <button
                                        onClick={() => {
                                          setRowMenuOpenId(null);
                                          setShowAuditModal(true);
                                        }}
                                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ledger-600 hover:bg-ledger-50 dark:text-ledger-300 dark:hover:bg-white/[0.06]"
                                      >
                                        <ShieldCheck className="h-3.5 w-3.5" />
                                        Audit History
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Table Footer & Pagination */}
                <div className="flex flex-wrap items-center justify-between gap-4 border-t border-ledger-100 px-4 py-3 text-xs text-ledger-500 dark:border-ledger-700">
                  <div>
                    Showing{" "}
                    <span className="font-semibold text-ink-900 dark:text-white">
                      {totalEntries === 0 ? 0 : startIndex + 1}
                    </span>{" "}
                    to{" "}
                    <span className="font-semibold text-ink-900 dark:text-white">
                      {Math.min(startIndex + pageSize, totalEntries)}
                    </span>{" "}
                    of{" "}
                    <span className="font-semibold text-ink-900 dark:text-white">{totalEntries}</span>{" "}
                    entries
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <select
                        value={pageSize}
                        onChange={(e) => {
                          setPageSize(Number(e.target.value));
                          setCurrentPage(1);
                        }}
                        className="rounded-lg border border-ledger-200 bg-white px-2 py-1 text-xs text-ink-900 focus:border-blue-600 focus:outline-hidden dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                      >
                        <option value={5}>5 per page</option>
                        <option value={10}>10 per page</option>
                        <option value={20}>20 per page</option>
                        <option value={50}>50 per page</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-ledger-200 bg-white text-xs text-ledger-600 disabled:opacity-40 hover:bg-ledger-50 dark:border-ledger-700 dark:bg-ink-900 dark:text-ledger-300"
                      >
                        &lt;
                      </button>
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                        <button
                          key={p}
                          onClick={() => setCurrentPage(p)}
                          className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-semibold ${
                            currentPage === p
                              ? "bg-blue-600 text-white"
                              : "border border-ledger-200 bg-white text-ledger-600 hover:bg-ledger-50 dark:border-ledger-700 dark:bg-ink-900 dark:text-ledger-300"
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                      <button
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-ledger-200 bg-white text-xs text-ledger-600 disabled:opacity-40 hover:bg-ledger-50 dark:border-ledger-700 dark:bg-ink-900 dark:text-ledger-300"
                      >
                        &gt;
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Right Sidebar (3 cols matching screenshot) ── */}
            <div className="lg:col-span-3 space-y-6">
              {/* 1. Stock Summary */}
              <div className="rounded-2xl border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
                <h3 className="font-display font-bold text-sm text-ink-900 dark:text-white">
                  Stock Summary
                </h3>
                <div className="mt-3 space-y-2.5 text-xs">
                  <div className="flex justify-between text-ledger-500">
                    <span>Opening Balance</span>
                    <span className="font-semibold text-ink-900 dark:text-white">
                      {product.summary.openingBalance}
                    </span>
                  </div>
                  <div className="flex justify-between text-ledger-500">
                    <span>Total In</span>
                    <span className="font-semibold text-ink-900 dark:text-white">
                      {product.summary.totalIn}
                    </span>
                  </div>
                  <div className="flex justify-between text-ledger-500">
                    <span>Total Out</span>
                    <span className="font-semibold text-ink-900 dark:text-white">
                      {product.summary.totalOut}
                    </span>
                  </div>
                  <div className="flex justify-between text-ledger-500">
                    <span>Current Balance</span>
                    <span className="font-bold text-blue-600 dark:text-blue-400">
                      {product.summary.currentBalance}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-ledger-100 pt-2 text-ledger-500 dark:border-ledger-700">
                    <span>Stock Value ({currency})</span>
                    <span className="font-bold text-ink-900 dark:text-white">
                      {formatLedgerMoney(product.summary.stockValue, currency)}
                    </span>
                  </div>
                </div>
              </div>

              {/* 2. Stock by Branch */}
              <div className="rounded-2xl border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
                <h3 className="font-display font-bold text-sm text-ink-900 dark:text-white">
                  Stock by Branch
                </h3>
                <div className="mt-3 space-y-2.5 text-xs">
                  {product.branches.map((b) => (
                    <div key={b.id} className="flex items-center justify-between">
                      <span className="text-ledger-600 dark:text-ledger-300">{b.name}</span>
                      <span className="font-bold text-blue-600 dark:text-blue-400">{b.quantity}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 3. Quick Actions */}
              <div className="rounded-2xl border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
                <h3 className="font-display font-bold text-sm text-ink-900 dark:text-white">
                  Quick Actions
                </h3>
                <div className="mt-3 space-y-1.5 text-xs">
                  <Link
                    href={`/pos`}
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-ledger-600 transition-colors hover:bg-ledger-50 dark:text-ledger-300 dark:hover:bg-white/[0.04]"
                  >
                    <ShoppingCart className="h-4 w-4 text-emerald-500" />
                    <span className="font-medium">New Sale</span>
                  </Link>

                  <Link
                    href={`/purchases/new?product_id=${product.id}`}
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-ledger-600 transition-colors hover:bg-ledger-50 dark:text-ledger-300 dark:hover:bg-white/[0.04]"
                  >
                    <ShoppingBag className="h-4 w-4 text-purple-500" />
                    <span className="font-medium">New Purchase</span>
                  </Link>

                  <button
                    onClick={() => setShowAdjustModal(true)}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-ledger-600 transition-colors hover:bg-ledger-50 dark:text-ledger-300 dark:hover:bg-white/[0.04]"
                  >
                    <Sliders className="h-4 w-4 text-amber-500" />
                    <span className="font-medium">Stock Adjustment</span>
                  </button>

                  <button
                    onClick={() => setShowTransferModal(true)}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-ledger-600 transition-colors hover:bg-ledger-50 dark:text-ledger-300 dark:hover:bg-white/[0.04]"
                  >
                    <Truck className="h-4 w-4 text-blue-500" />
                    <span className="font-medium">Stock Transfer</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ── Other Tabs Content View ─────────────────────────────────── */
        <ProductTabViews
          activeTab={activeTab}
          product={product}
          movements={product.movements}
          onOpenDocModal={(m) => setSelectedDocMovement(m)}
          onOpenAdjustModal={() => setShowAdjustModal(true)}
          onOpenTransferModal={() => setShowTransferModal(true)}
        />
      )}

      {/* ── Dialogs & Modals ────────────────────────────────────────────── */}
      <SourceDocumentModal
        movement={selectedDocMovement}
        productName={product.name}
        sku={product.sku}
        currency={currency}
        onClose={() => setSelectedDocMovement(null)}
      />

      <QuickAdjustmentModal
        productId={product.id}
        productName={product.name}
        sku={product.sku}
        costPrice={product.costPrice}
        branches={product.branches}
        isOpen={showAdjustModal}
        onClose={() => setShowAdjustModal(false)}
        onSuccess={handleAdjustmentSuccess}
      />

      <QuickTransferModal
        productId={product.id}
        productName={product.name}
        sku={product.sku}
        branches={product.branches}
        isOpen={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        onSuccess={handleTransferSuccess}
      />

      <BarcodePrintModal
        productName={product.name}
        sku={product.sku}
        barcode={product.barcode || "8806094721234"}
        price={product.sellingPrice}
        currency={currency}
        isOpen={showBarcodeModal}
        onClose={() => setShowBarcodeModal(false)}
      />

      <AuditTrailModal
        productName={product.name}
        sku={product.sku}
        isOpen={showAuditModal}
        onClose={() => setShowAuditModal(false)}
      />
    </div>
  );
}