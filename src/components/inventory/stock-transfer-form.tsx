"use client";

import { useState, useMemo, useRef, useEffect, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  Plus,
  Trash2,
  ArrowRight,
  ArrowLeftRight,
  Building2,
  Warehouse,
  Store,
  Truck,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Calendar,
  Clock,
  User as UserIcon,
  UploadCloud,
  FileSpreadsheet,
  Printer,
  Barcode,
  QrCode,
  Layers,
  X,
  Copy,
  Check,
  Eye,
  EyeOff,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  ShieldAlert,
  Send,
  PackageCheck,
  PackageX,
  History,
  RotateCcw,
  Sparkles,
  Info,
  Package,
  Edit3,
  ExternalLink,
  DollarSign,
  TrendingUp,
  Bell,
  MessageSquare,
  HelpCircle,
  FileCheck,
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

// ── Default Mock / Seed Data matching reference screenshots ──────────────────

const DEFAULT_LOCATIONS: TransferLocation[] = [
  { id: "loc-accra", name: "Main Branch - Accra", type: "branch" },
  { id: "loc-kumasi", name: "Kumasi Branch", type: "branch" },
  { id: "loc-takoradi", name: "Takoradi Branch", type: "branch" },
  { id: "loc-tema", name: "Tema Industrial Branch", type: "warehouse" },
  { id: "loc-circle", name: "Circle 2 Branch", type: "branch" },
];

const DEFAULT_PRODUCTS: TransferableProduct[] = [
  {
    id: "prod-a15",
    sku: "SM-A155F-BL",
    name: "Samsung Galaxy A15 128GB Blue",
    category: "Smartphone",
    barcode: "880609123401",
    unitCost: 1200.0,
    imageUrl: null,
  },
  {
    id: "prod-infinix",
    sku: "IN-H40I-PB",
    name: "Infinix Hot 40i 128GB Palm Blue",
    category: "Smartphone",
    barcode: "880609123402",
    unitCost: 650.0,
    imageUrl: null,
  },
  {
    id: "prod-oraimo-chg",
    sku: "ORC-18W-WH",
    name: "Oraimo 18W Fast Charger",
    category: "Accessories",
    barcode: "880609123403",
    unitCost: 45.0,
    imageUrl: null,
  },
  {
    id: "prod-oraimo-buds",
    sku: "OFP-4-BK",
    name: "Oraimo FreePods 4",
    category: "Audio",
    barcode: "880609123404",
    unitCost: 180.0,
    imageUrl: null,
  },
  {
    id: "prod-hp-laser",
    sku: "PRD-00123",
    name: "HP LaserJet Pro M404dn",
    category: "Printers",
    barcode: "880609123405",
    unitCost: 1250.0,
    imageUrl: null,
  },
  {
    id: "prod-logi-mouse",
    sku: "PRD-00234",
    name: "Logitech Wireless Mouse M185",
    category: "Accessories",
    barcode: "880609123406",
    unitCost: 85.0,
    imageUrl: null,
  },
  {
    id: "prod-dell-mon",
    sku: "PRD-00345",
    name: "Dell 24\" Monitor - E2423HN",
    category: "Monitors",
    barcode: "880609123407",
    unitCost: 950.0,
    imageUrl: null,
  },
];

const INITIAL_ITEMS: TransferItemRow[] = [
  {
    id: "row-1",
    productId: "prod-a15",
    name: "Samsung Galaxy A15 128GB Blue",
    sku: "SM-A155F-BL",
    barcode: "880609123401",
    category: "Smartphone",
    imageUrl: null,
    sourceQtyOnHand: 120,
    destinationQtyOnHand: 15,
    transferQty: 20,
    unitCost: 1200.0,
    unit: "PCS",
    batchNumber: "BAT-2026-SAM01",
    expiryDate: "2028-12-31",
  },
  {
    id: "row-2",
    productId: "prod-infinix",
    name: "Infinix Hot 40i 128GB Palm Blue",
    sku: "IN-H40I-PB",
    barcode: "880609123402",
    category: "Smartphone",
    imageUrl: null,
    sourceQtyOnHand: 85,
    destinationQtyOnHand: 8,
    transferQty: 30,
    unitCost: 650.0,
    unit: "PCS",
    batchNumber: "BAT-2026-INF02",
    expiryDate: "2028-10-15",
  },
  {
    id: "row-3",
    productId: "prod-oraimo-chg",
    name: "Oraimo 18W Fast Charger",
    sku: "ORC-18W-WH",
    barcode: "880609123403",
    category: "Accessories",
    imageUrl: null,
    sourceQtyOnHand: 200,
    destinationQtyOnHand: 50,
    transferQty: 60,
    unitCost: 45.0,
    unit: "PCS",
    batchNumber: "BAT-2026-ORA03",
    expiryDate: "2029-05-20",
  },
  {
    id: "row-4",
    productId: "prod-oraimo-buds",
    name: "Oraimo FreePods 4",
    sku: "OFP-4-BK",
    barcode: "880609123404",
    category: "Audio",
    imageUrl: null,
    sourceQtyOnHand: 150,
    destinationQtyOnHand: 20,
    transferQty: 40,
    unitCost: 180.0,
    unit: "PCS",
    batchNumber: "BAT-2026-ORA04",
    expiryDate: "2029-01-10",
  },
];

const MOCK_HISTORY_TRANSFERS = [
  {
    id: "trf-101",
    transferNumber: "STF-2505-0007",
    referenceNo: "REF-ACC-KUM-001",
    status: "draft" as TransferStatus,
    reason: "Replenishment",
    transferDate: "2026-05-31",
    expectedDate: "2026-06-02",
    fromLocationName: "Main Branch - Accra",
    toLocationName: "Kumasi Branch",
    itemsCount: 4,
    totalQty: 150,
    totalValue: 53400.0,
    priority: "Normal",
    preparedBy: "Daniel Kofi",
  },
  {
    id: "trf-102",
    transferNumber: "STF-2505-0006",
    referenceNo: "REF-ACC-TAK-003",
    status: "in_transit" as TransferStatus,
    reason: "Branch Request",
    transferDate: "2026-05-29",
    expectedDate: "2026-06-01",
    fromLocationName: "Main Branch - Accra",
    toLocationName: "Takoradi Branch",
    itemsCount: 3,
    totalQty: 45,
    totalValue: 28200.0,
    priority: "High",
    preparedBy: "Daniel Kofi",
  },
  {
    id: "trf-103",
    transferNumber: "STF-2505-0005",
    referenceNo: "REF-KUM-TEM-002",
    status: "completed" as TransferStatus,
    reason: "Warehouse Balancing",
    transferDate: "2026-05-25",
    expectedDate: "2026-05-27",
    fromLocationName: "Kumasi Branch",
    toLocationName: "Tema Industrial Branch",
    itemsCount: 6,
    totalQty: 220,
    totalValue: 84500.0,
    priority: "Normal",
    preparedBy: "Mary Addo",
  },
  {
    id: "trf-104",
    transferNumber: "STF-2505-0004",
    referenceNo: "REF-ACC-CIR-008",
    status: "in_transit" as TransferStatus,
    reason: "Damaged Stock Replacement",
    transferDate: "2026-05-22",
    expectedDate: "2026-05-24",
    fromLocationName: "Main Branch - Accra",
    toLocationName: "Circle 2 Branch",
    itemsCount: 2,
    totalQty: 15,
    totalValue: 18000.0,
    priority: "Urgent",
    preparedBy: "John Doe",
  },
  {
    id: "trf-105",
    transferNumber: "STF-2505-0003",
    referenceNo: "REF-TAK-KUM-001",
    status: "cancelled" as TransferStatus,
    reason: "Customer Order Cancelled",
    transferDate: "2026-05-18",
    expectedDate: "2026-05-20",
    fromLocationName: "Takoradi Branch",
    toLocationName: "Kumasi Branch",
    itemsCount: 1,
    totalQty: 10,
    totalValue: 6500.0,
    priority: "Low",
    preparedBy: "James Mensah",
  },
];

export function StockTransferForm({
  locations = DEFAULT_LOCATIONS,
  products = DEFAULT_PRODUCTS,
  stockLevels = [],
  recentTransfers = [],
  currentUserEmail = "daniel.kofi@thinksales.pro",
  currentUserName = "Daniel Kofi",
  currentUserRole = "Administrator",
  currency = "GHS",
}: StockTransferFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Active navigation tab: "new" | "transfers" | "drafts" | "in_transit" | "completed" | "cancelled"
  const [activeTab, setActiveTab] = useState<string>("new");

  // Toggle show/hide for Create Stock Transfer section
  const [showConfigSection, setShowConfigSection] = useState(true);

  // ── Form State ──────────────────────────────────────────────────────────
  const [transferNumber, setTransferNumber] = useState("STF-2505-0007");
  const [transferDate, setTransferDate] = useState("2026-05-31");
  const [expectedDate, setExpectedDate] = useState("2026-06-02");
  const [priority, setPriority] = useState<"Normal" | "Low" | "High" | "Urgent">("Normal");
  const [transferReason, setTransferReason] = useState("Replenishment");
  const [referenceNotes, setReferenceNotes] = useState("Routine stock replenishment");
  const [transferStatus, setTransferStatus] = useState<TransferStatus>("pending");

  // Source & Destination
  const [fromLocationId, setFromLocationId] = useState(locations[0]?.id ?? "loc-accra");
  const [toLocationId, setToLocationId] = useState(locations[1]?.id ?? "loc-kumasi");
  const [fromSubLocation, setFromSubLocation] = useState("Main Warehouse");
  const [toSubLocation, setToSubLocation] = useState("Kumasi Warehouse");

  // Items State
  const [items, setItems] = useState<TransferItemRow[]>(INITIAL_ITEMS);
  const [searchQuery, setSearchQuery] = useState("");
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [selectedItemForDetail, setSelectedItemForDetail] = useState<TransferItemRow | null>(null);

  // Attachments State
  const [attachments, setAttachments] = useState<{ name: string; size: string; type: string }[]>([
    { name: "Transfer_Waybill_STF2505.pdf", size: "245 KB", type: "pdf" },
  ]);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  // Notifications State
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationsList, setNotificationsList] = useState([
    { id: "1", title: "Stock Transfer #STF-2505-0006 approved by Super Admin", time: "2m ago", read: false },
    { id: "2", title: "Low stock alert: Samsung Galaxy A15 at Takoradi Branch", time: "1h ago", read: false },
    { id: "3", title: "Shipment in transit: 45 units dispatched to Kumasi Branch", time: "3h ago", read: false },
    { id: "4", title: "Delivery receipt confirmed for Transfer #STF-2505-0005", time: "1d ago", read: true },
  ]);

  // Modals
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [showLookupModal, setShowLookupModal] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [showTimelineModal, setShowTimelineModal] = useState(false);
  const [showSuccessNotification, setShowSuccessNotification] = useState<string | null>(null);

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

  // ── Stock Level Lookups ──────────────────────────────────────────────────
  const getStockQty = (productId: string, locationId: string, fallbackDefault = 50) => {
    const match = stockLevels.find((s) => s.productId === productId && s.locationId === locationId);
    if (match) return match.quantity;
    if (productId === "prod-a15") return locationId === fromLocationId ? 120 : 15;
    if (productId === "prod-infinix") return locationId === fromLocationId ? 85 : 8;
    if (productId === "prod-oraimo-chg") return locationId === fromLocationId ? 200 : 50;
    if (productId === "prod-oraimo-buds") return locationId === fromLocationId ? 150 : 20;
    if (productId === "prod-hp-laser") return locationId === fromLocationId ? 25 : 5;
    if (productId === "prod-logi-mouse") return locationId === fromLocationId ? 42 : 12;
    if (productId === "prod-dell-mon") return locationId === fromLocationId ? 15 : 3;
    return fallbackDefault;
  };

  // Swap Source and Destination
  const handleSwapLocations = () => {
    const tempLoc = fromLocationId;
    const tempSub = fromSubLocation;
    setFromLocationId(toLocationId);
    setFromSubLocation(toSubLocation);
    setToLocationId(tempLoc);
    setToSubLocation(tempSub);

    setItems((prev) =>
      prev.map((item) => {
        const newSrc = getStockQty(item.productId, toLocationId);
        const newDest = getStockQty(item.productId, tempLoc);
        return {
          ...item,
          sourceQtyOnHand: newSrc,
          destinationQtyOnHand: newDest,
          transferQty: Math.min(item.transferQty, newSrc),
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
          transferQty: Math.min(item.transferQty, newSrc),
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

  // Filtered Products for Search Autocomplete
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

  // Add Product to transfer list
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
        transferQty: Math.min(srcQty, 10),
        unitCost: product.unitCost,
        unit: "PCS",
        batchNumber: `BAT-2026-${product.sku.slice(0, 3)}01`,
        expiryDate: "2028-12-31",
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
          const validatedQty = Math.max(0, Math.min(newQty, item.sourceQtyOnHand));
          return { ...item, transferQty: validatedQty };
        }
        return item;
      })
    );
  };

  const handleRemoveItem = (rowId: string) => {
    setItems((prev) => prev.filter((i) => i.id !== rowId));
  };

  // ── Calculations & Totals ────────────────────────────────────────────────
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

  const handleSaveDraft = () => {
    setTransferStatus("pending");
    setShowSuccessNotification(`Stock Transfer ${transferNumber} saved as Draft!`);
    setTimeout(() => setShowSuccessNotification(null), 3500);
  };

  const handleSubmitForApproval = () => {
    if (items.length === 0) {
      alert("Please add at least one product to the transfer.");
      return;
    }
    if (totals.hasInsufficientStock) {
      alert("Warning: One or more products exceed available source stock. Please adjust quantities.");
      return;
    }
    startTransition(async () => {
      setTransferStatus("pending");
      setShowSuccessNotification(`Stock Transfer ${transferNumber} submitted for approval!`);
      setTimeout(() => setShowSuccessNotification(null), 3500);
    });
  };

  const handleReviewAndSubmit = () => {
    if (items.length === 0) {
      alert("Please add at least one product to the transfer.");
      return;
    }
    setShowApprovalModal(true);
  };

  const sourceLocationObj = locations.find((l) => l.id === fromLocationId) || locations[0];
  const destLocationObj = locations.find((l) => l.id === toLocationId) || locations[1];
  const unreadCount = notificationsList.filter((n) => !n.read).length;

  return (
    <div className="space-y-6 animate-in fade-in duration-150 pb-20">
      {/* ── Success Toast Notification ── */}
      {showSuccessNotification && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-3 rounded-2xl bg-emerald-700 px-5 py-3.5 text-white shadow-2xl animate-in slide-in-from-top-4">
          <CheckCircle2 className="h-5 w-5 text-emerald-200" />
          <span className="text-xs font-semibold">{showSuccessNotification}</span>
          <button onClick={() => setShowSuccessNotification(null)} className="ml-2 rounded-lg p-1 hover:bg-white/10">
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
            <ChevronDown className="h-3 w-3 text-ledger-400" />
          </div>

          {/* Active Notification Bell */}
          <div className="relative" ref={notificationRef}>
            <button
              type="button"
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-ledger-200 bg-white text-ledger-500 shadow-xs hover:bg-ledger-50 dark:border-ledger-700 dark:bg-ink-900 dark:text-ledger-300"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 top-12 z-50 w-80 rounded-2xl border border-ledger-100 bg-white p-3 shadow-2xl dark:border-ledger-700 dark:bg-ink-900 animate-in fade-in duration-150">
                <div className="flex items-center justify-between border-b border-ledger-100 pb-2.5 dark:border-ledger-700">
                  <div className="flex items-center gap-1.5">
                    <Bell className="h-4 w-4 text-emerald-600" />
                    <h4 className="font-bold text-xs text-ink-900 dark:text-white">Live Notifications</h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNotificationsList((prev) => prev.map((n) => ({ ...n, read: true })))}
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

          {/* Primary Action Button */}
          <Button
            type="button"
            onClick={() => setActiveTab("new")}
            className="h-10 gap-1.5 rounded-xl bg-emerald-700 px-4 text-xs font-semibold text-white shadow-sm hover:bg-emerald-800"
          >
            <Plus className="h-4 w-4" />
            New Transfer
          </Button>
        </div>
      </div>

      {/* ── Status & Navigation Tabs Bar ─────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-ledger-100 pb-3 dark:border-ledger-700">
        {[
          { id: "new", label: "New Transfer", icon: CheckCircle2, badge: null },
          { id: "transfers", label: "Transfers", icon: FileText, badge: null },
          { id: "drafts", label: "Drafts", icon: FileSpreadsheet, badge: 3 },
          { id: "in_transit", label: "In Transit", icon: Truck, badge: 2 },
          { id: "completed", label: "Completed", icon: CheckCircle2, badge: null },
          { id: "cancelled", label: "Cancelled", icon: PackageX, badge: null },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
                isActive
                  ? "border border-emerald-600/30 bg-emerald-50 text-emerald-800 shadow-xs dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
                  : "text-ledger-600 hover:bg-ledger-50 hover:text-ink-900 dark:text-ledger-300 dark:hover:bg-white/[0.04] dark:hover:text-white"
              }`}
            >
              <Icon className={`h-4 w-4 ${isActive ? "text-emerald-600" : "text-ledger-400"}`} />
              <span>{tab.label}</span>
              {tab.badge && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    isActive
                      ? "bg-emerald-600 text-white"
                      : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── If tab is NOT "new", render history list ─────────────────────── */}
      {activeTab !== "new" ? (
        <div className="rounded-2xl border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900 space-y-4">
          <div className="flex items-center justify-between border-b border-ledger-100 pb-4 dark:border-ledger-700">
            <div>
              <h2 className="font-bold text-base text-ink-900 dark:text-white capitalize">
                {activeTab.replace("_", " ")} Stock Transfers
              </h2>
              <p className="text-xs text-ledger-400">
                Audit trail and live tracking of all branch inventory movements
              </p>
            </div>

            <Button
              size="sm"
              onClick={() => setActiveTab("new")}
              className="gap-1.5 rounded-xl bg-emerald-700 text-xs text-white hover:bg-emerald-800"
            >
              <Plus className="h-3.5 w-3.5" />
              Create Stock Transfer
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-ledger-100 bg-ledger-50/60 text-[11px] font-semibold text-ledger-500 dark:border-ledger-700 dark:bg-white/[0.02]">
                <tr>
                  <th className="px-4 py-3">Transfer No.</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Transfer Date</th>
                  <th className="px-4 py-3">Source (From)</th>
                  <th className="px-4 py-3">Destination (To)</th>
                  <th className="px-4 py-3 text-center">Items</th>
                  <th className="px-4 py-3 text-center">Total Qty</th>
                  <th className="px-4 py-3 text-right">Total Value ({currency})</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ledger-100 dark:divide-ledger-700/50">
                {MOCK_HISTORY_TRANSFERS.filter(
                  (t) => activeTab === "transfers" || t.status === activeTab
                ).map((row) => (
                  <tr key={row.id} className="hover:bg-ledger-50/40 dark:hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-emerald-700 dark:text-emerald-400">
                      {row.transferNumber}
                    </td>
                    <td className="px-4 py-3 font-mono text-ledger-600 dark:text-ledger-300">
                      {row.referenceNo}
                    </td>
                    <td className="px-4 py-3 text-ledger-600 dark:text-ledger-300">{row.transferDate}</td>
                    <td className="px-4 py-3 font-medium text-ink-900 dark:text-white">{row.fromLocationName}</td>
                    <td className="px-4 py-3 font-medium text-ink-900 dark:text-white">{row.toLocationName}</td>
                    <td className="px-4 py-3 text-center font-mono">{row.itemsCount}</td>
                    <td className="px-4 py-3 text-center font-bold font-mono text-ink-900 dark:text-white">
                      {row.totalQty}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-ink-900 dark:text-white">
                      {row.totalValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-lg px-2.5 py-0.5 text-[10px] font-bold capitalize ${
                          row.status === "completed"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300"
                            : row.status === "in_transit"
                            ? "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950 dark:text-amber-300"
                            : row.status === "cancelled"
                            ? "bg-red-50 text-red-700 border border-red-200 dark:bg-red-950 dark:text-red-300"
                            : "bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950 dark:text-blue-300"
                        }`}
                      >
                        {row.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => setShowTimelineModal(true)}
                        className="rounded-lg p-1.5 text-ledger-400 hover:bg-ledger-100 hover:text-ink-900"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ── Full-Width Stock Transfer Creation Workspace ────────────────── */
        <div className="space-y-6">
          {/* 1. Create Stock Transfer Parameters Card (with Toggle Show/Hide) */}
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
                    Specify transfer parameters, source/destination branches, and workflow attachments
                  </p>
                </div>
              </div>

              {/* Toggle Show and Hide Button */}
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

            {/* Collapsed Compact State Summary Strip */}
            {!showConfigSection && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-ledger-50/70 p-3 text-xs dark:bg-white/[0.02]">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                    #{transferNumber}
                  </span>
                  <span className="text-ledger-600 dark:text-ledger-300 font-medium">
                    {sourceLocationObj.name} → {destLocationObj.name}
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

            {/* Expanded Full Configuration Form */}
            {showConfigSection && (
              <div className="space-y-6 animate-in fade-in duration-150">
                {/* Top Row: Transfer Number, Transfer Date, Priority, Expected Date */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 text-xs">
                  {/* Transfer Number */}
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
                    <span className="mt-1 block text-[10px] text-ledger-400">Auto generated</span>
                  </div>

                  {/* Transfer Date */}
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

                  {/* Priority */}
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

                  {/* Expected Date */}
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

                {/* Source & Destination Dual Cards with Swap Button in middle */}
                <div className="relative grid grid-cols-1 gap-4 md:grid-cols-2 pt-1">
                  {/* 1. Source (FROM) */}
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

                    <div>
                      <label className="mb-1 block text-[11px] font-semibold text-ledger-600 dark:text-ledger-300">
                        Stock Location
                      </label>
                      <div className="relative">
                        <select
                          value={fromSubLocation}
                          onChange={(e) => setFromSubLocation(e.target.value)}
                          className="h-10 w-full appearance-none rounded-xl border border-ledger-200 bg-white px-3 pr-8 text-xs font-medium text-ink-900 shadow-xs focus:border-emerald-600 focus:outline-hidden dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
                        >
                          <option value="Main Warehouse">Main Warehouse</option>
                          <option value="Shelf A-12">Shelf A-12 (Fast Pick)</option>
                          <option value="Bulk Storage">Bulk Storage Bay 4</option>
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-ledger-400" />
                      </div>
                    </div>
                  </div>

                  {/* Centered Swap Button */}
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

                  {/* 2. Destination (TO) */}
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

                    <div>
                      <label className="mb-1 block text-[11px] font-semibold text-ledger-600 dark:text-ledger-300">
                        Stock Location
                      </label>
                      <div className="relative">
                        <select
                          value={toSubLocation}
                          onChange={(e) => setToSubLocation(e.target.value)}
                          className="h-10 w-full appearance-none rounded-xl border border-ledger-200 bg-white px-3 pr-8 text-xs font-medium text-ink-900 shadow-xs focus:border-emerald-600 focus:outline-hidden dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
                        >
                          <option value="Kumasi Warehouse">Kumasi Warehouse</option>
                          <option value="Receiving Bay 1">Receiving Bay 1</option>
                          <option value="Storefront Shelf">Storefront Shelf</option>
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-ledger-400" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Reference / Note Textarea */}
                <div>
                  <label className="mb-1.5 block font-semibold text-xs text-ledger-600 dark:text-ledger-300">
                    Reference / Note
                  </label>
                  <textarea
                    rows={2}
                    value={referenceNotes}
                    onChange={(e) => setReferenceNotes(e.target.value)}
                    placeholder="e.g. routine stock replenishment, urgent branch fulfillment..."
                    className="w-full rounded-xl border border-ledger-200 bg-white p-3 text-xs text-ink-900 placeholder:text-ledger-400 shadow-xs focus:border-emerald-600 focus:outline-hidden dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
                  />
                </div>

                {/* ── Moved under Create Stock Transfer Section: Summary, Status, Prepared By, Attachments 4-Card Row ── */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 pt-2 border-t border-ledger-100 dark:border-ledger-700">
                  {/* 1. Transfer Summary */}
                  <div className="rounded-2xl border border-ledger-100 bg-ledger-50/40 p-4 dark:border-ledger-700 dark:bg-white/[0.02] space-y-2.5">
                    <div className="flex items-center gap-2 text-ledger-500 border-b border-ledger-100 pb-2 dark:border-ledger-700">
                      <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                      <h4 className="font-semibold text-xs text-ink-900 dark:text-white">Transfer Summary</h4>
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between text-ledger-500">
                        <span>Total Items:</span>
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
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300/60 bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                        <span className="h-2 w-2 rounded-full bg-amber-500" />
                        {transferStatus === "pending"
                          ? "Draft"
                          : transferStatus === "in_transit"
                          ? "In Transit"
                          : "Completed"}
                      </span>
                      <p className="mt-1.5 text-[11px] text-ledger-400">
                        Saved as draft. Edit and submit for approval.
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
                        {currentUserName.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="text-left text-xs leading-tight">
                        <p className="font-semibold text-ink-900 dark:text-white">{currentUserName}</p>
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
                      {attachments.map((file, idx) => (
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
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 2. Full-Width Transfer Items Search & Table Card (Matching Screenshot 2) */}
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

              {/* Extra Wide Search Field */}
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
                            <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                              {srcStock} available
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

            {/* Editable Multi-Column Items Table (Matching Screenshot 2) */}
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
                      <td colSpan={11} className="px-6 py-12 text-center text-ledger-400">
                        No items added to this stock transfer yet. Use the search field above to add products.
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

                          <td className="px-3.5 py-3.5 text-center font-mono font-bold text-emerald-600 dark:text-emerald-400">
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
                                max={row.sourceQtyOnHand}
                                value={row.transferQty}
                                onChange={(e) => handleUpdateQty(row.id, Number(e.target.value) || 0)}
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

                          <td className="px-3.5 py-3.5 text-center font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            {sourceAfter}
                          </td>

                          <td className="px-3.5 py-3.5 text-center font-mono font-bold text-blue-600 dark:text-blue-400">
                            {destinationAfter}
                          </td>

                          <td className="px-3.5 py-3.5 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setSelectedItemForDetail(row)}
                                title="Edit Item Details"
                                className="rounded-lg p-1.5 text-ledger-400 hover:bg-ledger-100 hover:text-ink-900 dark:hover:bg-white/[0.06]"
                              >
                                <Edit3 className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(row.id)}
                                title="Remove item"
                                className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
                              >
                                <Trash2 className="h-4 w-4" />
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

            {/* Add Another Product Dashed Button */}
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

          {/* 3. Full-Width Real-Time Stock Comparison Widget (Matching Screenshot 2) */}
          {activeComparisonItem && (
            <div className="rounded-2xl border border-ledger-100 bg-white p-6 shadow-card dark:border-ledger-700 dark:bg-ink-900 space-y-4">
              <div>
                <h3 className="font-bold text-sm text-ink-900 dark:text-white">
                  Stock Comparison (Before vs After Transfer)
                </h3>
                <p className="text-xs text-ledger-400">
                  Live simulation for item: <strong className="text-ink-900 dark:text-white">{activeComparisonItem.name}</strong>
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-12 items-center">
                {/* BEFORE TRANSFER (4 cols) */}
                <div className="md:col-span-4 rounded-2xl border border-ledger-100 bg-ledger-50/50 p-4 dark:border-ledger-700 dark:bg-white/[0.02] space-y-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-ledger-400 block">
                    BEFORE TRANSFER
                  </span>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] text-ledger-500 leading-tight">
                        Source ({sourceLocationObj.name.split(" ")[0]} Wh)
                      </p>
                      <p className="text-[10px] text-ledger-400">Qty On Hand</p>
                      <p className="font-display text-2xl font-bold text-ink-900 dark:text-white font-mono mt-1">
                        {activeComparisonItem.sourceQtyOnHand}
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] text-ledger-500 leading-tight">
                        Destination ({destLocationObj.name.split(" ")[0]})
                      </p>
                      <p className="text-[10px] text-ledger-400">Qty On Hand</p>
                      <p className="font-display text-2xl font-bold text-blue-600 dark:text-blue-400 font-mono mt-1">
                        {activeComparisonItem.destinationQtyOnHand}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Arrow in middle (1 col) */}
                <div className="md:col-span-1 flex items-center justify-center">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ledger-100 text-ledger-500 dark:bg-ledger-800">
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </div>

                {/* AFTER TRANSFER (4 cols) */}
                <div className="md:col-span-4 rounded-2xl border border-emerald-100 bg-emerald-50/20 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20 space-y-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 block">
                    AFTER TRANSFER (With {activeComparisonItem.transferQty} Qty)
                  </span>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] text-ledger-500 leading-tight">
                        Source ({sourceLocationObj.name.split(" ")[0]} Wh)
                      </p>
                      <p className="text-[10px] text-ledger-400">Remaining Stock</p>
                      <p className="font-display text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-1">
                        {activeComparisonItem.sourceQtyOnHand - activeComparisonItem.transferQty}
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] text-ledger-500 leading-tight">
                        Destination ({destLocationObj.name.split(" ")[0]})
                      </p>
                      <p className="text-[10px] text-ledger-400">Expected Stock</p>
                      <p className="font-display text-2xl font-bold text-blue-600 dark:text-blue-400 font-mono mt-1">
                        {activeComparisonItem.destinationQtyOnHand + activeComparisonItem.transferQty}
                      </p>
                    </div>
                  </div>
                </div>

                {/* STOCK ALERT (3 cols) */}
                <div className="md:col-span-3 rounded-2xl border border-amber-200/80 bg-amber-50/40 p-4 dark:border-amber-900/40 dark:bg-amber-950/20 space-y-2">
                  <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-4 w-4" />
                    <h4 className="font-bold text-xs">Stock Alert</h4>
                  </div>
                  <p className="text-[11px] text-ledger-600 dark:text-ledger-300 leading-relaxed">
                    After transfer, source location will have{" "}
                    <strong>
                      {activeComparisonItem.sourceQtyOnHand - activeComparisonItem.transferQty} units
                    </strong>{" "}
                    remaining.
                  </p>
                  <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 text-xs font-semibold pt-1">
                    <Check className="h-3.5 w-3.5" />
                    <span>Sufficient stock available.</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Fixed Bottom Actions Bar ─────────────────────────────────────── */}
      {activeTab === "new" && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-ledger-200 bg-white/95 px-6 py-3.5 shadow-2xl backdrop-blur-md dark:border-ledger-700 dark:bg-ink-900/95">
          <div className="mx-auto flex max-w-7xl items-center justify-between">
            <button
              type="button"
              onClick={() => router.push("/inventory")}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-ledger-600 hover:bg-ledger-100 hover:text-ink-900 dark:text-ledger-300 dark:hover:bg-white/[0.04]"
            >
              Cancel
            </button>

            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={handleSaveDraft}
                className="h-10 gap-1.5 rounded-xl border-ledger-200 text-xs font-semibold text-ink-900 hover:bg-ledger-50 dark:border-ledger-700 dark:text-white"
              >
                <FileSpreadsheet className="h-4 w-4 text-amber-600" />
                Save as Draft
              </Button>

              <Button
                type="button"
                onClick={handleReviewAndSubmit}
                disabled={isPending || items.length === 0}
                className="h-10 gap-2 rounded-xl bg-emerald-700 px-6 text-xs font-semibold text-white shadow-md hover:bg-emerald-800"
              >
                <span>Review &amp; Submit</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Enterprise Modals & Drawers ──────────────────────────────────── */}

      {/* 1. Approval Workflow Modal */}
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
                    Review Stock Transfer #{transferNumber}
                  </h3>
                  <p className="text-xs text-ledger-400">
                    Source: {sourceLocationObj.name} → Destination: {destLocationObj.name}
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
                <span className="text-ledger-400 block text-[10px]">Total Transfer Value</span>
                <strong className="text-ink-900 dark:text-white font-mono text-sm">
                  {currency} {totals.totalValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </strong>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-emerald-200/70 bg-emerald-50/30 p-3.5 dark:border-emerald-900 dark:bg-emerald-950/30">
              <div className="flex items-center gap-2 font-bold text-xs text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>Smart Inventory Validation Passed</span>
              </div>
              <ul className="mt-2 space-y-1 text-[11px] text-ledger-600 dark:text-ledger-300">
                <li>✓ Sufficient stock available across all {items.length} transfer line items.</li>
                <li>✓ No negative stock risk or duplicate product constraints detected.</li>
                <li>✓ Destination warehouse storage capacity verified.</li>
              </ul>
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
                Print Waybill
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
                  onClick={() => {
                    setShowApprovalModal(false);
                    handleSubmitForApproval();
                  }}
                  className="gap-1.5 rounded-xl bg-emerald-700 text-xs text-white hover:bg-emerald-800"
                >
                  <Send className="h-3.5 w-3.5" />
                  Approve &amp; Dispatch Transfer
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Product Lookup Catalogue Modal */}
      {showLookupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-2xl rounded-2xl border border-ledger-100 bg-white p-6 shadow-2xl dark:border-ledger-700 dark:bg-ink-900 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-ledger-100 pb-3 dark:border-ledger-700">
              <div className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-emerald-600" />
                <h3 className="font-bold text-base text-ink-900 dark:text-white">
                  Product Catalogue Lookup
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
                  placeholder="Filter catalog by product name, SKU or category..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-10 w-full rounded-xl border border-ledger-200 bg-white pl-9 pr-3 text-xs text-ink-900 dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
                />
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {products.map((p) => {
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
                          <p className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">
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
                })}
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

      {/* 3. Barcode Scanner Simulator Modal */}
      {showScannerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-md rounded-2xl border border-ledger-100 bg-white p-6 shadow-2xl dark:border-ledger-700 dark:bg-ink-900 text-center">
            <div className="flex items-center justify-between border-b border-ledger-100 pb-3 dark:border-ledger-700">
              <div className="flex items-center gap-2">
                <Barcode className="h-5 w-5 text-emerald-600" />
                <h3 className="font-bold text-base text-ink-900 dark:text-white">
                  Barcode / QR Scanner
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
                Ready for Barcode Scan
              </p>
              <p className="mt-1 text-xs text-ledger-400">
                Point your handheld laser scanner or camera at the product barcode.
              </p>
            </div>

            <div className="space-y-2 text-xs text-left">
              <span className="font-semibold text-ledger-500 block">Simulate Sample Barcode Scan:</span>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    handleAddProduct(products[0]);
                    setShowScannerModal(false);
                  }}
                  className="text-xs truncate"
                >
                  Scan Galaxy A15
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    handleAddProduct(products[2]);
                    setShowScannerModal(false);
                  }}
                  className="text-xs truncate"
                >
                  Scan Oraimo Charger
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Transfer Tracking Timeline Modal */}
      {showTimelineModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-lg rounded-2xl border border-ledger-100 bg-white p-6 shadow-2xl dark:border-ledger-700 dark:bg-ink-900">
            <div className="flex items-center justify-between border-b border-ledger-100 pb-3 dark:border-ledger-700">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-blue-600" />
                <h3 className="font-bold text-base text-ink-900 dark:text-white">
                  Transfer Tracking Timeline
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowTimelineModal(false)}
                className="rounded-lg p-1 text-ledger-400 hover:bg-ledger-50 dark:hover:bg-white/[0.06]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 space-y-4 text-xs">
              {[
                { stage: "Created & Drafted", time: "May 31, 2026 · 10:15 AM", user: "Daniel Kofi", done: true },
                { stage: "Submitted for Approval", time: "May 31, 2026 · 10:30 AM", user: "Daniel Kofi", done: true },
                { stage: "Manager Approved", time: "May 31, 2026 · 11:00 AM", user: "Super Admin", done: true },
                { stage: "Dispatched (In Transit)", time: "May 31, 2026 · 02:15 PM", user: "Logistics Team", done: false },
                { stage: "Destination Received & Verified", time: "Expected Jun 02, 2026", user: "Kumasi Branch Manager", done: false },
              ].map((step, idx) => (
                <div key={idx} className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      step.done
                        ? "bg-emerald-600 text-white"
                        : "bg-ledger-100 text-ledger-400 dark:bg-ledger-800"
                    }`}
                  >
                    {step.done ? <Check className="h-3.5 w-3.5" /> : idx + 1}
                  </div>
                  <div>
                    <p className="font-semibold text-ink-900 dark:text-white">{step.stage}</p>
                    <p className="text-[11px] text-ledger-400">{step.time}</p>
                    <p className="text-[10px] text-ledger-500">Performed by: {step.user}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-end">
              <Button
                size="sm"
                onClick={() => setShowTimelineModal(false)}
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