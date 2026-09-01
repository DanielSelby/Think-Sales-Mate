"use client";

import { useState, useMemo, useRef, useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  Plus,
  Trash2,
  ArrowRight,
  ArrowLeftRight,
  Building2,
  Store,
  Truck,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Clock,
  User as UserIcon,
  UploadCloud,
  FileSpreadsheet,
  Printer,
  Barcode,
  Layers,
  X,
  Check,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Send,
  PackageCheck,
  PackageX,
  History,
  Package,
  Edit3,
  Bell,
  MessageSquare,
  CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { createStockTransfer, updateTransferStatus, deleteTransfer } from "@/app/(dashboard)/inventory/transfers/actions";
import type { TransferStatus, LocationType } from "@/types/database";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TransferLocation {
  id: string;
  name: string;
  type: LocationType;
}

export interface TransferableProduct {
  id: string;
  sku: string;
  name: string;
  unitCost: number;
  category?: string | null;
  barcode?: string | null;
  imageUrl?: string | null;
}

export interface StockLevel {
  productId: string;
  locationId: string;
  quantity: number;
}

export interface TransferItemRow {
  id: string;
  productId: string;
  name: string;
  sku: string;
  barcode?: string | null;
  category?: string | null;
  imageUrl?: string | null;
  sourceQtyOnHand: number;
  destinationQtyOnHand: number;
  transferQty: number;
  unitCost: number;
  unit: string;
  batchNumber?: string;
  expiryDate?: string;
  remarks?: string;
}

export interface RecentTransferSummary {
  id: string;
  label: string;
  fromName: string;
  toName: string;
  status: TransferStatus;
}

export interface StockTransferFormProps {
  locations?: TransferLocation[];
  products?: TransferableProduct[];
  stockLevels?: StockLevel[];
  recentTransfers?: RecentTransferSummary[];
  currentUserEmail?: string;
  currentUserName?: string;
  currentUserRole?: string;
  currency?: string;
}

export function StockTransferForm({
  locations = [],
  products = [],
  stockLevels = [],
  recentTransfers = [],
  currentUserEmail = "admin@erp.local",
  currentUserName = "Administrator",
  currentUserRole = "Administrator",
  currency = "GHS",
}: StockTransferFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Navigation tab: "new"
  const [activeTab, setActiveTab] = useState<string>("new");

  // Toggle show/hide for Create Stock Transfer parameters section
  const [showConfigSection, setShowConfigSection] = useState(true);

  // ── Form State ──────────────────────────────────────────────────────────
  const [transferNumber, setTransferNumber] = useState(
    `STF-${new Date().toISOString().slice(2, 4)}${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(
      Math.floor(Math.random() * 9000) + 1000
    )}`
  );
  const [transferDate, setTransferDate] = useState(new Date().toISOString().slice(0, 10));
  const [expectedDate, setExpectedDate] = useState(
    new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );
  const [priority, setPriority] = useState<"Normal" | "Low" | "High" | "Urgent">("Normal");
  const [referenceNotes, setReferenceNotes] = useState("");
  const [transferReason, setTransferReason] = useState("Routine stock replenishment");

  // Source & Destination locations
  const [fromLocationId, setFromLocationId] = useState(locations[0]?.id ?? "");
  const [toLocationId, setToLocationId] = useState(locations[1]?.id ?? locations[0]?.id ?? "");
  const [fromSubLocation, setFromSubLocation] = useState("Main Storage");
  const [toSubLocation, setToSubLocation] = useState("Receiving Bay");

  // REAL Items State — starts empty!
  const [items, setItems] = useState<TransferItemRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [selectedItemForDetail, setSelectedItemForDetail] = useState<TransferItemRow | null>(null);

  // Attachments State
  const [attachments, setAttachments] = useState<{ name: string; size: string; type: string }[]>([]);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  // Modals & Feedback
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [showLookupModal, setShowLookupModal] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [showTimelineModal, setShowTimelineModal] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowProductDropdown(false);
      }
      if (notificationRef.current && !notificationRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ── REAL Stock Level Lookup directly from database props ─────────────────
  const getStockQty = (productId: string, locationId: string): number => {
    const match = stockLevels.find((s) => s.productId === productId && s.locationId === locationId);
    return match?.quantity ?? 0;
  };

  // Swap Source and Destination
  const handleSwapLocations = () => {
    const tempLoc = fromLocationId;
    const tempSub = fromSubLocation;
    setFromLocationId(toLocationId);
    setFromSubLocation(toSubLocation);
    setToLocationId(tempLoc);
    setToSubLocation(tempSub);

    // Refresh real stock levels for all items in table
    setItems((prev) =>
      prev.map((item) => {
        const newSrc = getStockQty(item.productId, toLocationId);
        const newDest = getStockQty(item.productId, tempLoc);
        return {
          ...item,
          sourceQtyOnHand: newSrc,
          destinationQtyOnHand: newDest,
          transferQty: Math.min(item.transferQty, newSrc > 0 ? newSrc : 1),
        };
      })
    );
  };

  // Location change handlers
  const handleSourceLocationChange = (newFromId: string) => {
    setFromLocationId(newFromId);
    setItems((prev) =>
      prev.map((item) => {
        const newSrc = getStockQty(item.productId, newFromId);
        return {
          ...item,
          sourceQtyOnHand: newSrc,
          transferQty: Math.min(item.transferQty, newSrc > 0 ? newSrc : 1),
        };
      })
    );
  };

  const handleDestinationLocationChange = (newToId: string) => {
    setToLocationId(newToId);
    setItems((prev) =>
      prev.map((item) => {
        const newDest = getStockQty(item.productId, newToId);
        return {
          ...item,
          destinationQtyOnHand: newDest,
        };
      })
    );
  };

  // Autocomplete products filter
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.barcode && p.barcode.toLowerCase().includes(q))
    );
  }, [products, searchQuery]);

  // Add real product to transfer list
  const handleAddProduct = (product: TransferableProduct) => {
    const existingIndex = items.findIndex((i) => i.productId === product.id);
    if (existingIndex >= 0) {
      setItems((prev) =>
        prev.map((item, idx) =>
          idx === existingIndex
            ? {
                ...item,
                transferQty: Math.min(item.sourceQtyOnHand, item.transferQty + 1),
              }
            : item
        )
      );
    } else {
      const srcQty = getStockQty(product.id, fromLocationId);
      const destQty = getStockQty(product.id, toLocationId);
      const newItem: TransferItemRow = {
        id: `row-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        productId: product.id,
        name: product.name,
        sku: product.sku,
        barcode: product.barcode,
        category: product.category,
        imageUrl: product.imageUrl,
        sourceQtyOnHand: srcQty,
        destinationQtyOnHand: destQty,
        transferQty: srcQty > 0 ? 1 : 1,
        unitCost: product.unitCost || 0,
        unit: "PCS",
        batchNumber: `BAT-${product.sku.slice(0, 4)}`,
        expiryDate: "",
      };
      setItems((prev) => [...prev, newItem]);
    }
    setSearchQuery("");
    setShowProductDropdown(false);
  };

  const handleUpdateQty = (rowId: string, newQty: number) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === rowId) {
          const validatedQty = Math.max(1, newQty);
          return { ...item, transferQty: validatedQty };
        }
        return item;
      })
    );
  };

  const handleRemoveItem = (rowId: string) => {
    setItems((prev) => prev.filter((i) => i.id !== rowId));
  };

  // Calculations & Totals
  const totals = useMemo(() => {
    const totalItems = items.length;
    const totalQuantity = items.reduce((sum, i) => sum + i.transferQty, 0);
    const totalValue = items.reduce((sum, i) => sum + i.transferQty * i.unitCost, 0);
    const hasInsufficientStock = items.some((i) => i.transferQty > i.sourceQtyOnHand || i.sourceQtyOnHand <= 0);

    return {
      totalItems,
      totalQuantity,
      totalValue,
      hasInsufficientStock,
    };
  }, [items]);

  const activeComparisonItem = items[0] || null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const newFiles = Array.from(files).map((f) => ({
        name: f.name,
        size: `${(f.size / 1024).toFixed(0)} KB`,
        type: f.type.includes("pdf") ? "pdf" : "image",
      }));
      setAttachments((prev) => [...prev, ...newFiles]);
    }
  };

  // ── Real Server Action Execution ────────────────────────────────────────
  const handleExecuteTransfer = (asDraft = false) => {
    setErrorMessage(null);

    if (fromLocationId === toLocationId) {
      setErrorMessage("Source and destination locations cannot be the same.");
      return;
    }

    if (items.length === 0) {
      setErrorMessage("Please add at least one product to the transfer.");
      return;
    }

    if (totals.hasInsufficientStock) {
      setErrorMessage("One or more products exceed available source inventory. Please adjust quantities.");
      return;
    }

    startTransition(async () => {
      const payload = {
        fromLocationId,
        toLocationId,
        referenceNo: transferNumber,
        reason: transferReason || referenceNotes || "Stock Transfer",
        transferDate,
        notes: referenceNotes,
        items: items.map((i) => ({
          productId: i.productId,
          quantity: i.transferQty,
        })),
      };

      const result = await createStockTransfer(payload);

      if (result?.error) {
        setErrorMessage(result.error);
        setShowApprovalModal(false);
      } else {
        setSuccessMessage(`Stock Transfer #${transferNumber} successfully created and dispatched!`);
        setShowApprovalModal(false);
        setItems([]);

        // Redirect to stock transfer history so the user sees the real record immediately!
        setTimeout(() => {
          router.push("/inventory/transfers");
          router.refresh();
        }, 1200);
      }
    });
  };

  const sourceLocationObj = locations.find((l) => l.id === fromLocationId) || locations[0] || { name: "Source Location", id: "" };
  const destLocationObj = locations.find((l) => l.id === toLocationId) || locations[1] || { name: "Destination Location", id: "" };

  return (
    <div className="space-y-6 animate-in fade-in duration-150 pb-20">
      {/* Toast Notification */}
      {successMessage && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-3 rounded-2xl bg-emerald-700 px-5 py-3.5 text-white shadow-2xl animate-in slide-in-from-top-4">
          <CheckCircle2 className="h-5 w-5 text-emerald-200" />
          <span className="text-xs font-semibold">{successMessage}</span>
        </div>
      )}

      {/* Error Banner */}
      {errorMessage && (
        <div className="flex items-center justify-between rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-medium text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-red-600 hover:text-red-800">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ledger-100 pb-5 dark:border-ledger-700">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-900 dark:text-white">
            Stock Transfer
          </h1>
          <p className="mt-0.5 text-xs text-ledger-400">
            Transfer inventory between branches, warehouses, and locations.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Global Search Bar with Ctrl / */}
          <div className="relative hidden md:block">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-ledger-400" />
            <input
              type="text"
              placeholder="Search for documents, products, branches..."
              className="h-10 w-72 rounded-xl border border-ledger-200 bg-white pl-9 pr-14 text-xs text-ink-900 placeholder:text-ledger-400 shadow-xs focus:border-emerald-600 focus:outline-hidden dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
            />
            <kbd className="pointer-events-none absolute right-2.5 top-2.5 rounded-md border border-ledger-200 bg-ledger-50 px-1.5 py-0.5 text-[10px] font-mono text-ledger-400 dark:border-ledger-700 dark:bg-ink-950">
              Ctrl /
            </kbd>
          </div>

          {/* Currency Pill */}
          <div className="flex h-10 items-center gap-1.5 rounded-xl border border-ledger-200 bg-white px-3 text-xs font-semibold text-ink-900 shadow-xs dark:border-ledger-700 dark:bg-ink-900 dark:text-white">
            <span className="text-sm">🇬🇭</span>
            <span>{currency} (₵)</span>
          </div>

          {/* View Transfer History Button */}
          <Link href="/inventory/transfers">
            <Button
              type="button"
              variant="outline"
              className="h-10 gap-1.5 rounded-xl border-ledger-200 text-xs font-semibold text-ink-900 hover:bg-ledger-50 dark:border-ledger-700 dark:text-white"
            >
              <FileText className="h-4 w-4 text-emerald-600" />
              Transfer History
            </Button>
          </Link>
        </div>
      </div>

      {/* ── Status & Navigation Tabs Bar ─────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-ledger-100 pb-3 dark:border-ledger-700">
        <button
          type="button"
          onClick={() => setActiveTab("new")}
          className="flex items-center gap-2 rounded-xl border border-emerald-600/30 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800 shadow-xs dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
        >
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span>New Transfer</span>
        </button>

        <Link
          href="/inventory/transfers"
          className="flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold text-ledger-600 hover:bg-ledger-50 hover:text-ink-900 dark:text-ledger-300 dark:hover:bg-white/[0.04]"
        >
          <FileText className="h-4 w-4 text-ledger-400" />
          <span>All Transfers List</span>
        </Link>
      </div>

      {/* ── Main Stock Transfer Form Workspace ───────────────────────────── */}
      <div className="space-y-6">
        {/* 1. Create Stock Transfer Parameters Card (Toggle Show/Hide) */}
        <div className="rounded-2xl border border-ledger-100 bg-white p-6 shadow-card dark:border-ledger-700 dark:bg-ink-900 space-y-6">
          <div className="flex items-center justify-between border-b border-ledger-100 pb-4 dark:border-ledger-700">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300">
                <ArrowLeftRight className="h-4 w-4" />
              </div>
              <div>
                <h2 className="font-bold text-base text-ink-900 dark:text-white">
                  Create Stock Transfer
                </h2>
                <p className="text-xs text-ledger-400">
                  Select source &amp; destination locations, priority, and transfer reference
                </p>
              </div>
            </div>

            {/* Toggle Show/Hide Button */}
            <button
              type="button"
              onClick={() => setShowConfigSection(!showConfigSection)}
              className="flex items-center gap-1.5 rounded-xl border border-ledger-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-ledger-700 shadow-xs hover:bg-ledger-50 dark:border-ledger-700 dark:bg-ink-950 dark:text-ledger-300 transition-colors"
            >
              {showConfigSection ? (
                <>
                  <EyeOff className="h-3.5 w-3.5 text-ledger-400" />
                  <span>Hide Configuration</span>
                  <ChevronUp className="h-3.5 w-3.5 text-ledger-400 ml-0.5" />
                </>
              ) : (
                <>
                  <Eye className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Show Configuration</span>
                  <ChevronDown className="h-3.5 w-3.5 text-emerald-600 ml-0.5" />
                </>
              )}
            </button>
          </div>

          {/* Compact summary when collapsed */}
          {!showConfigSection && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-ledger-50/70 p-3 text-xs dark:bg-white/[0.02]">
              <div className="flex flex-wrap items-center gap-4">
                <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                  #{transferNumber}
                </span>
                <span className="text-ledger-600 dark:text-ledger-300 font-medium">
                  {sourceLocationObj?.name} → {destLocationObj?.name}
                </span>
                <span className="text-ledger-400">Date: {transferDate}</span>
                <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-[10px] font-bold text-ink-900 shadow-xs dark:bg-ink-900 dark:text-white">
                  Priority: {priority}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setShowConfigSection(true)}
                className="text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
              >
                Edit Configuration →
              </button>
            </div>
          )}

          {/* Expanded Configuration Section */}
          {showConfigSection && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {/* Row 1: Transfer Number, Transfer Date, Priority, Expected Date */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 text-xs">
                <div>
                  <label className="mb-1.5 block font-semibold text-ledger-600 dark:text-ledger-300">
                    Transfer Number
                  </label>
                  <input
                    type="text"
                    value={transferNumber}
                    onChange={(e) => setTransferNumber(e.target.value)}
                    className="h-10 w-full rounded-xl border border-ledger-200 bg-ledger-50/60 px-3 font-mono font-bold text-xs text-ink-900 dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
                  />
                  <span className="mt-1 block text-[10px] text-ledger-400">Auto generated reference</span>
                </div>

                <div>
                  <label className="mb-1.5 block font-semibold text-ledger-600 dark:text-ledger-300">
                    Transfer Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={transferDate}
                    onChange={(e) => setTransferDate(e.target.value)}
                    className="h-10 w-full rounded-xl border border-ledger-200 bg-white px-3 text-xs font-medium text-ink-900 shadow-xs focus:border-emerald-600 focus:outline-hidden dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block font-semibold text-ledger-600 dark:text-ledger-300">
                    Priority
                  </label>
                  <div className="relative">
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as any)}
                      className="h-10 w-full appearance-none rounded-xl border border-ledger-200 bg-white px-3 pr-8 text-xs font-semibold text-ink-900 shadow-xs focus:border-emerald-600 focus:outline-hidden dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
                    >
                      <option value="Normal">🟢 Normal</option>
                      <option value="Low">🔵 Low</option>
                      <option value="High">🟠 High</option>
                      <option value="Urgent">🔴 Urgent</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-ledger-400" />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block font-semibold text-ledger-600 dark:text-ledger-300">
                    Expected Date
                  </label>
                  <input
                    type="date"
                    value={expectedDate}
                    onChange={(e) => setExpectedDate(e.target.value)}
                    className="h-10 w-full rounded-xl border border-ledger-200 bg-white px-3 text-xs font-medium text-ink-900 shadow-xs focus:border-emerald-600 focus:outline-hidden dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
                  />
                </div>
              </div>

              {/* Row 2: Source (FROM) & Destination (TO) with Swap Button */}
              <div className="relative grid grid-cols-1 gap-4 md:grid-cols-2 pt-1">
                {/* Source (FROM) */}
                <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/30 p-4.5 dark:border-emerald-900/50 dark:bg-emerald-950/20 space-y-3.5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                      <Building2 className="h-3.5 w-3.5" />
                    </span>
                    <h3 className="font-bold text-xs text-emerald-900 dark:text-emerald-300 uppercase tracking-wide">
                      From (Source)
                    </h3>
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-ledger-600 dark:text-ledger-300">
                      Source Branch / Warehouse <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <select
                        value={fromLocationId}
                        onChange={(e) => handleSourceLocationChange(e.target.value)}
                        className="h-10 w-full appearance-none rounded-xl border border-ledger-200 bg-white px-3 pr-8 text-xs font-medium text-ink-900 shadow-xs focus:border-emerald-600 focus:outline-hidden dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
                      >
                        {locations.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-ledger-400" />
                    </div>
                  </div>
                </div>

                {/* Central Swap Button */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 hidden md:block">
                  <button
                    type="button"
                    onClick={handleSwapLocations}
                    title="Swap Source and Destination"
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-ledger-200 bg-white text-ledger-600 shadow-md transition-transform hover:scale-110 hover:border-emerald-600 hover:text-emerald-700 dark:border-ledger-700 dark:bg-ink-900 dark:text-ledger-300"
                  >
                    <ArrowLeftRight className="h-4 w-4" />
                  </button>
                </div>

                {/* Destination (TO) */}
                <div className="rounded-2xl border border-blue-200/70 bg-blue-50/30 p-4.5 dark:border-blue-900/50 dark:bg-blue-950/20 space-y-3.5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                      <Store className="h-3.5 w-3.5" />
                    </span>
                    <h3 className="font-bold text-xs text-blue-900 dark:text-blue-300 uppercase tracking-wide">
                      To (Destination)
                    </h3>
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-ledger-600 dark:text-ledger-300">
                      Destination Branch / Warehouse <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <select
                        value={toLocationId}
                        onChange={(e) => handleDestinationLocationChange(e.target.value)}
                        className="h-10 w-full appearance-none rounded-xl border border-ledger-200 bg-white px-3 pr-8 text-xs font-medium text-ink-900 shadow-xs focus:border-emerald-600 focus:outline-hidden dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
                      >
                        {locations.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-ledger-400" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Row 3: Reference / Notes */}
              <div>
                <label className="mb-1.5 block font-semibold text-xs text-ledger-600 dark:text-ledger-300">
                  Reference / Note
                </label>
                <textarea
                  rows={2}
                  value={referenceNotes}
                  onChange={(e) => setReferenceNotes(e.target.value)}
                  placeholder="e.g. routine stock replenishment, branch restock request..."
                  className="w-full rounded-xl border border-ledger-200 bg-white p-3 text-xs text-ink-900 placeholder:text-ledger-400 shadow-xs focus:border-emerald-600 focus:outline-hidden dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
                />
              </div>

              {/* Row 4: Summary, Status, Prepared By, Attachments (4-Card Row) */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 pt-2 border-t border-ledger-100 dark:border-ledger-700">
                {/* 1. Transfer Summary */}
                <div className="rounded-2xl border border-ledger-100 bg-ledger-50/40 p-4 dark:border-ledger-700 dark:bg-white/[0.02] space-y-2.5">
                  <div className="flex items-center gap-2 text-ledger-500 border-b border-ledger-100 pb-2 dark:border-ledger-700">
                    <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                    <h4 className="font-semibold text-xs text-ink-900 dark:text-white">Transfer Summary</h4>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between text-ledger-500">
                      <span>Total Line Items:</span>
                      <strong className="text-ink-900 dark:text-white font-mono">{totals.totalItems}</strong>
                    </div>
                    <div className="flex justify-between text-ledger-500">
                      <span>Total Quantity:</span>
                      <strong className="text-emerald-700 dark:text-emerald-400 font-mono">
                        {totals.totalQuantity} PCS
                      </strong>
                    </div>
                    <div className="flex justify-between border-t border-ledger-100 pt-1.5 text-ledger-500 dark:border-ledger-700">
                      <span>Total Value:</span>
                      <strong className="text-ink-900 dark:text-white font-mono">
                        {currency} {totals.totalValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* 2. Transfer Status */}
                <div className="rounded-2xl border border-ledger-100 bg-ledger-50/40 p-4 dark:border-ledger-700 dark:bg-white/[0.02] space-y-2.5">
                  <div className="flex items-center gap-2 text-ledger-500 border-b border-ledger-100 pb-2 dark:border-ledger-700">
                    <Clock className="h-4 w-4 text-amber-600" />
                    <h4 className="font-semibold text-xs text-ink-900 dark:text-white">Transfer Status</h4>
                  </div>
                  <div>
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300/60 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      Ready to Dispatch
                    </span>
                    <p className="mt-1.5 text-[11px] text-ledger-400">
                      Stock leaves source on submission.
                    </p>
                  </div>
                </div>

                {/* 3. Prepared By */}
                <div className="rounded-2xl border border-ledger-100 bg-ledger-50/40 p-4 dark:border-ledger-700 dark:bg-white/[0.02] space-y-2.5">
                  <div className="flex items-center gap-2 text-ledger-500 border-b border-ledger-100 pb-2 dark:border-ledger-700">
                    <UserIcon className="h-4 w-4 text-blue-600" />
                    <h4 className="font-semibold text-xs text-ink-900 dark:text-white">Prepared By</h4>
                  </div>
                  <div className="flex items-center gap-2.5 pt-0.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 font-bold text-xs text-white">
                      {currentUserEmail.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="text-left text-xs leading-tight min-w-0">
                      <p className="font-semibold text-ink-900 dark:text-white truncate">
                        {currentUserEmail.split("@")[0]}
                      </p>
                      <p className="text-[10px] text-ledger-400">{currentUserRole}</p>
                    </div>
                  </div>
                </div>

                {/* 4. Attachments */}
                <div className="rounded-2xl border border-ledger-100 bg-ledger-50/40 p-4 dark:border-ledger-700 dark:bg-white/[0.02] space-y-2">
                  <div className="flex items-center justify-between border-b border-ledger-100 pb-2 dark:border-ledger-700">
                    <div className="flex items-center gap-1.5">
                      <UploadCloud className="h-4 w-4 text-purple-600" />
                      <h4 className="font-semibold text-xs text-ink-900 dark:text-white">Attachments</h4>
                    </div>
                    <label className="cursor-pointer text-[10px] font-bold text-emerald-700 hover:underline dark:text-emerald-400">
                      + Upload
                      <input type="file" multiple onChange={handleFileUpload} className="hidden" />
                    </label>
                  </div>

                  <div className="space-y-1 max-h-16 overflow-y-auto">
                    {attachments.length === 0 ? (
                      <p className="text-[11px] text-ledger-400 italic">No files attached</p>
                    ) : (
                      attachments.map((file, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between rounded-lg bg-white p-1.5 text-[11px] dark:bg-ink-900"
                        >
                          <span className="truncate text-ink-900 dark:text-white pr-2">{file.name}</span>
                          <button
                            type="button"
                            onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                            className="text-ledger-400 hover:text-red-500"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 2. Full-Width Transfer Items Table */}
        <div className="rounded-2xl border border-ledger-100 bg-white shadow-card dark:border-ledger-700 dark:bg-ink-900 overflow-hidden">
          {/* Search Toolbar */}
          <div className="border-b border-ledger-100 p-5 dark:border-ledger-700 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-bold text-sm text-ink-900 dark:text-white">
                Transfer Items
              </h3>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowScannerModal(true)}
                  className="flex items-center gap-1.5 rounded-xl border border-ledger-200 bg-white px-3 py-1.5 text-xs font-semibold text-ledger-700 shadow-xs hover:bg-ledger-50 dark:border-ledger-700 dark:bg-ink-950 dark:text-ledger-300"
                >
                  <Barcode className="h-4 w-4 text-emerald-600" />
                  <span>Scan Barcode</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowLookupModal(true)}
                  className="flex items-center gap-1.5 rounded-xl border border-ledger-200 bg-white px-3 py-1.5 text-xs font-semibold text-ledger-700 shadow-xs hover:bg-ledger-50 dark:border-ledger-700 dark:bg-ink-950 dark:text-ledger-300"
                >
                  <Layers className="h-4 w-4 text-blue-600" />
                  <span>Product Lookup</span>
                </button>
              </div>
            </div>

            {/* Product Search Field */}
            <div className="relative" ref={searchContainerRef}>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-ledger-400" />
                  <input
                    type="text"
                    placeholder="Search product by name, SKU or scan barcode..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setShowProductDropdown(true);
                    }}
                    onFocus={() => setShowProductDropdown(true)}
                    className="h-11 w-full rounded-xl border border-ledger-200 bg-white pl-10 pr-4 text-xs font-medium text-ink-900 placeholder:text-ledger-400 shadow-xs focus:border-emerald-600 focus:outline-hidden dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
                  />
                </div>

                <Button
                  type="button"
                  onClick={() => setShowLookupModal(true)}
                  className="h-11 gap-1.5 rounded-xl bg-emerald-700 px-5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-800"
                >
                  <Plus className="h-4 w-4" />
                  Add Item
                </Button>
              </div>

              {/* Autocomplete Results Dropdown */}
              {showProductDropdown && searchResults.length > 0 && (
                <div className="absolute left-0 right-0 top-12 z-30 max-h-72 overflow-y-auto rounded-2xl border border-ledger-100 bg-white p-2 shadow-2xl dark:border-ledger-700 dark:bg-ink-900">
                  {searchResults.map((product) => {
                    const srcStock = getStockQty(product.id, fromLocationId);
                    const destStock = getStockQty(product.id, toLocationId);
                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => handleAddProduct(product)}
                        className="flex w-full items-center justify-between rounded-xl p-2.5 text-left text-xs transition-colors hover:bg-ledger-50 dark:hover:bg-white/[0.04]"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-ledger-100 bg-white dark:border-ledger-700 dark:bg-ink-950">
                            <Package className="h-4 w-4 text-ledger-400" />
                          </div>
                          <div>
                            <p className="font-semibold text-ink-900 dark:text-white">{product.name}</p>
                            <div className="flex items-center gap-2 font-mono text-[11px] text-ledger-400">
                              <span>SKU: {product.sku}</span>
                              {product.category && <span>· {product.category}</span>}
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <span
                            className={`font-bold font-mono ${
                              srcStock > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"
                            }`}
                          >
                            {srcStock} available at source
                          </span>
                          <p className="text-[10px] text-blue-600 dark:text-blue-400">
                            {destStock} at destination
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Editable Multi-Column Items Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-ledger-100 bg-ledger-50/70 text-[11px] font-semibold text-ledger-500 dark:border-ledger-700 dark:bg-white/[0.02]">
                <tr>
                  <th className="px-3.5 py-3 w-8">#</th>
                  <th className="px-3.5 py-3 min-w-[220px]">PRODUCT</th>
                  <th className="px-3.5 py-3 min-w-[130px]">SKU</th>
                  <th className="px-3.5 py-3 text-center min-w-[110px]">
                    SOURCE QTY ON HAND
                  </th>
                  <th className="px-3.5 py-3 text-center min-w-[110px]">
                    DESTINATION QTY ON HAND
                  </th>
                  <th className="px-3.5 py-3 text-center min-w-[110px]">
                    TRANSFER QTY
                  </th>
                  <th className="px-3.5 py-3 text-right min-w-[120px]">
                    UNIT COST ({currency})
                  </th>
                  <th className="px-3.5 py-3 text-right min-w-[130px]">
                    TRANSFER VALUE ({currency})
                  </th>
                  <th className="px-3.5 py-3 text-center min-w-[120px]">
                    SOURCE AFTER TRANSFER
                  </th>
                  <th className="px-3.5 py-3 text-center min-w-[120px]">
                    DESTINATION AFTER TRANSFER
                  </th>
                  <th className="px-3.5 py-3 text-center w-20">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ledger-100 dark:divide-ledger-700/50">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-6 py-14 text-center">
                      <div className="mx-auto max-w-sm space-y-2">
                        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-ledger-50 text-ledger-400 dark:bg-ledger-800">
                          <Package className="h-5 w-5" />
                        </div>
                        <p className="font-semibold text-ink-900 dark:text-white">
                          No products added yet
                        </p>
                        <p className="text-xs text-ledger-400">
                          Use the search field above or click &quot;+ Add Item&quot; to pick products from your inventory.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  items.map((row, idx) => {
                    const sourceAfter = row.sourceQtyOnHand - row.transferQty;
                    const destinationAfter = row.destinationQtyOnHand + row.transferQty;
                    const transferValue = row.transferQty * row.unitCost;
                    const isOverStock = row.transferQty > row.sourceQtyOnHand;

                    return (
                      <tr
                        key={row.id}
                        className={`transition-colors hover:bg-ledger-50/40 dark:hover:bg-white/[0.02] ${
                          isOverStock ? "bg-red-50/30 dark:bg-red-950/20" : ""
                        }`}
                      >
                        <td className="px-3.5 py-3.5 font-mono text-ledger-400 font-semibold">
                          {idx + 1}
                        </td>

                        <td className="px-3.5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-ledger-100 bg-white p-1 dark:border-ledger-700 dark:bg-ink-950">
                              <Package className="h-5 w-5 text-ledger-400" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-ink-900 dark:text-white truncate">
                                {row.name}
                              </p>
                              <span className="font-mono text-[10px] text-ledger-400">
                                {row.sku}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="px-3.5 py-3.5 font-mono text-ledger-600 dark:text-ledger-300 font-medium">
                          {row.sku}
                        </td>

                        <td
                          className={`px-3.5 py-3.5 text-center font-mono font-bold ${
                            row.sourceQtyOnHand > 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-red-500"
                          }`}
                        >
                          {row.sourceQtyOnHand}
                        </td>

                        <td className="px-3.5 py-3.5 text-center font-mono font-bold text-blue-600 dark:text-blue-400">
                          {row.destinationQtyOnHand}
                        </td>

                        <td className="px-3.5 py-3.5 text-center">
                          <div className="inline-flex items-center rounded-xl border border-ledger-200 bg-white shadow-xs dark:border-ledger-700 dark:bg-ink-950">
                            <button
                              type="button"
                              onClick={() => handleUpdateQty(row.id, row.transferQty - 1)}
                              className="h-8 w-7 text-ledger-500 hover:text-ink-900 dark:text-ledger-400 dark:hover:text-white"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min={1}
                              value={row.transferQty}
                              onChange={(e) => handleUpdateQty(row.id, Number(e.target.value) || 1)}
                              className={`h-8 w-14 text-center font-mono text-xs font-bold text-ink-900 dark:text-white focus:outline-hidden ${
                                isOverStock ? "text-red-600" : ""
                              }`}
                            />
                            <button
                              type="button"
                              onClick={() => handleUpdateQty(row.id, row.transferQty + 1)}
                              className="h-8 w-7 text-ledger-500 hover:text-ink-900 dark:text-ledger-400 dark:hover:text-white"
                            >
                              +
                            </button>
                          </div>
                        </td>

                        <td className="px-3.5 py-3.5 text-right font-mono text-ledger-600 dark:text-ledger-300">
                          {row.unitCost.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </td>

                        <td className="px-3.5 py-3.5 text-right font-mono font-bold text-ink-900 dark:text-white">
                          {transferValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </td>

                        <td
                          className={`px-3.5 py-3.5 text-center font-mono font-bold ${
                            sourceAfter < 0 ? "text-red-600 font-black" : "text-emerald-600 dark:text-emerald-400"
                          }`}
                        >
                          {sourceAfter}
                        </td>

                        <td className="px-3.5 py-3.5 text-center font-mono font-bold text-blue-600 dark:text-blue-400">
                          {destinationAfter}
                        </td>

                        <td className="px-3.5 py-3.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(row.id)}
                            title="Remove item"
                            className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Add Another Product Button */}
          <div className="p-4 border-t border-ledger-100 text-center dark:border-ledger-700">
            <button
              type="button"
              onClick={() => setShowLookupModal(true)}
              className="w-full rounded-xl border border-dashed border-emerald-500/50 bg-emerald-50/20 py-2.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50/50 dark:text-emerald-400 dark:hover:bg-emerald-950/30 transition-colors"
            >
              + Add Another Product
            </button>
          </div>

          {/* Table Summary Footer */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-ledger-100 bg-ledger-50/40 p-4 text-xs font-semibold dark:border-ledger-700 dark:bg-white/[0.01]">
            <div className="flex items-center gap-3">
              <span className="text-ledger-500">Total Items:</span>
              <span className="font-bold text-ink-900 dark:text-white font-mono">{totals.totalItems}</span>
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="text-ledger-500">Total Quantity:</span>
                <span className="font-bold text-emerald-700 dark:text-emerald-400 font-mono text-sm">
                  {totals.totalQuantity} PCS
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-ledger-500">Total Value ({currency}):</span>
                <span className="font-bold text-ink-900 dark:text-white font-mono text-sm">
                  {currency} {totals.totalValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Real-Time Stock Comparison Widget */}
        {activeComparisonItem && (
          <div className="rounded-2xl border border-ledger-100 bg-white p-6 shadow-card dark:border-ledger-700 dark:bg-ink-900 space-y-4">
            <div>
              <h3 className="font-bold text-sm text-ink-900 dark:text-white">
                Stock Comparison (Before vs After Transfer)
              </h3>
              <p className="text-xs text-ledger-400">
                Live simulation for: <strong className="text-ink-900 dark:text-white">{activeComparisonItem.name}</strong>
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-12 items-center">
              {/* BEFORE TRANSFER */}
              <div className="md:col-span-4 rounded-2xl border border-ledger-100 bg-ledger-50/50 p-4 dark:border-ledger-700 dark:bg-white/[0.02] space-y-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ledger-400 block">
                  BEFORE TRANSFER
                </span>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] text-ledger-500 leading-tight">
                      Source ({sourceLocationObj?.name})
                    </p>
                    <p className="text-[10px] text-ledger-400">Qty On Hand</p>
                    <p className="font-display text-2xl font-bold text-ink-900 dark:text-white font-mono mt-1">
                      {activeComparisonItem.sourceQtyOnHand}
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] text-ledger-500 leading-tight">
                      Destination ({destLocationObj?.name})
                    </p>
                    <p className="text-[10px] text-ledger-400">Qty On Hand</p>
                    <p className="font-display text-2xl font-bold text-blue-600 dark:text-blue-400 font-mono mt-1">
                      {activeComparisonItem.destinationQtyOnHand}
                    </p>
                  </div>
                </div>
              </div>

              {/* Arrow */}
              <div className="md:col-span-1 flex items-center justify-center">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ledger-100 text-ledger-500 dark:bg-ledger-800">
                  <ArrowRight className="h-4 w-4" />
                </div>
              </div>

              {/* AFTER TRANSFER */}
              <div className="md:col-span-4 rounded-2xl border border-emerald-100 bg-emerald-50/20 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20 space-y-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 block">
                  AFTER TRANSFER (With {activeComparisonItem.transferQty} Qty)
                </span>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] text-ledger-500 leading-tight">
                      Source ({sourceLocationObj?.name})
                    </p>
                    <p className="text-[10px] text-ledger-400">Remaining Stock</p>
                    <p
                      className={`font-display text-2xl font-bold font-mono mt-1 ${
                        activeComparisonItem.sourceQtyOnHand - activeComparisonItem.transferQty < 0
                          ? "text-red-600"
                          : "text-emerald-600 dark:text-emerald-400"
                      }`}
                    >
                      {activeComparisonItem.sourceQtyOnHand - activeComparisonItem.transferQty}
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] text-ledger-500 leading-tight">
                      Destination ({destLocationObj?.name})
                    </p>
                    <p className="text-[10px] text-ledger-400">Expected Stock</p>
                    <p className="font-display text-2xl font-bold text-blue-600 dark:text-blue-400 font-mono mt-1">
                      {activeComparisonItem.destinationQtyOnHand + activeComparisonItem.transferQty}
                    </p>
                  </div>
                </div>
              </div>

              {/* STOCK ALERT */}
              <div
                className={`md:col-span-3 rounded-2xl border p-4 space-y-2 ${
                  totals.hasInsufficientStock
                    ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30"
                    : "border-amber-200/80 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/20"
                }`}
              >
                <div
                  className={`flex items-center gap-1.5 ${
                    totals.hasInsufficientStock ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400"
                  }`}
                >
                  <AlertTriangle className="h-4 w-4" />
                  <h4 className="font-bold text-xs">Stock Alert</h4>
                </div>
                <p className="text-[11px] text-ledger-600 dark:text-ledger-300 leading-relaxed">
                  {totals.hasInsufficientStock ? (
                    <strong className="text-red-600">
                      Warning: Requested transfer quantity exceeds available source inventory!
                    </strong>
                  ) : (
                    <>
                      After transfer, source location will have{" "}
                      <strong>
                        {activeComparisonItem.sourceQtyOnHand - activeComparisonItem.transferQty} units
                      </strong>{" "}
                      remaining.
                    </>
                  )}
                </p>
                {!totals.hasInsufficientStock && (
                  <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 text-xs font-semibold pt-1">
                    <Check className="h-3.5 w-3.5" />
                    <span>Sufficient stock available.</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Fixed Bottom Actions Bar ─────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-ledger-200 bg-white/95 px-6 py-3.5 shadow-2xl backdrop-blur-md dark:border-ledger-700 dark:bg-ink-900/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Link
            href="/inventory/transfers"
            className="rounded-xl px-4 py-2 text-xs font-semibold text-ledger-600 hover:bg-ledger-100 hover:text-ink-900 dark:text-ledger-300 dark:hover:bg-white/[0.04]"
          >
            Cancel
          </Link>

          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleExecuteTransfer(true)}
              disabled={isPending || items.length === 0}
              className="h-10 gap-1.5 rounded-xl border-ledger-200 text-xs font-semibold text-ink-900 hover:bg-ledger-50 dark:border-ledger-700 dark:text-white"
            >
              <FileSpreadsheet className="h-4 w-4 text-amber-600" />
              Save as Draft
            </Button>

            <Button
              type="button"
              onClick={() => {
                if (items.length === 0) {
                  setErrorMessage("Please add at least one product before submitting.");
                  return;
                }
                setShowApprovalModal(true);
              }}
              disabled={isPending || items.length === 0}
              className="h-10 gap-2 rounded-xl bg-emerald-700 px-6 text-xs font-semibold text-white shadow-md hover:bg-emerald-800"
            >
              <span>Review &amp; Submit</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* ── Approval Modal (Connecting directly to createStockTransfer) ──── */}
      {showApprovalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-2xl rounded-2xl border border-ledger-100 bg-white p-6 shadow-2xl dark:border-ledger-700 dark:bg-ink-900 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-ledger-100 pb-4 dark:border-ledger-700">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-ink-900 dark:text-white">
                    Approve &amp; Dispatch Transfer #{transferNumber}
                  </h3>
                  <p className="text-xs text-ledger-400">
                    Source: {sourceLocationObj?.name} → Destination: {destLocationObj?.name}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowApprovalModal(false)}
                className="rounded-lg p-1.5 text-ledger-400 hover:bg-ledger-50 dark:hover:bg-white/[0.06]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3 rounded-2xl bg-ledger-50/60 p-4 text-xs dark:bg-white/[0.02]">
              <div>
                <span className="text-ledger-400 block text-[10px]">Total Line Items</span>
                <strong className="text-ink-900 dark:text-white font-mono text-sm">{totals.totalItems}</strong>
              </div>
              <div>
                <span className="text-ledger-400 block text-[10px]">Total Quantity</span>
                <strong className="text-emerald-700 dark:text-emerald-400 font-mono text-sm">
                  {totals.totalQuantity} PCS
                </strong>
              </div>
              <div>
                <span className="text-ledger-400 block text-[10px]">Total Value</span>
                <strong className="text-ink-900 dark:text-white font-mono text-sm">
                  {currency} {totals.totalValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </strong>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <h4 className="font-semibold text-xs text-ink-900 dark:text-white">Items to be transferred</h4>
              <div className="max-h-48 overflow-y-auto rounded-xl border border-ledger-100 text-xs dark:border-ledger-700">
                <table className="w-full text-left">
                  <thead className="bg-ledger-50/70 text-[10px] text-ledger-500 font-semibold dark:bg-white/[0.02]">
                    <tr>
                      <th className="p-2">Product</th>
                      <th className="p-2 text-center">Qty</th>
                      <th className="p-2 text-right">Unit Cost</th>
                      <th className="p-2 text-right">Total Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ledger-100 dark:divide-ledger-700">
                    {items.map((i) => (
                      <tr key={i.id}>
                        <td className="p-2 font-medium text-ink-900 dark:text-white">{i.name}</td>
                        <td className="p-2 text-center font-bold font-mono">{i.transferQty}</td>
                        <td className="p-2 text-right font-mono">{i.unitCost.toFixed(2)}</td>
                        <td className="p-2 text-right font-bold font-mono">
                          {(i.transferQty * i.unitCost).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-ledger-100 pt-4 dark:border-ledger-700">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowApprovalModal(false);
                  window.print();
                }}
                className="gap-1.5 rounded-xl text-xs"
              >
                <Printer className="h-3.5 w-3.5" />
                Print Transfer Slip
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowApprovalModal(false)}
                  className="rounded-xl text-xs"
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={isPending}
                  onClick={() => handleExecuteTransfer(false)}
                  className="gap-1.5 rounded-xl bg-emerald-700 text-xs text-white hover:bg-emerald-800"
                >
                  <Send className="h-3.5 w-3.5" />
                  {isPending ? "Creating Transfer..." : "Confirm & Dispatch"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Product Lookup Catalogue Modal (Real Products) ──────────────── */}
      {showLookupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-2xl rounded-2xl border border-ledger-100 bg-white p-6 shadow-2xl dark:border-ledger-700 dark:bg-ink-900 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-ledger-100 pb-3 dark:border-ledger-700">
              <div className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-emerald-600" />
                <h3 className="font-bold text-base text-ink-900 dark:text-white">
                  Inventory Product Catalogue
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowLookupModal(false)}
                className="rounded-lg p-1.5 text-ledger-400 hover:bg-ledger-50 dark:hover:bg-white/[0.06]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-ledger-400" />
                <input
                  type="text"
                  placeholder="Filter catalog by product name or SKU..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-10 w-full rounded-xl border border-ledger-200 bg-white pl-9 pr-3 text-xs text-ink-900 dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
                />
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {products.length === 0 ? (
                  <p className="py-8 text-center text-xs text-ledger-400">
                    No active products found in inventory.
                  </p>
                ) : (
                  products.map((p) => {
                    const srcQty = getStockQty(p.id, fromLocationId);
                    const isAdded = items.some((i) => i.productId === p.id);
                    return (
                      <div
                        key={p.id}
                        className="flex items-center justify-between rounded-xl border border-ledger-100 p-3 text-xs hover:bg-ledger-50/60 dark:border-ledger-700 dark:hover:bg-white/[0.02]"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-ledger-100 bg-white dark:border-ledger-700 dark:bg-ink-950">
                            <Package className="h-4 w-4 text-ledger-400" />
                          </div>
                          <div>
                            <p className="font-semibold text-ink-900 dark:text-white">{p.name}</p>
                            <p className="font-mono text-[10px] text-ledger-400">{p.sku}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p
                              className={`font-bold font-mono ${
                                srcQty > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"
                              }`}
                            >
                              {srcQty} on hand
                            </p>
                            <p className="font-mono text-[10px] text-ledger-400">
                              {currency} {p.unitCost.toFixed(2)}
                            </p>
                          </div>

                          <Button
                            size="sm"
                            variant={isAdded ? "outline" : "primary"}
                            onClick={() => handleAddProduct(p)}
                            className={`rounded-xl text-xs ${
                              isAdded ? "" : "bg-emerald-700 text-white hover:bg-emerald-800"
                            }`}
                          >
                            {isAdded ? "Add More" : "+ Select"}
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="mt-5 flex justify-end border-t border-ledger-100 pt-3 dark:border-ledger-700">
              <Button
                size="sm"
                onClick={() => setShowLookupModal(false)}
                className="rounded-xl bg-emerald-700 text-xs text-white hover:bg-emerald-800"
              >
                Done
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Barcode Scanner Simulator Modal ─────────────────────────────── */}
      {showScannerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-md rounded-2xl border border-ledger-100 bg-white p-6 shadow-2xl dark:border-ledger-700 dark:bg-ink-900 text-center">
            <div className="flex items-center justify-between border-b border-ledger-100 pb-3 dark:border-ledger-700">
              <div className="flex items-center gap-2">
                <Barcode className="h-5 w-5 text-emerald-600" />
                <h3 className="font-bold text-base text-ink-900 dark:text-white">
                  Barcode Scanner
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowScannerModal(false)}
                className="rounded-lg p-1 text-ledger-400 hover:bg-ledger-50 dark:hover:bg-white/[0.06]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="my-6 rounded-2xl border-2 border-dashed border-emerald-500 bg-emerald-50/20 p-8 dark:bg-emerald-950/20">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 animate-pulse">
                <Barcode className="h-8 w-8" />
              </div>
              <p className="mt-4 font-bold text-sm text-ink-900 dark:text-white">
                Scanner Ready
              </p>
              <p className="mt-1 text-xs text-ledger-400">
                Scan product barcode to automatically add it to the transfer table.
              </p>
            </div>

            {products.length > 0 && (
              <div className="space-y-2 text-xs text-left">
                <span className="font-semibold text-ledger-500 block">Available inventory to scan:</span>
                <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto">
                  {products.slice(0, 4).map((p) => (
                    <Button
                      key={p.id}
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        handleAddProduct(p);
                        setShowScannerModal(false);
                      }}
                      className="text-xs truncate"
                    >
                      Scan {p.name.slice(0, 15)}...
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}