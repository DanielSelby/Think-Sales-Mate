"use client";

import { useEffect, useMemo, useState, useTransition, Fragment } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
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
  MoreVertical,
  Eye,
  Copy,
  Ban,
  ArrowUpRight,
  ArrowDownRight,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { updateTransferStatus, getTransferItems, type TransferItemDetail } from "@/app/(dashboard)/inventory/transfers/actions";
import { TransferStatusBadge } from "@/components/inventory/transfer-status-badge";
import type { TransferStatus, LocationType } from "@/types/database";

export interface TransferRow {
  id: string;
  label: string;
  status: TransferStatus;
  reason: string | null;
  notes: string | null;
  transferDate: string;
  createdAt: string;
  completedAt: string | null;
  fromLocationId: string;
  fromLocationName: string;
  toLocationId: string;
  toLocationName: string;
  productCount: number;
  productIds: string[];
  totalQuantity: number;
  totalValue: number;
  requestedByEmail: string;
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

type SortKey = "date-desc" | "date-asc" | "value-desc" | "value-asc" | "qty-desc" | "qty-asc";
const PAGE_SIZE = 10;
const STATUS_COLORS: Record<TransferStatus, string> = {
  pending: "#94a3b8",
  in_transit: "#d97706",
  completed: "#16a34a",
  cancelled: "#dc2626"
};

function formatMoney(value: number) {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function KpiCard({ label, value, change, suffix }: { label: string; value: string; change: number; suffix?: string }) {
  const positive = change >= 0;
  return (
    <div className="rounded-card border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900">
      <p className="text-xs text-ledger-400">{label}</p>
      <p className="figure mt-1 text-xl font-semibold text-ink-900 dark:text-white">
        {value}
        {suffix && <span className="ml-1 text-xs font-normal text-ledger-400">{suffix}</span>}
      </p>
      <p className={cn("mt-1 flex items-center gap-1 text-xs font-medium", positive ? "text-signal" : "text-alert")}>
        {positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
        {Math.abs(change)}% vs last month
      </p>
    </div>
  );
}

function TransferRowDetails({ transferId }: { transferId: string }) {
  const [items, setItems] = useState<TransferItemDetail[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getTransferItems(transferId).then((data) => {
      if (!cancelled) setItems(data);
    });
    return () => {
      cancelled = true;
    };
  }, [transferId]);

  if (!items) {
    return <p className="px-4 py-3 text-xs text-ledger-400">Loading items…</p>;
  }

  return (
    <div className="bg-ledger-50 px-4 py-3 dark:bg-white/[0.02]">
      <table className="w-full text-xs">
        <thead className="text-left uppercase tracking-wide text-ledger-400">
          <tr>
            <th className="pb-1.5">Product</th>
            <th className="pb-1.5">SKU</th>
            <th className="pb-1.5 text-right">Qty</th>
            <th className="pb-1.5 text-right">Unit cost</th>
            <th className="pb-1.5 text-right">Total value</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.productId} className="border-t border-ledger-100 dark:border-ledger-700/50">
              <td className="py-1.5 text-ink-900 dark:text-white">{item.productName}</td>
              <td className="py-1.5 font-mono text-ledger-400">{item.sku}</td>
              <td className="py-1.5 text-right figure text-ledger-600 dark:text-ledger-300">{item.quantity}</td>
              <td className="py-1.5 text-right figure text-ledger-500 dark:text-ledger-400">${formatMoney(item.unitCost)}</td>
              <td className="py-1.5 text-right figure font-medium text-ink-900 dark:text-white">
                ${formatMoney(item.unitCost * item.quantity)}
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={5} className="py-2 text-center text-ledger-400">
                No items on this transfer.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function TransferHistory({
  transfers,
  kpis,
  locations,
  products,
  canManage
}: {
  transfers: TransferRow[];
  kpis: Kpis;
  locations: TransferFilterLocation[];
  products: TransferFilterProduct[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<"all" | "completed" | "pending" | "in_transit" | "cancelled">("all");
  const [search, setSearch] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [destFilter, setDestFilter] = useState("all");
  const [reasonFilter, setReasonFilter] = useState("all");
  const [requestedByFilter, setRequestedByFilter] = useState("all");
  const [productFilter, setProductFilter] = useState("all");

  const [sortKey, setSortKey] = useState<SortKey>("date-desc");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const reasons = useMemo(() => [...new Set(transfers.map((t) => t.reason).filter(Boolean) as string[])].sort(), [transfers]);
  const requesters = useMemo(() => [...new Set(transfers.map((t) => t.requestedByEmail).filter((e) => e !== "—"))].sort(), [transfers]);

  const counts = {
    all: transfers.length,
    completed: transfers.filter((t) => t.status === "completed").length,
    pending: transfers.filter((t) => t.status === "pending").length,
    in_transit: transfers.filter((t) => t.status === "in_transit").length,
    cancelled: transfers.filter((t) => t.status === "cancelled").length
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transfers.filter((t) => {
      if (tab !== "all" && t.status !== tab) return false;
      if (q && !t.label.toLowerCase().includes(q) && !t.fromLocationName.toLowerCase().includes(q) && !t.toLocationName.toLowerCase().includes(q)) {
        return false;
      }
      if (dateFrom && t.transferDate < dateFrom) return false;
      if (dateTo && t.transferDate > dateTo) return false;
      if (sourceFilter !== "all" && t.fromLocationId !== sourceFilter) return false;
      if (destFilter !== "all" && t.toLocationId !== destFilter) return false;
      if (reasonFilter !== "all" && t.reason !== reasonFilter) return false;
      if (requestedByFilter !== "all" && t.requestedByEmail !== requestedByFilter) return false;
      if (productFilter !== "all" && !t.productIds.includes(productFilter)) return false;
      return true;
    });
  }, [transfers, tab, search, dateFrom, dateTo, sourceFilter, destFilter, reasonFilter, requestedByFilter, productFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    switch (sortKey) {
      case "date-asc":
        return arr.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      case "value-desc":
        return arr.sort((a, b) => b.totalValue - a.totalValue);
      case "value-asc":
        return arr.sort((a, b) => a.totalValue - b.totalValue);
      case "qty-desc":
        return arr.sort((a, b) => b.totalQuantity - a.totalQuantity);
      case "qty-asc":
        return arr.sort((a, b) => a.totalQuantity - b.totalQuantity);
      default:
        return arr.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
  }, [filtered, sortKey]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const statusBreakdown = useMemo(() => {
    const order: TransferStatus[] = ["completed", "pending", "in_transit", "cancelled"];
    return order.map((s) => ({ status: s, count: transfers.filter((t) => t.status === s).length })).filter((s) => s.count > 0);
  }, [transfers]);

  const topRoutes = useMemo(() => {
    const map = new Map<string, { from: string; to: string; count: number }>();
    for (const t of transfers) {
      const key = `${t.fromLocationName} → ${t.toLocationName}`;
      const existing = map.get(key) ?? { from: t.fromLocationName, to: t.toLocationName, count: 0 };
      existing.count++;
      map.set(key, existing);
    }
    const max = Math.max(1, ...[...map.values()].map((v) => v.count));
    return [...map.entries()]
      .map(([key, v]) => ({ key, ...v, pct: Math.round((v.count / max) * 100) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [transfers]);

  const reasonBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of transfers) {
      const key = t.reason ?? "Unspecified";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    const total = [...map.values()].reduce((s, v) => s + v, 0);
    return [...map.entries()]
      .map(([reason, count]) => ({ reason, count, pct: total > 0 ? Math.round((count / total) * 100) : 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [transfers]);

  function clearFilters() {
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setSourceFilter("all");
    setDestFilter("all");
    setReasonFilter("all");
    setRequestedByFilter("all");
    setProductFilter("all");
    setPage(1);
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllOnPage() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = pageItems.every((t) => next.has(t.id));
      pageItems.forEach((t) => (allSelected ? next.delete(t.id) : next.add(t.id)));
      return next;
    });
  }

  function handleCancel(transfer: TransferRow) {
    if (!confirm(`Cancel transfer ${transfer.label}? Any stock already deducted from the source will be restored.`)) return;
    startTransition(async () => {
      const result = await updateTransferStatus(transfer.id, "cancelled");
      if (result?.error) setError(result.error);
    });
  }

  function handleBulkCancel() {
    const cancellable = transfers.filter((t) => selectedIds.has(t.id) && (t.status === "pending" || t.status === "in_transit"));
    if (cancellable.length === 0) {
      setError("None of the selected transfers can be cancelled (only pending/in-transit transfers can be).");
      return;
    }
    if (!confirm(`Cancel ${cancellable.length} transfer(s)? Stock already deducted from source locations will be restored.`)) return;
    startTransition(async () => {
      for (const t of cancellable) {
        await updateTransferStatus(t.id, "cancelled");
      }
      setSelectedIds(new Set());
    });
  }

  function handleDuplicate(transfer: TransferRow) {
    const params = new URLSearchParams({
      from: transfer.fromLocationId,
      to: transfer.toLocationId,
      reason: transfer.reason ?? ""
    });
    router.push(`/inventory/transfers/new?${params.toString()}`);
  }

  function handleExport() {
    const headers = ["Transfer", "Date", "Source", "Destination", "Products", "Qty", "Value", "Requested by", "Status"];
    const rows = sorted.map((t) =>
      [
        t.label,
        t.transferDate,
        t.fromLocationName,
        t.toLocationName,
        String(t.productCount),
        String(t.totalQuantity),
        t.totalValue.toFixed(2),
        t.requestedByEmail,
        t.status
      ].join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transfer-history.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handlePrint(transfer?: TransferRow) {
    const rows = transfer ? [transfer] : sorted;
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    const body = rows
      .map(
        (t) =>
          `<tr><td>${t.label}</td><td>${t.transferDate}</td><td>${t.fromLocationName} → ${t.toLocationName}</td><td>${t.productCount}</td><td>${t.totalQuantity}</td><td>$${formatMoney(t.totalValue)}</td><td>${t.status}</td></tr>`
      )
      .join("");
    win.document.write(`
      <html><head><title>Stock Transfer History</title>
      <style>body{font-family:sans-serif;padding:16px}table{width:100%;border-collapse:collapse}
      th,td{border:1px solid #ddd;padding:6px 10px;text-align:left;font-size:12px}</style></head>
      <body><h2>Stock Transfer History</h2>
      <table><thead><tr><th>Transfer</th><th>Date</th><th>Route</th><th>Products</th><th>Qty</th><th>Value</th><th>Status</th></tr></thead>
      <tbody>${body}</tbody></table>
      <p style="font-size:11px;color:#888;margin-top:12px">Use your browser's print dialog to save this as a PDF.</p>
      </body></html>
    `);
    win.document.close();
    win.focus();
    win.print();
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs text-ledger-400">Inventory &gt; Stock Transfer History</p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-ink-900 dark:text-white">Stock transfer history</h1>
          <p className="text-sm text-ledger-500 dark:text-ledger-400">
            View, track, and manage all inventory transfers across warehouses, branches, stores, and other locations.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
          <Button variant="outline" onClick={() => handlePrint()}>
            <Printer className="h-3.5 w-3.5" />
            Print
          </Button>
          <Button variant="outline" onClick={() => setShowAdvanced((s) => !s)}>
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Advanced filters
          </Button>
          {canManage && (
            <Link href="/inventory/transfers/new">
              <Button>
                <Plus className="h-3.5 w-3.5" />
                New stock transfer
              </Button>
            </Link>
          )}
        </div>
      </div>

      {error && (
        <p className="flex items-center justify-between rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">
          {error}
          <button onClick={() => setError(null)} aria-label="Dismiss">
            <X className="h-3.5 w-3.5" />
          </button>
        </p>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Total transfers" value={kpis.total.value.toLocaleString()} change={kpis.total.change} />
        <KpiCard label="Completed" value={kpis.completed.value.toLocaleString()} change={kpis.completed.change} />
        <KpiCard label="Pending / in transit" value={kpis.pending.value.toLocaleString()} change={kpis.pending.change} />
        <KpiCard label="Cancelled" value={kpis.cancelled.value.toLocaleString()} change={kpis.cancelled.change} />
        <KpiCard label="Qty transferred" value={kpis.totalQuantity.value.toLocaleString()} change={kpis.totalQuantity.change} />
        <KpiCard label="Value transferred" value={`$${formatMoney(kpis.totalValue.value)}`} change={kpis.totalValue.change} />
      </div>

      {/* Search + quick filters */}
      <div className="space-y-3 rounded-card border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ledger-400" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by transfer number or location…"
            className="h-10 w-full rounded-md border border-ledger-200 bg-white pl-9 pr-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
          />
        </div>

        {showAdvanced && (
          <div className="space-y-3 border-t border-ledger-100 pt-3 dark:border-ledger-700">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-9 rounded-md border border-ledger-200 bg-white px-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-9 rounded-md border border-ledger-200 bg-white px-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
              />
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="h-9 rounded-md border border-ledger-200 bg-white px-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
              >
                <option value="all">All source locations</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              <select
                value={destFilter}
                onChange={(e) => setDestFilter(e.target.value)}
                className="h-9 rounded-md border border-ledger-200 bg-white px-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
              >
                <option value="all">All destination locations</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <select
                value={reasonFilter}
                onChange={(e) => setReasonFilter(e.target.value)}
                className="h-9 rounded-md border border-ledger-200 bg-white px-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
              >
                <option value="all">All reasons</option>
                {reasons.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <select
                value={requestedByFilter}
                onChange={(e) => setRequestedByFilter(e.target.value)}
                className="h-9 rounded-md border border-ledger-200 bg-white px-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
              >
                <option value="all">All requesters</option>
                {requesters.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <select
                value={productFilter}
                onChange={(e) => setProductFilter(e.target.value)}
                className="h-9 rounded-md border border-ledger-200 bg-white px-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
              >
                <option value="all">All products</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
              <Button size="sm" onClick={() => setPage(1)}>
                Apply filters
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-ledger-100 dark:border-ledger-700">
        {[
          { key: "all", label: "All Transfers" },
          { key: "completed", label: "Completed" },
          { key: "pending", label: "Pending" },
          { key: "in_transit", label: "In Transit" },
          { key: "cancelled", label: "Cancelled" }
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setTab(t.key as typeof tab);
              setPage(1);
            }}
            className={cn(
              "shrink-0 border-b-2 px-3 pb-2.5 text-sm font-medium transition-colors",
              tab === t.key
                ? "border-signal text-ink-900 dark:text-white"
                : "border-transparent text-ledger-500 hover:text-ink-900 dark:text-ledger-400 dark:hover:text-white"
            )}
          >
            {t.label} <span className="ml-1 text-xs text-ledger-400">{counts[t.key as keyof typeof counts]}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">
        {/* Table column */}
        <div className="space-y-4 lg:col-span-3">
          {selectedIds.size > 0 && canManage && (
            <div className="flex items-center justify-between rounded-md bg-signal-soft px-3 py-2 text-sm">
              <span className="text-signal">{selectedIds.size} selected</span>
              <Button size="sm" variant="destructive" onClick={handleBulkCancel} disabled={isPending}>
                <Ban className="h-3.5 w-3.5" />
                Cancel selected
              </Button>
            </div>
          )}

          {pageItems.length === 0 ? (
            <div className="rounded-card border border-dashed border-ledger-200 bg-white p-10 text-center dark:border-ledger-700 dark:bg-ink-900">
              <p className="text-sm text-ledger-500 dark:text-ledger-400">No transfers match these filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-card border border-ledger-100 bg-white shadow-card dark:border-ledger-700 dark:bg-ink-900">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-[1] border-b border-ledger-100 bg-white text-left text-xs font-medium uppercase tracking-wide text-ledger-400 dark:border-ledger-700 dark:bg-ink-900">
                  <tr>
                    <th className="w-8 px-3 py-3">
                      <input type="checkbox" checked={pageItems.every((t) => selectedIds.has(t.id))} onChange={toggleSelectAllOnPage} />
                    </th>
                    <th className="px-2 py-3">Transfer</th>
                    <th className="px-2 py-3">
                      <button
                        className="flex items-center gap-1"
                        onClick={() => setSortKey(sortKey === "date-desc" ? "date-asc" : "date-desc")}
                      >
                        Date {sortKey === "date-desc" ? <ChevronDown className="h-3 w-3" /> : sortKey === "date-asc" ? <ChevronUp className="h-3 w-3" /> : null}
                      </button>
                    </th>
                    <th className="px-2 py-3">Route</th>
                    <th className="px-2 py-3 text-right">Products</th>
                    <th className="px-2 py-3 text-right">
                      <button
                        className="ml-auto flex items-center gap-1"
                        onClick={() => setSortKey(sortKey === "qty-desc" ? "qty-asc" : "qty-desc")}
                      >
                        Qty {sortKey === "qty-desc" ? <ChevronDown className="h-3 w-3" /> : sortKey === "qty-asc" ? <ChevronUp className="h-3 w-3" /> : null}
                      </button>
                    </th>
                    <th className="px-2 py-3 text-right">
                      <button
                        className="ml-auto flex items-center gap-1"
                        onClick={() => setSortKey(sortKey === "value-desc" ? "value-asc" : "value-desc")}
                      >
                        Value {sortKey === "value-desc" ? <ChevronDown className="h-3 w-3" /> : sortKey === "value-asc" ? <ChevronUp className="h-3 w-3" /> : null}
                      </button>
                    </th>
                    <th className="px-2 py-3">Requested by</th>
                    <th className="px-2 py-3">Status</th>
                    <th className="w-10 px-2 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((t) => (
                    <Fragment key={t.id}>
                      <tr className="border-b border-ledger-50 last:border-0 dark:border-ledger-700/50">
                        <td className="px-3 py-3">
                          <input type="checkbox" checked={selectedIds.has(t.id)} onChange={() => toggleSelect(t.id)} />
                        </td>
                        <td className="px-2 py-3">
                          <button
                            onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                            className="flex items-center gap-1 font-medium text-signal hover:underline"
                          >
                            {expandedId === t.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            {t.label}
                          </button>
                        </td>
                        <td className="px-2 py-3 text-xs text-ledger-500 dark:text-ledger-400">
                          {new Date(t.createdAt).toLocaleDateString()}
                          <br />
                          {new Date(t.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="px-2 py-3 text-xs text-ledger-600 dark:text-ledger-300">
                          {t.fromLocationName} → {t.toLocationName}
                        </td>
                        <td className="px-2 py-3 text-right figure text-ledger-500 dark:text-ledger-400">{t.productCount}</td>
                        <td className="px-2 py-3 text-right figure text-ledger-500 dark:text-ledger-400">{t.totalQuantity}</td>
                        <td className="px-2 py-3 text-right figure font-medium text-ink-900 dark:text-white">
                          ${formatMoney(t.totalValue)}
                        </td>
                        <td className="px-2 py-3 text-xs text-ledger-500 dark:text-ledger-400">{t.requestedByEmail}</td>
                        <td className="px-2 py-3">
                          <TransferStatusBadge status={t.status} />
                        </td>
                        <td className="px-2 py-3">
                          <div className="relative flex justify-end">
                            <button
                              onClick={() => setOpenMenuId(openMenuId === t.id ? null : t.id)}
                              className="text-ledger-400 hover:text-ink-900 dark:hover:text-white"
                              aria-label="More actions"
                            >
                              <MoreVertical className="h-3.5 w-3.5" />
                            </button>
                            {openMenuId === t.id && (
                              <div className="absolute right-0 top-6 z-10 w-40 rounded-md border border-ledger-100 bg-white py-1 text-left shadow-card-hover dark:border-ledger-700 dark:bg-ink-900">
                                <Link
                                  href={`/inventory/transfers/${t.id}`}
                                  className="flex items-center gap-2 px-3 py-1.5 text-xs text-ledger-600 hover:bg-ledger-50 dark:text-ledger-300 dark:hover:bg-white/[0.06]"
                                >
                                  <Eye className="h-3.5 w-3.5" /> View
                                </Link>
                                <button
                                  onClick={() => handlePrint(t)}
                                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ledger-600 hover:bg-ledger-50 dark:text-ledger-300 dark:hover:bg-white/[0.06]"
                                >
                                  <Printer className="h-3.5 w-3.5" /> Print / Save as PDF
                                </button>
                                {canManage && (
                                  <button
                                    onClick={() => handleDuplicate(t)}
                                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ledger-600 hover:bg-ledger-50 dark:text-ledger-300 dark:hover:bg-white/[0.06]"
                                  >
                                    <Copy className="h-3.5 w-3.5" /> Duplicate
                                  </button>
                                )}
                                {canManage && (t.status === "pending" || t.status === "in_transit") && (
                                  <button
                                    onClick={() => handleCancel(t)}
                                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-alert hover:bg-alert-soft"
                                  >
                                    <Ban className="h-3.5 w-3.5" /> Cancel
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expandedId === t.id && (
                        <tr>
                          <td colSpan={9} className="p-0">
                            <TransferRowDetails transferId={t.id} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-ledger-200 text-ledger-500 disabled:opacity-30 dark:border-ledger-700"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm text-ledger-500 dark:text-ledger-400">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-ledger-200 text-ledger-500 disabled:opacity-30 dark:border-ledger-700"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* Analytics sidebar */}
        <div className="space-y-5">
          {statusBreakdown.length > 0 && (
            <div className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
              <h3 className="text-sm font-semibold text-ink-900 dark:text-white">Transfer overview</h3>
              <div className="mt-3 flex items-center gap-4">
                <div className="h-28 w-28 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusBreakdown} dataKey="count" nameKey="status" innerRadius={30} outerRadius={50} paddingAngle={2}>
                        {statusBreakdown.map((s) => (
                          <Cell key={s.status} fill={STATUS_COLORS[s.status]} stroke="none" />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="flex-1 space-y-1.5">
                  {statusBreakdown.map((s) => (
                    <li key={s.status} className="flex items-center gap-2 text-xs">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLORS[s.status] }} />
                      <span className="flex-1 truncate capitalize text-ledger-600 dark:text-ledger-300">{s.status.replace("_", " ")}</span>
                      <span className="figure text-ledger-400">{s.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {topRoutes.length > 0 && (
            <div className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
              <h3 className="text-sm font-semibold text-ink-900 dark:text-white">Top transfer routes</h3>
              <ul className="mt-3 space-y-2.5">
                {topRoutes.map((r) => (
                  <li key={r.key}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="truncate text-ledger-600 dark:text-ledger-300">
                        {r.from} → {r.to}
                      </span>
                      <span className="text-ledger-400">{r.count}</span>
                    </div>
                    <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-ledger-100 dark:bg-white/[0.06]">
                      <div className="h-full bg-signal" style={{ width: `${r.pct}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {reasonBreakdown.length > 0 && (
            <div className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
              <h3 className="text-sm font-semibold text-ink-900 dark:text-white">Transfer reasons</h3>
              <ul className="mt-3 space-y-2.5">
                {reasonBreakdown.map((r) => (
                  <li key={r.reason}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-ledger-600 dark:text-ledger-300">{r.reason}</span>
                      <span className="text-ledger-400">
                        {r.count} ({r.pct}%)
                      </span>
                    </div>
                    <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-ledger-100 dark:bg-white/[0.06]">
                      <div className="h-full bg-signal" style={{ width: `${r.pct}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}