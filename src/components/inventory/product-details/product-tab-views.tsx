"use client";

import { useState } from "react";
import Link from "next/link";
import {
  TrendingUp,
  Boxes,
  Truck,
  ShoppingBag,
  ShoppingCart,
  Sliders,
  Layers,
  FileText,
  Plus,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Upload,
  Download,
  Eye,
  Trash2,
  Calendar,
  Building2,
  Shield,
  Tag,
  Clock,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductDetailsData, formatLedgerMoney, StockMovement } from "@/lib/inventory/stock-ledger";

interface TabViewsProps {
  activeTab: string;
  product: ProductDetailsData;
  movements: StockMovement[];
  onOpenDocModal: (movement: StockMovement) => void;
  onOpenAdjustModal: () => void;
  onOpenTransferModal: () => void;
}

export function ProductTabViews({
  activeTab,
  product,
  movements,
  onOpenDocModal,
  onOpenAdjustModal,
  onOpenTransferModal,
}: TabViewsProps) {
  const currency = product.currency || "GHS";
  const unitProfit = product.sellingPrice - product.costPrice;
  const marginPct = product.sellingPrice > 0 ? Math.round((unitProfit / product.sellingPrice) * 100) : 0;
  const markupPct = product.costPrice > 0 ? Math.round((unitProfit / product.costPrice) * 100) : 0;

  // Filter movements for dedicated sub-tabs
  const transferMovements = movements.filter((m) => m.type.includes("Transfer"));
  const purchaseMovements = movements.filter((m) => m.type === "Purchase");
  const salesMovements = movements.filter((m) => m.type === "Sale");
  const adjustmentMovements = movements.filter((m) => m.type === "Stock Adjustment");

  // Serial/Batch dummy state
  const [serials, setSerials] = useState([
    { id: "s-1", serialNo: "SN-SAM-23-009182", batchNo: "B2025-05-A", location: "Accra Main Branch", status: "Available", dateAdded: "May 17, 2025" },
    { id: "s-2", serialNo: "SN-SAM-23-009183", batchNo: "B2025-05-A", location: "Accra Main Branch", status: "Available", dateAdded: "May 17, 2025" },
    { id: "s-3", serialNo: "SN-SAM-23-009184", batchNo: "B2025-05-A", location: "Kumasi Branch", status: "Available", dateAdded: "May 17, 2025" },
    { id: "s-4", serialNo: "SN-SAM-23-008401", batchNo: "B2025-04-C", location: "Takoradi Branch", status: "Sold", dateAdded: "May 10, 2025" },
  ]);
  const [newSerialInput, setNewSerialInput] = useState("");
  const [showAddSerial, setShowAddSerial] = useState(false);

  // Documents state
  const [documents, setDocuments] = useState([
    { id: "d-1", name: "Samsung_S23_User_Manual.pdf", size: "2.4 MB", type: "PDF Document", uploadedAt: "Jan 12, 2025" },
    { id: "d-2", name: "Warranty_Certificate_Samsung_Gh.pdf", size: "840 KB", type: "Certificate", uploadedAt: "Jan 15, 2025" },
    { id: "d-3", name: "Supplier_Quality_Compliance.pdf", size: "1.1 MB", type: "Compliance", uploadedAt: "Feb 02, 2025" },
  ]);

  if (activeTab === "Overview") {
    return (
      <div className="space-y-6 animate-in fade-in duration-150">
        {/* Margin & Commercial Performance */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <span className="text-xs font-semibold uppercase tracking-wider text-ledger-400">Profit Margin</span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="font-display font-bold text-2xl text-emerald-600 dark:text-emerald-400">{marginPct}%</span>
              <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full dark:bg-emerald-950/40">Healthy</span>
            </div>
            <p className="mt-1 text-xs text-ledger-400">Gross margin per unit sold</p>
          </div>

          <div className="rounded-2xl border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <span className="text-xs font-semibold uppercase tracking-wider text-ledger-400">Unit Profit</span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="font-display font-bold text-2xl text-ink-900 dark:text-white">
                {currency} {formatLedgerMoney(unitProfit, currency)}
              </span>
              <span className="text-xs text-ledger-400">+{markupPct}% markup</span>
            </div>
            <p className="mt-1 text-xs text-ledger-400">Selling price minus cost price</p>
          </div>

          <div className="rounded-2xl border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <span className="text-xs font-semibold uppercase tracking-wider text-ledger-400">Total Stock Asset</span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="font-display font-bold text-2xl text-blue-600 dark:text-blue-400">
                {currency} {formatLedgerMoney(product.summary.stockValue, currency)}
              </span>
            </div>
            <p className="mt-1 text-xs text-ledger-400">Based on cost price across all branches</p>
          </div>

          <div className="rounded-2xl border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <span className="text-xs font-semibold uppercase tracking-wider text-ledger-400">Stock Turnover Velocity</span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="font-display font-bold text-2xl text-purple-600 dark:text-purple-400">4.8x / mo</span>
              <span className="text-xs font-semibold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full dark:bg-purple-950/40">Fast mover</span>
            </div>
            <p className="mt-1 text-xs text-ledger-400">Average sales velocity</p>
          </div>
        </div>

        {/* Specifications & Supplier Grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Product Specifications */}
          <div className="rounded-2xl border border-ledger-100 bg-white p-6 shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <h3 className="flex items-center gap-2 font-display font-bold text-base text-ink-900 dark:text-white">
              <Tag className="h-4 w-4 text-blue-600" />
              Technical & Catalog Specifications
            </h3>
            <div className="mt-4 divide-y divide-ledger-100 text-xs dark:divide-ledger-700/50">
              <div className="flex justify-between py-2.5">
                <span className="text-ledger-400">Product Model / Variant</span>
                <span className="font-semibold text-ink-900 dark:text-white">{product.name} (128GB)</span>
              </div>
              <div className="flex justify-between py-2.5">
                <span className="text-ledger-400">SKU Code</span>
                <span className="font-mono font-semibold text-ink-900 dark:text-white">{product.sku}</span>
              </div>
              <div className="flex justify-between py-2.5">
                <span className="text-ledger-400">Barcode / EAN</span>
                <span className="font-mono font-semibold text-ink-900 dark:text-white">{product.barcode || "8806094721234"}</span>
              </div>
              <div className="flex justify-between py-2.5">
                <span className="text-ledger-400">Product Category</span>
                <span className="font-semibold text-ink-900 dark:text-white">{product.category || "Smartphones"}</span>
              </div>
              <div className="flex justify-between py-2.5">
                <span className="text-ledger-400">Brand / Manufacturer</span>
                <span className="font-semibold text-ink-900 dark:text-white">{product.brand || "Samsung"}</span>
              </div>
              <div className="flex justify-between py-2.5">
                <span className="text-ledger-400">Unit of Measurement</span>
                <span className="font-semibold text-ink-900 dark:text-white">{product.unit || "Piece"}</span>
              </div>
              <div className="flex justify-between py-2.5">
                <span className="text-ledger-400">Warranty Duration</span>
                <span className="font-semibold text-ink-900 dark:text-white">24 Months Official Warranty</span>
              </div>
            </div>
          </div>

          {/* Supplier & Sourcing Info */}
          <div className="rounded-2xl border border-ledger-100 bg-white p-6 shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <h3 className="flex items-center gap-2 font-display font-bold text-base text-ink-900 dark:text-white">
              <Building2 className="h-4 w-4 text-purple-600" />
              Supplier & Logistics Profile
            </h3>
            <div className="mt-4 divide-y divide-ledger-100 text-xs dark:divide-ledger-700/50">
              <div className="flex justify-between py-2.5">
                <span className="text-ledger-400">Primary Supplier</span>
                <span className="font-semibold text-ink-900 dark:text-white">Samsung Electronics Ghana Ltd</span>
              </div>
              <div className="flex justify-between py-2.5">
                <span className="text-ledger-400">Average Lead Time</span>
                <span className="font-semibold text-ink-900 dark:text-white">3 - 5 Business Days</span>
              </div>
              <div className="flex justify-between py-2.5">
                <span className="text-ledger-400">Reorder Threshold</span>
                <span className="font-semibold text-amber-600 dark:text-amber-400">{product.lowStockThreshold || 5} Units</span>
              </div>
              <div className="flex justify-between py-2.5">
                <span className="text-ledger-400">Active Warehouses</span>
                <span className="font-semibold text-ink-900 dark:text-white">{product.branches.length} Locations</span>
              </div>
              <div className="flex justify-between py-2.5">
                <span className="text-ledger-400">Tax / VAT Rate</span>
                <span className="font-semibold text-ink-900 dark:text-white">{product.taxRate || 0}% Standard</span>
              </div>
              <div className="flex justify-between py-2.5">
                <span className="text-ledger-400">Batch / Serial Tracking</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">Enabled (Individual Serialized)</span>
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <Button size="sm" onClick={onOpenAdjustModal} variant="outline" className="flex-1 rounded-xl text-xs">
                <Sliders className="mr-1.5 h-3.5 w-3.5 text-amber-600" />
                Adjust Stock
              </Button>
              <Button size="sm" onClick={onOpenTransferModal} variant="outline" className="flex-1 rounded-xl text-xs">
                <Truck className="mr-1.5 h-3.5 w-3.5 text-blue-600" />
                Transfer Stock
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === "Stock Transfers") {
    return (
      <div className="space-y-4 animate-in fade-in duration-150">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm text-ink-900 dark:text-white">Inter-Branch Stock Transfers</h3>
            <p className="text-xs text-ledger-400">All warehouse transfer movements involving this product</p>
          </div>
          <Button size="sm" onClick={onOpenTransferModal} className="gap-1.5 rounded-xl bg-blue-600 text-xs text-white hover:bg-blue-700">
            <Plus className="h-3.5 w-3.5" />
            New Transfer
          </Button>
        </div>

        <div className="overflow-hidden rounded-2xl border border-ledger-100 bg-white shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-ledger-100 bg-ledger-50/70 font-semibold uppercase tracking-wider text-ledger-500 dark:border-ledger-700 dark:bg-white/[0.03]">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Transfer Ref</th>
                <th className="px-4 py-3">Destination / Branch</th>
                <th className="px-4 py-3 text-right">Quantity</th>
                <th className="px-4 py-3 text-right">Transfer Value</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Officer</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ledger-100 dark:divide-ledger-700/50">
              {transferMovements.map((m) => (
                <tr key={m.id} className="hover:bg-ledger-50/40 dark:hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-ledger-500">{m.dateFormatted}</td>
                  <td className="px-4 py-3 font-mono font-semibold text-blue-600 hover:underline cursor-pointer" onClick={() => onOpenDocModal(m)}>
                    {m.referenceNo}
                  </td>
                  <td className="px-4 py-3 font-medium text-ink-900 dark:text-white">{m.branchName}</td>
                  <td className="px-4 py-3 text-right font-bold text-ink-900 dark:text-white">{m.inQty ?? m.outQty}</td>
                  <td className="px-4 py-3 text-right text-ledger-600 dark:text-ledger-300">{currency} {formatLedgerMoney(m.totalValue, currency)}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-950/50 dark:text-blue-400">
                      Completed
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ledger-600 dark:text-ledger-300">{m.userName}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => onOpenDocModal(m)} className="rounded-lg p-1 text-ledger-400 hover:bg-ledger-100 hover:text-ink-900 dark:hover:bg-white/[0.06] dark:hover:text-white">
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (activeTab === "Purchases") {
    return (
      <div className="space-y-4 animate-in fade-in duration-150">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm text-ink-900 dark:text-white">Purchase Orders & Inbound Shipments</h3>
            <p className="text-xs text-ledger-400">Restock procurement records from suppliers</p>
          </div>
          <Link href={`/purchases/new?product_id=${product.id}`}>
            <Button size="sm" className="gap-1.5 rounded-xl bg-purple-600 text-xs text-white hover:bg-purple-700">
              <Plus className="h-3.5 w-3.5" />
              New Purchase Order
            </Button>
          </Link>
        </div>

        <div className="overflow-hidden rounded-2xl border border-ledger-100 bg-white shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-ledger-100 bg-ledger-50/70 font-semibold uppercase tracking-wider text-ledger-500 dark:border-ledger-700 dark:bg-white/[0.03]">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">PO Reference</th>
                <th className="px-4 py-3">Receiving Branch</th>
                <th className="px-4 py-3 text-right">Qty Received</th>
                <th className="px-4 py-3 text-right">Unit Cost</th>
                <th className="px-4 py-3 text-right">Total PO Value</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ledger-100 dark:divide-ledger-700/50">
              {purchaseMovements.map((m) => (
                <tr key={m.id} className="hover:bg-ledger-50/40 dark:hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-ledger-500">{m.dateFormatted}</td>
                  <td className="px-4 py-3 font-mono font-semibold text-purple-600 hover:underline cursor-pointer" onClick={() => onOpenDocModal(m)}>
                    {m.referenceNo}
                  </td>
                  <td className="px-4 py-3 font-medium text-ink-900 dark:text-white">{m.branchName}</td>
                  <td className="px-4 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400">+{m.inQty}</td>
                  <td className="px-4 py-3 text-right text-ledger-600 dark:text-ledger-300">{currency} {formatLedgerMoney(m.unitCost, currency)}</td>
                  <td className="px-4 py-3 text-right font-bold text-ink-900 dark:text-white">{currency} {formatLedgerMoney(m.totalValue, currency)}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
                      Received
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => onOpenDocModal(m)} className="rounded-lg p-1 text-ledger-400 hover:bg-ledger-100 hover:text-ink-900 dark:hover:bg-white/[0.06] dark:hover:text-white">
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (activeTab === "Sales") {
    return (
      <div className="space-y-4 animate-in fade-in duration-150">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm text-ink-900 dark:text-white">Sales & Outbound Orders</h3>
            <p className="text-xs text-ledger-400">All customer invoices and POS checkout transactions</p>
          </div>
          <Link href={`/pos`}>
            <Button size="sm" className="gap-1.5 rounded-xl bg-orange-600 text-xs text-white hover:bg-orange-700">
              <ShoppingCart className="h-3.5 w-3.5" />
              Open POS Register
            </Button>
          </Link>
        </div>

        <div className="overflow-hidden rounded-2xl border border-ledger-100 bg-white shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-ledger-100 bg-ledger-50/70 font-semibold uppercase tracking-wider text-ledger-500 dark:border-ledger-700 dark:bg-white/[0.03]">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Invoice No</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3 text-right">Qty Sold</th>
                <th className="px-4 py-3 text-right">Selling Price</th>
                <th className="px-4 py-3 text-right">Total Revenue</th>
                <th className="px-4 py-3">Cashier</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ledger-100 dark:divide-ledger-700/50">
              {salesMovements.map((m) => (
                <tr key={m.id} className="hover:bg-ledger-50/40 dark:hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-ledger-500">{m.dateFormatted}</td>
                  <td className="px-4 py-3 font-mono font-semibold text-orange-600 hover:underline cursor-pointer" onClick={() => onOpenDocModal(m)}>
                    {m.referenceNo}
                  </td>
                  <td className="px-4 py-3 font-medium text-ink-900 dark:text-white">{m.branchName}</td>
                  <td className="px-4 py-3 text-right font-bold text-red-600 dark:text-red-400">-{m.outQty}</td>
                  <td className="px-4 py-3 text-right text-ledger-600 dark:text-ledger-300">{currency} {formatLedgerMoney(product.sellingPrice, currency)}</td>
                  <td className="px-4 py-3 text-right font-bold text-ink-900 dark:text-white">{currency} {formatLedgerMoney((m.outQty || 1) * product.sellingPrice, currency)}</td>
                  <td className="px-4 py-3 text-ledger-600 dark:text-ledger-300">{m.userName}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => onOpenDocModal(m)} className="rounded-lg p-1 text-ledger-400 hover:bg-ledger-100 hover:text-ink-900 dark:hover:bg-white/[0.06] dark:hover:text-white">
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (activeTab === "Adjustments") {
    return (
      <div className="space-y-4 animate-in fade-in duration-150">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm text-ink-900 dark:text-white">Physical Count Adjustments</h3>
            <p className="text-xs text-ledger-400">Audit reconciliations, inventory calibration, and loss write-offs</p>
          </div>
          <Button size="sm" onClick={onOpenAdjustModal} className="gap-1.5 rounded-xl bg-amber-600 text-xs text-white hover:bg-amber-700">
            <Plus className="h-3.5 w-3.5" />
            New Adjustment
          </Button>
        </div>

        <div className="overflow-hidden rounded-2xl border border-ledger-100 bg-white shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-ledger-100 bg-ledger-50/70 font-semibold uppercase tracking-wider text-ledger-500 dark:border-ledger-700 dark:bg-white/[0.03]">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Adjustment No</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Adjustment Reason</th>
                <th className="px-4 py-3 text-right">Variance</th>
                <th className="px-4 py-3 text-right">Financial Impact</th>
                <th className="px-4 py-3">Auditor</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ledger-100 dark:divide-ledger-700/50">
              {adjustmentMovements.map((m) => (
                <tr key={m.id} className="hover:bg-ledger-50/40 dark:hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-ledger-500">{m.dateFormatted}</td>
                  <td className="px-4 py-3 font-mono font-semibold text-amber-600 hover:underline cursor-pointer" onClick={() => onOpenDocModal(m)}>
                    {m.referenceNo}
                  </td>
                  <td className="px-4 py-3 font-medium text-ink-900 dark:text-white">{m.branchName}</td>
                  <td className="px-4 py-3 font-medium text-ink-900 dark:text-white">
                    {m.subTypeNote || "Physical Count Discrepancy"}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                    +{m.inQty ?? m.outQty}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-ink-900 dark:text-white">
                    {currency} {formatLedgerMoney(m.totalValue, currency)}
                  </td>
                  <td className="px-4 py-3 text-ledger-600 dark:text-ledger-300">{m.userName}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => onOpenDocModal(m)} className="rounded-lg p-1 text-ledger-400 hover:bg-ledger-100 hover:text-ink-900 dark:hover:bg-white/[0.06] dark:hover:text-white">
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (activeTab === "Stock Levels") {
    return (
      <div className="space-y-4 animate-in fade-in duration-150">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm text-ink-900 dark:text-white">Branch Stock Level Breakdown</h3>
            <p className="text-xs text-ledger-400">Real-time on-hand, reorder thresholds, and warehouse valuation</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={onOpenTransferModal} variant="outline" className="gap-1.5 rounded-xl text-xs">
              <Truck className="h-3.5 w-3.5 text-blue-600" />
              Transfer Between Branches
            </Button>
            <Button size="sm" onClick={onOpenAdjustModal} variant="outline" className="gap-1.5 rounded-xl text-xs">
              <Sliders className="h-3.5 w-3.5 text-amber-600" />
              Adjust Branch Count
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-ledger-100 bg-white shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-ledger-100 bg-ledger-50/70 font-semibold uppercase tracking-wider text-ledger-500 dark:border-ledger-700 dark:bg-white/[0.03]">
              <tr>
                <th className="px-4 py-3">Branch / Location</th>
                <th className="px-4 py-3 text-right">On Hand Qty</th>
                <th className="px-4 py-3 text-right">Min Threshold</th>
                <th className="px-4 py-3 text-right">Reorder Point</th>
                <th className="px-4 py-3 text-right">Branch Stock Value</th>
                <th className="px-4 py-3">Health Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ledger-100 dark:divide-ledger-700/50">
              {product.branches.map((b) => {
                const isLow = b.quantity <= (b.minStock || 3);
                return (
                  <tr key={b.id} className="hover:bg-ledger-50/40 dark:hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-semibold text-ink-900 dark:text-white">{b.name}</td>
                    <td className="px-4 py-3 text-right font-display font-bold text-base text-blue-600 dark:text-blue-400">
                      {b.quantity}
                    </td>
                    <td className="px-4 py-3 text-right text-ledger-500">{b.minStock || 3}</td>
                    <td className="px-4 py-3 text-right text-ledger-500">{b.reorderPoint || 5}</td>
                    <td className="px-4 py-3 text-right font-semibold text-ink-900 dark:text-white">
                      {currency} {formatLedgerMoney(b.quantity * product.costPrice, currency)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                        isLow
                          ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                          : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                      }`}>
                        {isLow ? "Low Stock" : "In Stock"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="ghost" onClick={onOpenTransferModal} className="h-7 text-xs text-blue-600 hover:text-blue-700">
                        Transfer
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (activeTab === "Serial / Batch") {
    const handleAddSerial = () => {
      if (!newSerialInput.trim()) return;
      setSerials((prev) => [
        {
          id: `s-${Date.now()}`,
          serialNo: newSerialInput.trim(),
          batchNo: "B2025-05-A",
          location: "Accra Main Branch",
          status: "Available",
          dateAdded: "Just now",
        },
        ...prev,
      ]);
      setNewSerialInput("");
      setShowAddSerial(false);
    };

    return (
      <div className="space-y-4 animate-in fade-in duration-150">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm text-ink-900 dark:text-white">Serial & Batch Number Tracking</h3>
            <p className="text-xs text-ledger-400">Track unique IMEI / Serialized hardware units for this product</p>
          </div>
          <Button size="sm" onClick={() => setShowAddSerial(!showAddSerial)} className="gap-1.5 rounded-xl bg-blue-600 text-xs text-white hover:bg-blue-700">
            <Plus className="h-3.5 w-3.5" />
            Register Serial Number
          </Button>
        </div>

        {showAddSerial && (
          <div className="flex items-center gap-2 rounded-2xl border border-ledger-200 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <input
              type="text"
              placeholder="Enter unique Serial / IMEI Number (e.g. SN-SAM-23-009185)..."
              value={newSerialInput}
              onChange={(e) => setNewSerialInput(e.target.value)}
              className="flex-1 rounded-xl border border-ledger-200 px-3 py-2 text-xs font-mono text-ink-900 focus:border-blue-600 focus:outline-hidden dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
            />
            <Button size="sm" onClick={handleAddSerial} className="rounded-xl bg-blue-600 text-xs text-white hover:bg-blue-700">
              Save Serial
            </Button>
          </div>
        )}

        <div className="overflow-hidden rounded-2xl border border-ledger-100 bg-white shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-ledger-100 bg-ledger-50/70 font-semibold uppercase tracking-wider text-ledger-500 dark:border-ledger-700 dark:bg-white/[0.03]">
              <tr>
                <th className="px-4 py-3">Serial / IMEI No</th>
                <th className="px-4 py-3">Batch Reference</th>
                <th className="px-4 py-3">Current Location</th>
                <th className="px-4 py-3">Registration Date</th>
                <th className="px-4 py-3">Unit Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ledger-100 dark:divide-ledger-700/50">
              {serials.map((s) => (
                <tr key={s.id} className="hover:bg-ledger-50/40 dark:hover:bg-white/[0.02]">
                  <td className="px-4 py-3 font-mono font-bold text-ink-900 dark:text-white">{s.serialNo}</td>
                  <td className="px-4 py-3 font-mono text-ledger-500">{s.batchNo}</td>
                  <td className="px-4 py-3 font-medium text-ink-900 dark:text-white">{s.location}</td>
                  <td className="px-4 py-3 text-ledger-500">{s.dateAdded}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                      s.status === "Available"
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                        : "bg-ledger-100 text-ledger-600 dark:bg-white/[0.06] dark:text-ledger-300"
                    }`}>
                      {s.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (activeTab === "Documents") {
    const handleAddDoc = () => {
      const name = prompt("Enter document title (e.g. Conformity_Certificate.pdf):");
      if (!name) return;
      setDocuments((prev) => [
        {
          id: `d-${Date.now()}`,
          name: name.endsWith(".pdf") ? name : `${name}.pdf`,
          size: "1.2 MB",
          type: "PDF Document",
          uploadedAt: "Just now",
        },
        ...prev,
      ]);
    };

    return (
      <div className="space-y-4 animate-in fade-in duration-150">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm text-ink-900 dark:text-white">Product Documents & Attachments</h3>
            <p className="text-xs text-ledger-400">Spec sheets, warranty policies, compliance certificates, and supplier invoices</p>
          </div>
          <Button size="sm" onClick={handleAddDoc} className="gap-1.5 rounded-xl bg-blue-600 text-xs text-white hover:bg-blue-700">
            <Upload className="h-3.5 w-3.5" />
            Upload Document
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {documents.map((doc) => (
            <div key={doc.id} className="flex flex-col justify-between rounded-2xl border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-xs text-ink-900 dark:text-white">{doc.name}</p>
                  <p className="text-[11px] text-ledger-400">{doc.size} · {doc.type}</p>
                  <p className="mt-1 text-[10px] text-ledger-400">Uploaded {doc.uploadedAt}</p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-end gap-2 border-t border-ledger-100 pt-3 dark:border-ledger-700">
                <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-blue-600 hover:text-blue-700">
                  <Download className="h-3.5 w-3.5" />
                  Download
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}
