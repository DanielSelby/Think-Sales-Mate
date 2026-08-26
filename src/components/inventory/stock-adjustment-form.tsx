"use client";

import { useMemo, useState, useTransition, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import * as XLSX from "xlsx";
import {
  Search,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Equal,
  RotateCcw,
  Copy,
  Printer,
  Barcode as BarcodeIcon,
  Check,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Upload,
  Download,
  Calendar,
  MapPin,
  Info,
  Package,
  X,
  Wallet,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  Eye,
  EyeOff,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { createStockAdjustment } from "@/app/(dashboard)/inventory/adjustments/actions";

export interface AdjustLocation {
  id: string;
  name: string;
  isPrimary?: boolean;
}

export interface AdjustableProduct {
  id: string;
  sku: string;
  barcode?: string | null;
  name: string;
  category?: string | null;
  brand?: string | null;
  locationId?: string | null;
  stockQuantity: number;
  costPrice: number;
  unitPrice: number;
  imageUrl?: string | null;
  isActive?: boolean;
  /** On-hand quantity per location, keyed by location id — the real source of System Qty. Matches the shape your adjustments/page.tsx already builds and embeds per product. */
  locationStocks?: Record<string, number>;
}

export interface ResponsiblePerson {
  id: string;
  name: string;
  avatarUrl?: string | null;
  role?: string;
}

export interface StockAdjustmentFormProps {
  locations: AdjustLocation[];
  products: AdjustableProduct[];
  teamMembers?: ResponsiblePerson[];
  currency?: string;
  currentUserName: string;
  currentUserId?: string;
  /** Gates the actions that actually persist/finalize a count. Server re-checks this regardless. */
  canManage?: boolean;
}

interface TableCountRow {
  productId: string;
  name: string;
  sku: string;
  barcode?: string | null;
  category?: string | null;
  imageUrl?: string | null;
  costPrice: number;
  systemStock: number;
  countedStock: number;
  reason: string;
  isManuallyAdded?: boolean;
  hasChanged?: boolean;
}

const REASONS = [
  "Damage/Defective",
  "Overage",
  "Theft/Loss",
  "Expired",
  "Counting Error",
  "Found Unrecorded Stock",
  "Other",
];

const DONUT_COLORS = {
  positive: "#16a34a", // emerald-600
  negative: "#dc2626", // red-600
  zero: "#94a3b8", // slate-400
};

function formatMoney(value: number) {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function suggestedReference() {
  const d = new Date();
  const y = d.getFullYear();
  const seq = String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
  return `STK-${y}-${seq}`;
}

export function StockAdjustmentForm({
  locations,
  products,
  teamMembers = [],
  currency = "GHS",
  currentUserName,
  currentUserId,
  canManage = true,
}: StockAdjustmentFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // 1. Header Parameters State
  const [countReference, setCountReference] = useState<string>(() => suggestedReference());
  const [countDate, setCountDate] = useState<string>(() => todayIso());
  const [countType, setCountType] = useState<"stock_taking" | "adjustment_only">("stock_taking");
  const [status, setStatus] = useState<"in_progress" | "draft" | "completed">("in_progress");
  const [selectedLocationId, setSelectedLocationId] = useState<string>(locations[0]?.id || "");
  const [selectedPersonId, setSelectedPersonId] = useState<string>(() => {
    if (currentUserId && teamMembers.some((tm) => tm.id === currentUserId)) return currentUserId;
    return teamMembers[0]?.id || "";
  });
  const [notes, setNotes] = useState<string>("");
  const [adjustmentAccount, setAdjustmentAccount] = useState<string>("Inventory Adjustment");

  // Toggle for Header Parameters section
  const [showParameters, setShowParameters] = useState<boolean>(true);
  // Toggle for the detailed 5-card Adjustment Preview breakdown
  const [showAdjustmentPreview, setShowAdjustmentPreview] = useState<boolean>(false);

  // 2. Table and Filter States
  const [activeTab, setActiveTab] = useState<"all" | "counted" | "variance">("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [copiedRef, setCopiedRef] = useState<boolean>(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Modals state
  const [showBarcodeScanner, setShowBarcodeScanner] = useState<boolean>(false);
  const [barcodeInput, setBarcodeInput] = useState<string>("");
  const [showProductPicker, setShowProductPicker] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 3. Real per-location on-hand quantities. A stock take only ever means
  // something against the specific warehouse it's counting, so System Qty
  // always comes from the product's own locationStocks map — never from
  // stockQuantity, which is an org-wide total.
  function availableAt(product: AdjustableProduct | undefined, locationId: string) {
    if (!product) return 0;
    return product.locationStocks?.[locationId] ?? product.stockQuantity ?? 0;
  }

  function availableAtById(productId: string, locationId: string) {
    return availableAt(products.find((p) => p.id === productId), locationId);
  }

  // "Stock Taking" starts from the full active catalog at the chosen
  // location, since the point is to systematically account for everything.
  // "Adjustment Only" starts empty — you search or scan in just the
  // specific items you're correcting, rather than reviewing every product.
  function buildRowsForLocation(locationId: string, mode: "stock_taking" | "adjustment_only"): TableCountRow[] {
    if (mode === "adjustment_only" || !locationId) return [];
    return products
      .filter((p) => p.isActive !== false)
      .map((p) => {
        const systemStock = availableAt(p, locationId);
        return {
          productId: p.id,
          name: p.name,
          sku: p.sku,
          barcode: p.barcode,
          category: p.category,
          imageUrl: p.imageUrl,
          costPrice: p.costPrice ?? 0,
          systemStock,
          countedStock: systemStock,
          reason: "-",
          hasChanged: false,
        };
      });
  }

  const [tableRows, setTableRows] = useState<TableCountRow[]>(() =>
    buildRowsForLocation(selectedLocationId, countType)
  );

  function handleLocationChange(newLocationId: string) {
    if (newLocationId === selectedLocationId) return;
    const hasUnsavedCounts = tableRows.some((r) => r.hasChanged);
    if (hasUnsavedCounts && !confirm("Switching location will clear the counts you've entered for this count sheet. Continue?")) {
      return;
    }
    setSelectedLocationId(newLocationId);
    setTableRows(buildRowsForLocation(newLocationId, countType));
    setFeedbackMessage({
      type: "success",
      text: `Location switched to "${locations.find((l) => l.id === newLocationId)?.name}". Stock counts updated for this location.`,
    });
    setTimeout(() => setFeedbackMessage(null), 3000);
  }

  function handleCountTypeChange(mode: "stock_taking" | "adjustment_only") {
    if (mode === countType) return;
    const hasUnsavedCounts = tableRows.some((r) => r.hasChanged);
    if (hasUnsavedCounts && !confirm("Switching count type will clear the current count sheet. Continue?")) {
      return;
    }
    setCountType(mode);
    setTableRows(buildRowsForLocation(selectedLocationId, mode));
  }

  // 4. Real-time Calculations — computed entirely from tableRows, no
  // hardcoded or fallback figures.
  const calculations = useMemo(() => {
    let varianceItemsCount = 0;
    let totalVarianceQty = 0;
    let totalVarianceValue = 0;

    let positiveCount = 0;
    let positiveQty = 0;
    let positiveValue = 0;

    let negativeCount = 0;
    let negativeQty = 0;
    let negativeValue = 0;

    let zeroCount = 0;

    tableRows.forEach((row) => {
      const variance = row.countedStock - row.systemStock;
      const varianceVal = variance * row.costPrice;

      if (variance !== 0) {
        varianceItemsCount++;
        totalVarianceQty += variance;
        totalVarianceValue += varianceVal;

        if (variance > 0) {
          positiveCount++;
          positiveQty += variance;
          positiveValue += varianceVal;
        } else {
          negativeCount++;
          negativeQty += Math.abs(variance);
          negativeValue += Math.abs(varianceVal);
        }
      } else {
        zeroCount++;
      }
    });

    const totalDonut = positiveCount + negativeCount + zeroCount || 1;
    const posPct = Math.round((positiveCount / totalDonut) * 100);
    const negPct = Math.round((negativeCount / totalDonut) * 100);
    const zeroPct = Math.max(0, 100 - posPct - negPct);

    const donutData = [
      { name: "Positive", value: positiveCount, color: DONUT_COLORS.positive },
      { name: "Negative", value: negativeCount, color: DONUT_COLORS.negative },
      { name: "Zero", value: zeroCount, color: DONUT_COLORS.zero },
    ].filter((d) => d.value > 0);

    return {
      totalItemsSystem: tableRows.length,
      countedItems: tableRows.filter((r) => r.hasChanged).length,
      varianceItemsCount,
      totalVarianceQty,
      totalVarianceValue,
      positiveCount,
      positiveQty,
      positiveValue,
      negativeCount,
      negativeQty,
      negativeValue,
      zeroCount,
      netAdjustmentValue: totalVarianceValue,
      posPct,
      negPct,
      zeroPct,
      donutData,
    };
  }, [tableRows]);

  // 5. Filtered Table Rows
  const filteredRows = useMemo(() => {
    return tableRows.filter((row) => {
      const variance = row.countedStock - row.systemStock;

      if (activeTab === "counted" && !row.hasChanged && variance === 0) {
        return false;
      }
      if (activeTab === "variance" && variance === 0) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = row.name.toLowerCase().includes(q);
        const matchesSku = row.sku.toLowerCase().includes(q);
        const matchesBarcode = row.barcode?.toLowerCase().includes(q);
        if (!matchesName && !matchesSku && !matchesBarcode) return false;
      }

      return true;
    });
  }, [tableRows, activeTab, searchQuery]);

  // Handlers for Row edits
  const handleCountChange = (productId: string, newCount: number) => {
    setTableRows((prev) =>
      prev.map((row) => {
        if (row.productId === productId) {
          const validCount = Math.max(0, newCount);
          const variance = validCount - row.systemStock;
          return {
            ...row,
            countedStock: validCount,
            hasChanged: true,
            reason: variance > 0 ? "Overage" : variance < 0 ? "Damage/Defective" : "-",
          };
        }
        return row;
      })
    );
  };

  const handleReasonChange = (productId: string, newReason: string) => {
    setTableRows((prev) =>
      prev.map((row) => (row.productId === productId ? { ...row, reason: newReason } : row))
    );
  };

  const handleResetRow = (productId: string) => {
    setTableRows((prev) =>
      prev.map((row) =>
        row.productId === productId
          ? { ...row, countedStock: row.systemStock, reason: "-", hasChanged: false }
          : row
      )
    );
  };

  const handleDeleteRow = (productId: string) => {
    setTableRows((prev) => prev.filter((r) => r.productId !== productId));
  };

  const handleCopyRef = () => {
    navigator.clipboard.writeText(countReference);
    setCopiedRef(true);
    setTimeout(() => setCopiedRef(false), 2000);
  };

  // Add Product from picker
  const handleAddProduct = (prod: AdjustableProduct) => {
    if (tableRows.some((r) => r.productId === prod.id)) {
      setFeedbackMessage({ type: "error", text: `"${prod.name}" is already in the count list.` });
      setTimeout(() => setFeedbackMessage(null), 3000);
      return;
    }
    if (!selectedLocationId) {
      setFeedbackMessage({ type: "error", text: "Choose a warehouse/location first." });
      setTimeout(() => setFeedbackMessage(null), 3000);
      return;
    }

    const systemStock = availableAt(prod, selectedLocationId);
    setTableRows((prev) => [
      {
        productId: prod.id,
        name: prod.name,
        sku: prod.sku,
        barcode: prod.barcode,
        category: prod.category,
        imageUrl: prod.imageUrl,
        costPrice: prod.costPrice ?? 0,
        systemStock,
        countedStock: systemStock,
        reason: "-",
        isManuallyAdded: true,
        hasChanged: false,
      },
      ...prev,
    ]);
    setShowProductPicker(false);
  };

  // Barcode Scanner Lookup
  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;

    const query = barcodeInput.trim().toLowerCase();
    const existing = tableRows.find(
      (r) => r.barcode?.toLowerCase() === query || r.sku.toLowerCase() === query
    );

    if (existing) {
      handleCountChange(existing.productId, existing.countedStock + 1);
      setFeedbackMessage({
        type: "success",
        text: `Scanned: "${existing.name}". Quantity incremented to ${existing.countedStock + 1}.`,
      });
    } else {
      const catalogMatch = products.find(
        (p) => p.barcode?.toLowerCase() === query || p.sku.toLowerCase() === query
      );
      if (catalogMatch) {
        handleAddProduct(catalogMatch);
        setFeedbackMessage({
          type: "success",
          text: `Scanned & added: "${catalogMatch.name}".`,
        });
      } else {
        setFeedbackMessage({
          type: "error",
          text: `No product found matching barcode/SKU "${barcodeInput}".`,
        });
      }
    }

    setBarcodeInput("");
    setShowBarcodeScanner(false);
    setTimeout(() => setFeedbackMessage(null), 3500);
  };

  // Export Count Sheet to Excel
  const handleExportSheet = () => {
    const dataRows = tableRows.map((r, i) => {
      const variance = r.countedStock - r.systemStock;
      const varianceVal = variance * r.costPrice;
      return {
        "#": i + 1,
        Product: r.name,
        SKU: r.sku,
        Barcode: r.barcode || "N/A",
        "System Qty": r.systemStock,
        "Counted Qty": r.countedStock,
        Variance: variance,
        [`Variance Value (${currency})`]: varianceVal,
        Reason: r.reason,
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Stock Count Sheet");
    XLSX.writeFile(workbook, `${countReference}_Count_Sheet.xlsx`);
  };

  // Import Count Sheet from CSV / Excel
  const handleImportSheet = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data: any[] = XLSX.utils.sheet_to_json(ws);

        let updatedCount = 0;
        setTableRows((prev) =>
          prev.map((row) => {
            const match = data.find(
              (d) =>
                (d.SKU && String(d.SKU).toLowerCase() === row.sku.toLowerCase()) ||
                (d.Product && String(d.Product).toLowerCase() === row.name.toLowerCase())
            );
            if (match && match["Counted Qty"] !== undefined) {
              updatedCount++;
              const parsedCount = parseInt(match["Counted Qty"]) || 0;
              return {
                ...row,
                countedStock: parsedCount,
                hasChanged: true,
                reason: match.Reason || row.reason,
              };
            }
            return row;
          })
        );

        setFeedbackMessage({
          type: "success",
          text: `Successfully imported count sheet: updated ${updatedCount} products.`,
        });
      } catch (err: any) {
        setFeedbackMessage({ type: "error", text: "Failed to parse count sheet file." });
      }
      setTimeout(() => setFeedbackMessage(null), 4000);
    };
    reader.readAsBinaryString(file);
  };

  // Finalize or Draft Submission
  const handleSaveAdjustment = (targetStatus: "draft" | "completed") => {
    setFeedbackMessage(null);

    if (!selectedLocationId) {
      setFeedbackMessage({ type: "error", text: "Choose a warehouse/location before saving." });
      return;
    }
    if (targetStatus === "completed") {
      if (!selectedPersonId) {
        setFeedbackMessage({ type: "error", text: "Choose a responsible person before finalizing." });
        return;
      }
      if (calculations.varianceItemsCount === 0) {
        setFeedbackMessage({ type: "error", text: "Nothing to finalize yet — no counted quantities differ from system stock." });
        return;
      }
    }

    // "Save Draft" persists whatever the Status selector shows, but can
    // never itself finalize — only "Save & Finalize Count" applies the
    // count to real stock levels, regardless of what the selector shows.
    const persistedStatus: "draft" | "in_progress" | "completed" =
      targetStatus === "completed" ? "completed" : status === "completed" ? "draft" : status;

    startTransition(async () => {
      const itemsPayload = tableRows
        .filter((r) => r.countedStock !== r.systemStock)
        .map((r) => ({
          productId: r.productId,
          systemStock: r.systemStock,
          countedStock: r.countedStock,
          unitCost: r.costPrice,
          reason: r.reason === "-" ? null : r.reason,
        }));

      try {
        const res = await createStockAdjustment({
          referenceNo: countReference,
          adjustmentDate: countDate,
          locationId: selectedLocationId,
          countType,
          status: persistedStatus,
          responsiblePersonId: selectedPersonId || null,
          adjustmentAccount,
          note: notes,
          items: itemsPayload,
        });

        if (res?.error) {
          setFeedbackMessage({ type: "error", text: res.error });
          return;
        }

        setStatus(persistedStatus);
        setFeedbackMessage({
          type: "success",
          text:
            targetStatus === "completed"
              ? "Stock count finalized — inventory levels have been updated."
              : "Draft saved.",
        });
        if (targetStatus === "completed") {
          setTimeout(() => router.push("/inventory/history"), 1500);
        }
      } catch (err) {
        setFeedbackMessage({
          type: "error",
          text: "Something went wrong saving this count — please try again.",
        });
      }
    });
  };

  if (locations.length === 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="rounded-2xl border border-dashed border-ledger-200 bg-white p-10 text-center dark:border-ledger-700 dark:bg-ink-900">
          <p className="text-sm text-ledger-500 dark:text-ledger-400">
            You need at least one location before you can take stock.{" "}
            <a href="/settings/locations" className="font-medium text-emerald-700 hover:underline">
              Add a location
            </a>
            .
          </p>
        </div>
      </div>
    );
  }

  const selectedPersonName = teamMembers.find((tm) => tm.id === selectedPersonId)?.name ?? currentUserName;

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* ── Top Header & Breadcrumb ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <nav className="flex items-center gap-1.5 text-xs text-ledger-400">
            <Link href="/inventory" className="hover:text-ink-900 dark:hover:text-white transition-colors">
              Inventory
            </Link>
            <span className="opacity-60">&gt;</span>
            <span className="font-medium text-ledger-600 dark:text-ledger-300">
              Stock Taking &amp; Adjustment
            </span>
          </nav>
          <div className="mt-1.5 flex items-center gap-2">
            <h1 className="font-display text-2xl font-bold text-ink-900 dark:text-white">
              Stock Taking &amp; Adjustment
            </h1>
            <button
              title="Count your inventory and reconcile variances"
              className="text-ledger-400 hover:text-ink-900 dark:hover:text-white"
            >
              <Info className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-ledger-400">
            Count your stock and adjust to actual quantities
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="h-9 gap-1.5 rounded-xl border-ledger-200 text-xs font-semibold text-ink-900 hover:bg-ledger-50 dark:border-ledger-700 dark:text-white dark:hover:bg-white/[0.06]"
          >
            <Printer className="h-3.5 w-3.5 text-ledger-500" />
            Print Count Sheet
          </Button>

          <Button
            size="sm"
            onClick={() => handleSaveAdjustment("completed")}
            disabled={isPending || !canManage}
            title={!canManage ? "You don't have permission to finalize stock adjustments" : undefined}
            className="h-9 gap-1.5 rounded-xl bg-emerald-700 px-4 text-xs font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" />
            {isPending ? "Finalizing..." : "Save & Finalize Count"}
          </Button>
        </div>
      </div>

      {/* ── Feedback Notification Banner ───────────────────────────────── */}
      {feedbackMessage && (
        <div
          className={`flex items-center justify-between rounded-xl p-3.5 text-xs ${
            feedbackMessage.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60"
              : "bg-alert-soft text-alert border border-red-200 dark:border-red-900"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMessage.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-alert" />
            )}
            <span className="font-medium">{feedbackMessage.text}</span>
          </div>
          <button
            onClick={() => setFeedbackMessage(null)}
            className="text-ledger-400 hover:text-ink-900 dark:hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ── Collapsible Header Parameters Card ──────────────────────────── */}
      <div className="rounded-2xl border border-ledger-100 bg-white shadow-card dark:border-ledger-700 dark:bg-ink-900 overflow-hidden">
        {/* Header Bar with Hide / Show Toggle */}
        <div className="flex items-center justify-between border-b border-ledger-100 px-6 py-3.5 dark:border-ledger-700">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-emerald-600" />
            <span className="font-semibold text-xs text-ink-900 dark:text-white">
              Adjustment Parameters &amp; Details
            </span>
            {!showParameters && (
              <div className="hidden sm:flex items-center gap-2 ml-3">
                <span className="inline-flex items-center rounded-md bg-ledger-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-ink-900 dark:bg-ledger-800 dark:text-ledger-200">
                  {countReference}
                </span>
                <span className="text-ledger-400 text-xs">·</span>
                <span className="text-xs text-ledger-500 font-medium">
                  {locations.find((l) => l.id === selectedLocationId)?.name || "No location"}
                </span>
                <span className="text-ledger-400 text-xs">·</span>
                <span className="text-xs text-ledger-500 font-medium">{countDate}</span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowParameters(!showParameters)}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold text-ledger-500 hover:bg-ledger-50 hover:text-ink-900 dark:text-ledger-400 dark:hover:bg-white/[0.04] dark:hover:text-white"
          >
            {showParameters ? (
              <>
                <EyeOff className="h-3.5 w-3.5" />
                <span>Hide Details</span>
                <ChevronUp className="h-3.5 w-3.5" />
              </>
            ) : (
              <>
                <Eye className="h-3.5 w-3.5" />
                <span>Show Details</span>
                <ChevronDown className="h-3.5 w-3.5" />
              </>
            )}
          </button>
        </div>

        {/* Form Content */}
        {showParameters && (
        <div className="p-6 pt-4 animate-in fade-in duration-150">
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4 text-xs">
          {/* 1. Count Reference */}
          <div>
            <label className="mb-1.5 block font-semibold text-ledger-600 dark:text-ledger-300">
              Count Reference
            </label>
            <div className="relative flex items-center">
              <input
                type="text"
                value={countReference}
                onChange={(e) => setCountReference(e.target.value)}
                className="h-10 w-full rounded-xl border border-ledger-200 bg-ledger-50/50 px-3 pr-9 font-mono text-xs font-semibold text-ink-900 focus:border-emerald-600 focus:bg-white focus:outline-hidden dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
              />
              <button
                type="button"
                onClick={handleCopyRef}
                title="Copy Reference"
                className="absolute right-2.5 text-ledger-400 hover:text-ink-900 dark:hover:text-white"
              >
                {copiedRef ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* 2. Count Date */}
          <div>
            <label className="mb-1.5 block font-semibold text-ledger-600 dark:text-ledger-300">
              Count Date <span className="text-red-500">*</span>
            </label>
            <div className="relative flex items-center">
              <input
                type="date"
                value={countDate}
                onChange={(e) => setCountDate(e.target.value)}
                className="h-10 w-full rounded-xl border border-ledger-200 bg-white px-3 pr-9 text-xs font-medium text-ink-900 shadow-xs focus:border-emerald-600 focus:outline-hidden dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
              />
              <Calendar className="pointer-events-none absolute right-2.5 h-4 w-4 text-ledger-400" />
            </div>
          </div>

          {/* 3. Count Type Toggle */}
          <div>
            <label className="mb-1.5 block font-semibold text-ledger-600 dark:text-ledger-300">
              Count Type <span className="text-red-500">*</span>
            </label>
            <div className="flex h-10 items-center rounded-xl border border-ledger-200 bg-ledger-50/60 p-1 dark:border-ledger-700 dark:bg-ink-950">
              <button
                type="button"
                onClick={() => handleCountTypeChange("stock_taking")}
                className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all ${
                  countType === "stock_taking"
                    ? "bg-white text-emerald-800 shadow-xs border border-emerald-200/80 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800"
                    : "text-ledger-500 hover:text-ink-900 dark:text-ledger-400"
                }`}
              >
                Stock Taking
              </button>
              <button
                type="button"
                onClick={() => handleCountTypeChange("adjustment_only")}
                className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all ${
                  countType === "adjustment_only"
                    ? "bg-white text-emerald-800 shadow-xs border border-emerald-200/80 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800"
                    : "text-ledger-500 hover:text-ink-900 dark:text-ledger-400"
                }`}
              >
                Adjustment Only
              </button>
            </div>
          </div>

          {/* 4. Status Selector */}
          <div>
            <label className="mb-1.5 block font-semibold text-ledger-600 dark:text-ledger-300">
              Status
            </label>
            <div className="relative">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as "in_progress" | "draft" | "completed")}
                className="h-10 w-full appearance-none rounded-xl border border-ledger-200 bg-blue-50/60 px-3.5 pr-8 text-xs font-semibold text-blue-700 shadow-xs focus:border-blue-600 focus:outline-hidden dark:border-ledger-700 dark:bg-blue-950/40 dark:text-blue-300"
              >
                <option value="in_progress">In Progress</option>
                <option value="draft">Draft</option>
                <option value="completed">Completed</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-blue-600" />
            </div>
          </div>

          {/* Row 2 */}
          {/* 5. Warehouse / Location */}
          <div>
            <label className="mb-1.5 block font-semibold text-ledger-600 dark:text-ledger-300">
              Warehouse / Location <span className="text-red-500">*</span>
            </label>
            <div className="relative flex items-center">
              <MapPin className="pointer-events-none absolute left-3 h-4 w-4 text-ledger-400" />
              <select
                value={selectedLocationId}
                onChange={(e) => handleLocationChange(e.target.value)}
                className="h-10 w-full appearance-none rounded-xl border border-ledger-200 bg-white pl-9 pr-8 text-xs font-medium text-ink-900 shadow-xs focus:border-emerald-600 focus:outline-hidden dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
              >
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} {loc.isPrimary ? "(Primary)" : ""}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-ledger-400" />
            </div>
          </div>

          {/* 6. Responsible Person */}
          <div>
            <label className="mb-1.5 block font-semibold text-ledger-600 dark:text-ledger-300">
              Responsible Person <span className="text-red-500">*</span>
            </label>
            <div className="relative flex items-center">
              <div className="pointer-events-none absolute left-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white">
                {selectedPersonName.slice(0, 1).toUpperCase()}
              </div>
              <select
                value={selectedPersonId}
                onChange={(e) => setSelectedPersonId(e.target.value)}
                className="h-10 w-full appearance-none rounded-xl border border-ledger-200 bg-white pl-9 pr-8 text-xs font-medium text-ink-900 shadow-xs focus:border-emerald-600 focus:outline-hidden dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
              >
                {teamMembers.map((tm) => (
                  <option key={tm.id} value={tm.id}>
                    {tm.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-ledger-400" />
            </div>
          </div>

          {/* 7. Notes */}
          <div>
            <label className="mb-1.5 block font-semibold text-ledger-600 dark:text-ledger-300">
              Notes
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Enter notes (optional)"
              className="h-10 w-full rounded-xl border border-ledger-200 bg-white px-3 text-xs text-ink-900 placeholder:text-ledger-400 shadow-xs focus:border-emerald-600 focus:outline-hidden dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
            />
          </div>

          {/* 8. Adjustment Account */}
          <div>
            <label className="mb-1.5 block font-semibold text-ledger-600 dark:text-ledger-300">
              Adjustment Account
            </label>
            <div className="relative">
              <select
                value={adjustmentAccount}
                onChange={(e) => setAdjustmentAccount(e.target.value)}
                className="h-10 w-full appearance-none rounded-xl border border-ledger-200 bg-white px-3 pr-8 text-xs font-medium text-ink-900 shadow-xs focus:border-emerald-600 focus:outline-hidden dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
              >
                <option value="Inventory Adjustment">Inventory Adjustment</option>
                <option value="Cost of Goods Sold">Cost of Goods Sold (COGS)</option>
                <option value="Stock Loss & Spillage">Stock Loss &amp; Spillage</option>
                <option value="General Inventory Gain">General Inventory Gain</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-ledger-400" />
            </div>
          </div>
        </div>
        </div>
        )}
      </div>

      {/* ── Top Summary & Variance Overview Widgets ── */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Count Summary */}
        <div className="rounded-2xl border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <div className="flex items-center gap-2 border-b border-ledger-100 pb-3 dark:border-ledger-700">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40">
              <FileSpreadsheet className="h-4 w-4" />
            </div>
            <h3 className="font-semibold text-xs text-ink-900 dark:text-white">
              Count Summary
            </h3>
          </div>

          <div className="mt-3.5 space-y-2.5 text-xs">
            <div className="flex justify-between text-ledger-500">
              <span>Total Items (System)</span>
              <span className="font-bold text-ink-900 dark:text-white font-mono">
                {calculations.totalItemsSystem}
              </span>
            </div>
            <div className="flex justify-between text-ledger-500">
              <span>Counted Items</span>
              <span className="font-bold text-ink-900 dark:text-white font-mono">
                {calculations.countedItems}
              </span>
            </div>
            <div className="flex justify-between text-ledger-500">
              <span>Variance Items</span>
              <span className="font-bold text-red-600 dark:text-red-400 font-mono">
                {calculations.varianceItemsCount}
              </span>
            </div>
            <div className="flex justify-between text-ledger-500">
              <span>Total Variance (Qty)</span>
              <span className="font-bold text-red-600 dark:text-red-400 font-mono">
                {calculations.totalVarianceQty}
              </span>
            </div>
            <div className="flex justify-between border-t border-ledger-100 pt-2 text-ledger-500 dark:border-ledger-700">
              <span>Total Variance Value</span>
              <span className="font-bold text-red-600 dark:text-red-400 font-mono">
                {calculations.totalVarianceValue.toFixed(2)} {currency}
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Variance Breakdown Donut Chart Card */}
        <div className="rounded-2xl border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <div className="flex items-center gap-2 border-b border-ledger-100 pb-3 dark:border-ledger-700">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40">
              <Layers className="h-4 w-4" />
            </div>
            <h3 className="font-semibold text-xs text-ink-900 dark:text-white">
              Variance Breakdown
            </h3>
          </div>

          <div className="mt-3 flex items-center justify-between">
            {/* Donut Chart with Center Text */}
            <div className="relative h-24 w-24 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={calculations.donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={28}
                    outerRadius={42}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {calculations.donutData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[9px] text-ledger-400 font-medium leading-none">Total</span>
                <span className="font-display font-bold text-sm text-ink-900 dark:text-white leading-tight">
                  {calculations.varianceItemsCount}
                </span>
              </div>
            </div>

            {/* Legend with Percentages */}
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-600" />
                <span className="text-ledger-600 dark:text-ledger-300 text-[11px]">
                  Positive: <strong className="text-ink-900 dark:text-white">{calculations.positiveCount} ({calculations.posPct}%)</strong>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-red-600" />
                <span className="text-ledger-600 dark:text-ledger-300 text-[11px]">
                  Negative: <strong className="text-ink-900 dark:text-white">{calculations.negativeCount} ({calculations.negPct}%)</strong>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-slate-400" />
                <span className="text-ledger-600 dark:text-ledger-300 text-[11px]">
                  Zero: <strong className="text-ink-900 dark:text-white">{calculations.zeroCount} ({calculations.zeroPct}%)</strong>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Items Impact & Totals (consolidated) */}
        <div className="rounded-2xl border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <div className="flex items-center gap-2 border-b border-ledger-100 pb-3 dark:border-ledger-700">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-50 text-purple-600 dark:bg-purple-950/40">
              <Wallet className="h-4 w-4" />
            </div>
            <h3 className="font-semibold text-xs text-ink-900 dark:text-white">
              Adjustment Impact
            </h3>
          </div>

          <div className="mt-3.5 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-ledger-500">Items to Increase</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                +{calculations.positiveQty} ({calculations.positiveValue.toFixed(2)} {currency})
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ledger-500">Items to Decrease</span>
              <span className="font-bold text-red-600 dark:text-red-400">
                -{calculations.negativeQty} (-{calculations.negativeValue.toFixed(2)} {currency})
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ledger-500">Unchanged Items</span>
              <span className="font-mono text-ledger-400">{calculations.zeroCount} items</span>
            </div>
            <div className="flex items-center justify-between border-t border-ledger-100 pt-2 dark:border-ledger-700">
              <span className="font-semibold text-ink-900 dark:text-white">Net Impact</span>
              <span
                className={`font-bold font-mono ${
                  calculations.netAdjustmentValue < 0
                    ? "text-red-600 dark:text-red-400"
                    : calculations.netAdjustmentValue > 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-ink-900 dark:text-white"
                }`}
              >
                {calculations.netAdjustmentValue.toFixed(2)} {currency}
              </span>
            </div>
          </div>
        </div>

        {/* Card 4: Quick Actions */}
        <div className="rounded-2xl border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <div className="flex items-center gap-2 border-b border-ledger-100 pb-3 dark:border-ledger-700">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-ledger-100 text-ledger-600 dark:bg-white/[0.06] dark:text-ledger-300">
              <FileSpreadsheet className="h-4 w-4" />
            </div>
            <h3 className="font-semibold text-xs text-ink-900 dark:text-white">
              Quick Actions
            </h3>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            accept=".csv,.xlsx,.xls"
            onChange={handleImportSheet}
            className="hidden"
          />

          <div className="mt-3.5 space-y-2 text-xs">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="w-full justify-start gap-2.5 rounded-xl border-ledger-200 text-xs font-semibold text-ledger-700 hover:bg-ledger-50 dark:border-ledger-700 dark:text-ledger-200 dark:hover:bg-white/[0.04]"
            >
              <Upload className="h-4 w-4 text-emerald-600" />
              Import Count Sheet
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExportSheet}
              className="w-full justify-start gap-2.5 rounded-xl border-ledger-200 text-xs font-semibold text-ledger-700 hover:bg-ledger-50 dark:border-ledger-700 dark:text-ledger-200 dark:hover:bg-white/[0.04]"
            >
              <Download className="h-4 w-4 text-emerald-600" />
              Export Count Sheet
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleSaveAdjustment("completed")}
              disabled={isPending || !canManage}
              title={!canManage ? "You don't have permission to apply stock adjustments" : undefined}
              className="w-full justify-start gap-2.5 rounded-xl border-ledger-200 text-xs font-semibold text-ledger-700 hover:bg-ledger-50 dark:border-ledger-700 dark:text-ledger-200 dark:hover:bg-white/[0.04]"
            >
              <Check className="h-4 w-4 text-emerald-600" />
              Apply Adjustment
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (confirm("Are you sure you want to discard this count?")) {
                  router.push("/inventory/history");
                }
              }}
              className="w-full justify-start gap-2.5 rounded-xl border-red-200 text-xs font-semibold text-red-600 hover:bg-red-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40"
            >
              <Trash2 className="h-4 w-4 text-red-600" />
              Discard Count
            </Button>
          </div>
        </div>
      </div>

      {/* ── Collapsible Detailed Adjustment Preview (5-card breakdown) ──── */}
      <div className="rounded-2xl border border-ledger-100 bg-white shadow-card dark:border-ledger-700 dark:bg-ink-900 overflow-hidden">
        <div className="flex items-center justify-between border-b border-ledger-100 px-6 py-3.5 dark:border-ledger-700">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            <span className="font-semibold text-xs text-ink-900 dark:text-white">
              Detailed Adjustment Preview
            </span>
            {!showAdjustmentPreview && (
              <div className="hidden sm:flex items-center gap-2 ml-3">
                <span className="text-xs text-ledger-500 font-medium">Net Impact:</span>
                <span
                  className={`font-mono text-xs font-bold ${
                    calculations.netAdjustmentValue < 0
                      ? "text-red-600 dark:text-red-400"
                      : calculations.netAdjustmentValue > 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-ink-900 dark:text-white"
                  }`}
                >
                  {formatMoney(calculations.netAdjustmentValue)} {currency}
                </span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowAdjustmentPreview(!showAdjustmentPreview)}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold text-ledger-500 hover:bg-ledger-50 hover:text-ink-900 dark:text-ledger-400 dark:hover:bg-white/[0.04] dark:hover:text-white"
          >
            {showAdjustmentPreview ? (
              <>
                <EyeOff className="h-3.5 w-3.5" />
                <span>Hide Breakdown</span>
                <ChevronUp className="h-3.5 w-3.5" />
              </>
            ) : (
              <>
                <Eye className="h-3.5 w-3.5" />
                <span>Show Breakdown</span>
                <ChevronDown className="h-3.5 w-3.5" />
              </>
            )}
          </button>
        </div>

        {showAdjustmentPreview && (
          <div className="p-4 animate-in fade-in duration-150">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {/* Card 1: Review Prompt */}
              <div className="flex items-center gap-3 rounded-2xl border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-bold text-xs text-ink-900 dark:text-white">
                    Adjustment Preview
                  </h4>
                  <p className="text-[11px] text-ledger-400">
                    Review the impact of this stock taking
                  </p>
                </div>
              </div>

              {/* Card 2: Items to Increase */}
              <div className="flex items-center justify-between rounded-2xl border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                    <ArrowUp className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="text-[11px] font-medium text-ledger-400">Items to Increase</span>
                    <p className="font-display text-xl font-bold text-ink-900 dark:text-white">
                      {calculations.positiveCount}
                    </p>
                  </div>
                </div>
                <div className="text-right text-xs">
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    +{calculations.positiveQty} Qty
                  </span>
                  <span className="block text-[11px] text-emerald-600/90 font-medium">
                    +{formatMoney(calculations.positiveValue)} {currency}
                  </span>
                </div>
              </div>

              {/* Card 3: Items to Decrease */}
              <div className="flex items-center justify-between rounded-2xl border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400">
                    <ArrowDown className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="text-[11px] font-medium text-ledger-400">Items to Decrease</span>
                    <p className="font-display text-xl font-bold text-ink-900 dark:text-white">
                      {calculations.negativeCount}
                    </p>
                  </div>
                </div>
                <div className="text-right text-xs">
                  <span className="font-bold text-red-600 dark:text-red-400">
                    -{calculations.negativeQty} Qty
                  </span>
                  <span className="block text-[11px] text-red-600/90 font-medium">
                    -{formatMoney(calculations.negativeValue)} {currency}
                  </span>
                </div>
              </div>

              {/* Card 4: No Change */}
              <div className="flex items-center justify-between rounded-2xl border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ledger-100 text-ledger-500 dark:bg-white/[0.06] dark:text-ledger-300">
                    <Equal className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="text-[11px] font-medium text-ledger-400">No Change</span>
                    <p className="font-display text-xl font-bold text-ink-900 dark:text-white">
                      {calculations.zeroCount}
                    </p>
                  </div>
                </div>
                <div className="text-right text-xs text-ledger-400">
                  <span>0 Qty</span>
                  <span className="block text-[11px]">0.00 {currency}</span>
                </div>
              </div>

              {/* Card 5: Net Adjustment Value */}
              <div className="flex items-center justify-between rounded-2xl border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400">
                    <Wallet className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="text-[11px] font-medium text-ledger-400">Net Adjustment Value</span>
                    <p
                      className={`font-display text-lg font-bold ${
                        calculations.netAdjustmentValue < 0
                          ? "text-red-600 dark:text-red-400"
                          : calculations.netAdjustmentValue > 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-ink-900 dark:text-white"
                      }`}
                    >
                      {formatMoney(calculations.netAdjustmentValue)} {currency}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Counting Table Section — full width ──────────────────────────── */}
      <div className="space-y-4">
        {/* Table Header Filter Tabs & Search / Barcode Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Filter Tabs */}
          <div className="flex items-center gap-6 border-b border-ledger-200 pb-0 text-sm dark:border-ledger-700">
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={`pb-2.5 text-xs font-semibold transition-colors ${
                activeTab === "all"
                  ? "border-b-2 border-emerald-600 text-emerald-700 dark:border-emerald-400 dark:text-emerald-400"
                  : "text-ledger-500 hover:text-ink-900 dark:text-ledger-400 dark:hover:text-white"
              }`}
            >
              All Items
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("counted")}
              className={`pb-2.5 text-xs font-semibold transition-colors ${
                activeTab === "counted"
                  ? "border-b-2 border-emerald-600 text-emerald-700 dark:border-emerald-400 dark:text-emerald-400"
                  : "text-ledger-500 hover:text-ink-900 dark:text-ledger-400 dark:hover:text-white"
              }`}
            >
              Counted ({calculations.countedItems})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("variance")}
              className={`pb-2.5 text-xs font-semibold transition-colors ${
                activeTab === "variance"
                  ? "border-b-2 border-emerald-600 text-emerald-700 dark:border-emerald-400 dark:text-emerald-400"
                  : "text-ledger-500 hover:text-ink-900 dark:text-ledger-400 dark:hover:text-white"
              }`}
            >
              Variance ({calculations.varianceItemsCount})
            </button>
          </div>

          {/* Search & Scan Barcode */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-ledger-400" />
              <input
                type="text"
                placeholder="Search by product name, SKU or barcode..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 w-64 rounded-xl border border-ledger-200 bg-white pl-8 pr-3 text-xs text-ink-900 placeholder:text-ledger-400 shadow-xs focus:border-emerald-600 focus:outline-hidden dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
              />
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowBarcodeScanner(true)}
              className="h-9 gap-1.5 rounded-xl border-emerald-300 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
            >
              <BarcodeIcon className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              Scan Barcode
            </Button>
          </div>
        </div>

        {/* Counting Table */}
        <div className="overflow-hidden rounded-2xl border border-ledger-100 bg-white shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-ledger-100 bg-ledger-50/70 text-[11px] font-semibold uppercase tracking-wider text-ledger-500 dark:border-ledger-700 dark:bg-white/[0.03]">
                <tr>
                  <th className="w-8 px-3 py-3 text-center">#</th>
                  <th className="px-3 py-3">Product</th>
                  <th className="px-3 py-3">SKU</th>
                  <th className="px-3 py-3 text-center font-bold">
                    System Qty <span className="block text-[9px] font-normal text-ledger-400">(On Hand)</span>
                  </th>
                  <th className="px-3 py-3 text-center font-bold">
                    Counted Qty <span className="block text-[9px] font-normal text-ledger-400">(Actual)</span>
                  </th>
                  <th className="px-3 py-3 text-center">Variance</th>
                  <th className="px-3 py-3 text-right">
                    Variance Value <span className="block text-[9px] font-normal text-ledger-400">({currency})</span>
                  </th>
                  <th className="px-3 py-3">Reason</th>
                  <th className="w-20 px-3 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ledger-100 dark:divide-ledger-700/50">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-ledger-400">
                      {tableRows.length === 0
                        ? "No items yet — search for a product above or scan a barcode to add the first item to this count."
                        : "No inventory products match the search query or filter."}
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row, index) => {
                    const variance = row.countedStock - row.systemStock;
                    const varianceVal = variance * row.costPrice;
                    const hasVariance = variance !== 0;

                    return (
                      <tr
                        key={row.productId}
                        className="transition-colors hover:bg-ledger-50/40 dark:hover:bg-white/[0.02]"
                      >
                        {/* Row Number */}
                        <td className="px-3 py-3 text-center text-ledger-400 font-mono text-[11px]">
                          {index + 1}
                        </td>

                        {/* Product Info */}
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-ledger-100 bg-white p-1 dark:border-ledger-700 dark:bg-ink-950">
                              {row.imageUrl ? (
                                <Image
                                  src={row.imageUrl}
                                  alt={row.name}
                                  fill
                                  className="object-contain"
                                  unoptimized
                                />
                              ) : (
                                <Package className="h-4 w-4 text-ledger-400" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-ink-900 dark:text-white">
                                {row.name}
                              </p>
                              {row.category && (
                                <p className="text-[10px] text-ledger-400">{row.category}</p>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* SKU */}
                        <td className="px-3 py-3 font-mono text-xs text-ledger-600 dark:text-ledger-300">
                          {row.sku}
                        </td>

                        {/* System Qty (On Hand) */}
                        <td className="px-3 py-3 text-center font-bold text-emerald-700 dark:text-emerald-400">
                          {row.systemStock}
                        </td>

                        {/* Counted Qty Input */}
                        <td className="px-3 py-3 text-center">
                          <input
                            type="number"
                            min="0"
                            value={row.countedStock}
                            onChange={(e) =>
                              handleCountChange(row.productId, parseInt(e.target.value) || 0)
                            }
                            className={`h-8 w-20 rounded-lg border px-2 text-center text-xs font-bold text-ink-900 focus:outline-hidden dark:bg-ink-950 dark:text-white ${
                              row.hasChanged
                                ? "border-emerald-500 bg-emerald-50/40 text-emerald-800 focus:border-emerald-600 dark:border-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300"
                                : "border-ledger-200 bg-white focus:border-emerald-600 dark:border-ledger-700"
                            }`}
                          />
                        </td>

                        {/* Variance */}
                        <td className="px-3 py-3 text-center font-bold">
                          <span
                            className={
                              variance > 0
                                ? "text-emerald-600 dark:text-emerald-400"
                                : variance < 0
                                ? "text-red-600 dark:text-red-400"
                                : "text-ink-900 dark:text-white font-normal"
                            }
                          >
                            {variance > 0 ? `+${variance}` : variance}
                          </span>
                        </td>

                        {/* Variance Value */}
                        <td className="px-3 py-3 text-right font-bold">
                          <span
                            className={
                              varianceVal > 0
                                ? "text-emerald-600 dark:text-emerald-400"
                                : varianceVal < 0
                                ? "text-red-600 dark:text-red-400"
                                : "text-ink-900 dark:text-white font-normal"
                            }
                          >
                            {formatMoney(varianceVal)}
                          </span>
                        </td>

                        {/* Reason Selector */}
                        <td className="px-3 py-3">
                          {hasVariance ? (
                            <select
                              value={row.reason}
                              onChange={(e) => handleReasonChange(row.productId, e.target.value)}
                              className="h-7 rounded-lg border border-ledger-200 bg-white px-2 text-[11px] text-ink-900 focus:border-emerald-600 focus:outline-hidden dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
                            >
                              {REASONS.map((r) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-ledger-400 text-center block">-</span>
                          )}
                        </td>

                        {/* Action Buttons */}
                        <td className="px-3 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleResetRow(row.productId)}
                              title="Reset count to system stock"
                              className="rounded-md p-1 text-ledger-400 hover:bg-ledger-100 hover:text-ink-900 dark:hover:bg-white/[0.06] dark:hover:text-white"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteRow(row.productId)}
                              title="Remove item from count"
                              className="rounded-md p-1 text-ledger-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Bottom Add Other Item Bar */}
          <div className="border-t border-ledger-100 bg-ledger-50/40 p-3 text-center dark:border-ledger-700 dark:bg-white/[0.02]">
            <button
              type="button"
              onClick={() => setShowProductPicker(true)}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-800 dark:text-emerald-400"
            >
              <Plus className="h-4 w-4" />
              Add Other Item
            </button>
          </div>
        </div>
      </div>

      {/* ── Bottom Action Footer ────────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-3 border-t border-ledger-100 pt-5 dark:border-ledger-700">
        <Button
          type="button"
          variant="outline"
          onClick={() => handleSaveAdjustment("draft")}
          disabled={isPending || !canManage}
          title={!canManage ? "You don't have permission to save stock adjustments" : undefined}
          className="rounded-xl border-ledger-200 px-5 text-xs font-semibold text-ink-900 hover:bg-ledger-50 dark:border-ledger-700 dark:text-white dark:hover:bg-white/[0.06]"
        >
          Save Draft
        </Button>

        <Button
          type="button"
          onClick={() => handleSaveAdjustment("completed")}
          disabled={isPending || !canManage}
          title={!canManage ? "You don't have permission to finalize stock adjustments" : undefined}
          className="rounded-xl bg-emerald-700 px-6 text-xs font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:opacity-50"
        >
          Save &amp; Finalize Count
        </Button>
      </div>

      {/* ── Barcode Scanner Modal ──────────────────────────────────────── */}
      {showBarcodeScanner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-md rounded-2xl border border-ledger-100 bg-white p-6 shadow-2xl dark:border-ledger-700 dark:bg-ink-900">
            <div className="flex items-center justify-between border-b border-ledger-100 pb-4 dark:border-ledger-700">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40">
                  <BarcodeIcon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-ink-900 dark:text-white">Scan Barcode / SKU</h3>
                  <p className="text-xs text-ledger-400">Position scanner or enter barcode digits</p>
                </div>
              </div>
              <button
                onClick={() => setShowBarcodeScanner(false)}
                className="rounded-lg p-1 text-ledger-400 hover:bg-ledger-50 dark:hover:bg-white/[0.06]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleBarcodeSubmit} className="mt-5 space-y-4">
              <div>
                <label className="mb-1.5 block font-semibold text-xs text-ink-900 dark:text-white">
                  Barcode or SKU Code
                </label>
                <input
                  type="text"
                  autoFocus
                  placeholder="e.g. 880609472111 or SM-A155F-BL..."
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  className="w-full rounded-xl border border-ledger-200 px-3.5 py-2.5 text-xs font-mono text-ink-900 focus:border-emerald-600 focus:outline-hidden dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowBarcodeScanner(false)}
                  className="rounded-xl text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="rounded-xl bg-emerald-700 text-xs text-white hover:bg-emerald-800"
                >
                  Record Item
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Product Picker Modal ────────────────────────────────────────── */}
      {showProductPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-lg rounded-2xl border border-ledger-100 bg-white p-6 shadow-2xl dark:border-ledger-700 dark:bg-ink-900">
            <div className="flex items-center justify-between border-b border-ledger-100 pb-4 dark:border-ledger-700">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40">
                  <Package className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-ink-900 dark:text-white">Add Product to Count</h3>
                  <p className="text-xs text-ledger-400">Select any product from your catalog</p>
                </div>
              </div>
              <button
                onClick={() => setShowProductPicker(false)}
                className="rounded-lg p-1 text-ledger-400 hover:bg-ledger-50 dark:hover:bg-white/[0.06]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 max-h-80 overflow-y-auto space-y-2 pr-1">
              {products
                .filter((p) => p.isActive !== false)
                .map((p) => (
                  <div
                    key={p.id}
                    onClick={() => handleAddProduct(p)}
                    className="flex items-center justify-between rounded-xl border border-ledger-100 p-3 text-xs transition-colors hover:bg-emerald-50/50 hover:border-emerald-200 cursor-pointer dark:border-ledger-700 dark:hover:bg-white/[0.04]"
                  >
                    <div>
                      <p className="font-semibold text-ink-900 dark:text-white">{p.name}</p>
                      <p className="font-mono text-[11px] text-ledger-400">{p.sku}</p>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-emerald-700 dark:text-emerald-400">
                        {availableAt(p, selectedLocationId)} in stock
                      </span>
                    </div>
                  </div>
                ))}
            </div>

            <div className="mt-5 flex justify-end border-t border-ledger-100 pt-3 dark:border-ledger-700">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowProductPicker(false)}
                className="rounded-xl text-xs"
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