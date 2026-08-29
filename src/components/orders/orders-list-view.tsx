"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search, Filter, Calendar, RefreshCw, Download, MoreVertical,
  ShoppingBag, Hourglass, CheckCircle, Truck, Home, XCircle,
  Coins, Clock, ChevronLeft, ChevronRight, Eye, Check, X,
  MapPin, User, Package, Box, Layers, ArrowUpRight, Loader2,
  Building2, ShieldAlert
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/sales/format";
import { useAppStore, THEMES } from "@/store/useAppStore";
import {
  ORDER_STATUS_LABEL, ORDER_STATUS_TONE,
  PAYMENT_STATUS_LABEL, PAYMENT_STATUS_TONE,
  DELIVERY_STATUS_LABEL, DELIVERY_STATUS_TONE,
} from "@/lib/customer-portal/format";
import {
  assignOrderBranch, approveAndProcessOrder, updateOrderFulfillmentStatus,
  declineOrder, convertOrderToSale, setOrderPaymentStatus,
} from "@/app/(dashboard)/orders/actions";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { CustomerOrderStatus, OrderPaymentStatus, OrderDeliveryStatus, MemberRole } from "@/types/database";

export interface OrderItem {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface OrderTimelineEvent {
  id?: string;
  title: string;
  actorName: string;
  actorId?: string | null;
  status?: string;
  notes?: string | null;
  createdAt: string;
}

export interface OrderRow {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  deliveryAddress: string;
  deliveryOption: string | null;
  deliveryFee: number;
  notes: string | null;
  adminNotes: string | null;
  subtotal: number;
  total: number;
  paymentMethod: string;
  paymentStatus: OrderPaymentStatus;
  deliveryStatus: OrderDeliveryStatus;
  status: CustomerOrderStatus;
  locationId: string | null;
  branchName: string | null;
  salesPersonId: string | null;
  salesPersonName: string | null;
  expectedDeliveryDate: string | null;
  stockReserved: boolean;
  createdAt: string;
  items: OrderItem[];
  timeline: OrderTimelineEvent[];
}

export interface LocationOption {
  id: string;
  name: string;
  city: string | null;
}

export interface StaffOption {
  id: string;
  name: string;
  avatarUrl: string | null;
}

interface OrdersListViewProps {
  orders: OrderRow[];
  currency: string;
  locations: LocationOption[];
  staff: StaffOption[];
  customerNames: string[];
  userRole: MemberRole;
  canViewAll: boolean;
  userLocationId: string | null;
}

type TabKey = "all" | CustomerOrderStatus | "unassigned";

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "All Orders" },
  { key: "new", label: "New" },
  { key: "approved", label: "Approved" },
  { key: "picking", label: "Picking" },
  { key: "packing", label: "Packing" },
  { key: "delivery", label: "Delivery" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
  { key: "returned", label: "Returned" },
  { key: "unassigned", label: "Unassigned" },
];

export function OrdersListView({
  orders,
  currency,
  locations,
  staff,
  customerNames,
  userRole,
  canViewAll,
  userLocationId,
}: OrdersListViewProps) {
  const router = useRouter();
  const { activeTheme } = useAppStore();
  const theme = THEMES[activeTheme] || THEMES.fintech;

  // Filters state
  const [tab, setTab] = React.useState<TabKey>("all");
  const [query, setQuery] = React.useState("");
  const [customerFilter, setCustomerFilter] = React.useState("all");
  const [branchFilter, setBranchFilter] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [paymentFilter, setPaymentFilter] = React.useState("all");
  const [deliveryFilter, setDeliveryFilter] = React.useState("all");
  const [dateRange, setDateRange] = React.useState({ start: "", end: "" });

  // Pagination state
  const [pageSize, setPageSize] = React.useState(10);
  const [page, setPage] = React.useState(1);

  // Active / Selected order for Right Sidebar
  const [selectedOrderId, setSelectedOrderId] = React.useState<string>(orders[0]?.id ?? "");
  const selectedOrder = orders.find((o) => o.id === selectedOrderId) || orders[0] || null;

  // Modals & Action transitions
  const [isPending, startTransition] = React.useTransition();
  const [actionMenuOrderId, setActionMenuOrderId] = React.useState<string | null>(null);
  const [assignModalOrder, setAssignModalOrder] = React.useState<OrderRow | null>(null);
  const [selectedBranchId, setSelectedBranchId] = React.useState<string>("");
  const [rejectModalOrder, setRejectModalOrder] = React.useState<OrderRow | null>(null);
  const [rejectReason, setRejectReason] = React.useState("");
  const [timelineModalOpen, setTimelineModalOpen] = React.useState(false);

  // Close menus when clicking outside
  React.useEffect(() => {
    function handleClickOutside() {
      setActionMenuOrderId(null);
    }
    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, []);

  // Compute 8 Top Metrics
  const metrics = React.useMemo(() => {
    const totalOrders = orders.length;
    const pendingOrders = orders.filter((o) => o.status === "new" || o.status === "processing").length;
    const approvedOrders = orders.filter((o) => o.status === "approved").length;
    const ordersInDelivery = orders.filter((o) => o.status === "delivery" || o.deliveryStatus === "in_delivery").length;
    const deliveredOrders = orders.filter((o) => o.status === "completed" || o.deliveryStatus === "delivered").length;
    const cancelledOrders = orders.filter((o) => o.status === "cancelled").length;

    // Order Value Today
    const today = new Date().toISOString().slice(0, 10);
    const orderValueToday = orders
      .filter((o) => o.createdAt.startsWith(today))
      .reduce((sum, o) => sum + o.total, 0);

    return {
      totalOrders,
      pendingOrders,
      approvedOrders,
      ordersInDelivery,
      deliveredOrders,
      cancelledOrders,
      orderValueToday,
      avgProcessingTime: "2h 45m",
    };
  }, [orders]);

  // Compute Tab Counts
  const counts = React.useMemo(() => {
    const map: Record<TabKey, number> = {
      all: orders.length,
      new: 0,
      approved: 0,
      picking: 0,
      packing: 0,
      delivery: 0,
      completed: 0,
      cancelled: 0,
      returned: 0,
      unassigned: 0,
      processing: 0,
      reviewed: 0,
    };
    for (const o of orders) {
      if (o.status in map) {
        map[o.status as TabKey] += 1;
      }
      if (!o.locationId) {
        map.unassigned += 1;
      }
    }
    return map;
  }, [orders]);

  // Compute Kanban Overview Stats
  const kanbanStats = React.useMemo(() => {
    const getCol = (statuses: CustomerOrderStatus[]) => {
      const matching = orders.filter((o) => statuses.includes(o.status));
      return {
        count: matching.length,
        value: matching.reduce((sum, o) => sum + o.total, 0),
      };
    };

    return {
      new: getCol(["new", "processing"]),
      approved: getCol(["approved"]),
      picking: getCol(["picking"]),
      packing: getCol(["packing"]),
      delivery: getCol(["delivery"]),
      completed: getCol(["completed"]),
      cancelled: getCol(["cancelled"]),
    };
  }, [orders]);

  // Filtered Orders List
  const filteredOrders = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((o) => {
      // Tab filter
      if (tab === "unassigned") {
        if (o.locationId) return false;
      } else if (tab !== "all") {
        if (o.status !== tab) return false;
      }

      // Dropdown filters
      if (customerFilter !== "all" && o.customerName !== customerFilter) return false;
      if (branchFilter !== "all" && o.locationId !== branchFilter) return false;
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (paymentFilter !== "all" && o.paymentStatus !== paymentFilter) return false;
      if (deliveryFilter !== "all" && o.deliveryStatus !== deliveryFilter) return false;

      // Date range filter
      if (dateRange.start && new Date(o.createdAt) < new Date(dateRange.start)) return false;
      if (dateRange.end && new Date(o.createdAt) > new Date(dateRange.end + "T23:59:59")) return false;

      // Text search
      if (q) {
        const matchesNumber = o.orderNumber.toLowerCase().includes(q);
        const matchesCustomer = o.customerName.toLowerCase().includes(q);
        const matchesBranch = o.branchName?.toLowerCase().includes(q) ?? false;
        const matchesSalesPerson = o.salesPersonName?.toLowerCase().includes(q) ?? false;
        if (!matchesNumber && !matchesCustomer && !matchesBranch && !matchesSalesPerson) return false;
      }

      return true;
    });
  }, [orders, tab, query, customerFilter, branchFilter, statusFilter, paymentFilter, deliveryFilter, dateRange]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const paginatedOrders = React.useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredOrders.slice(start, start + pageSize);
  }, [filteredOrders, page, pageSize]);

  // Auto-select first order if none selected
  React.useEffect(() => {
    if (paginatedOrders.length > 0 && !paginatedOrders.some((o) => o.id === selectedOrderId)) {
      setSelectedOrderId(paginatedOrders[0].id);
    }
  }, [paginatedOrders, selectedOrderId]);

  // CSV Export Handler
  function handleExport() {
    const headers = ["Order No", "Customer", "Date", "Branch", "Sales Person", "Total Amount", "Payment Status", "Delivery Status", "Order Status"];
    const rows = filteredOrders.map((o) => [
      o.orderNumber,
      `"${o.customerName}"`,
      `"${new Date(o.createdAt).toLocaleString()}"`,
      `"${o.branchName ?? "Unassigned"}"`,
      `"${o.salesPersonName ?? "N/A"}"`,
      o.total.toFixed(2),
      o.paymentStatus,
      o.deliveryStatus,
      o.status,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `orders_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Branch Assignment submit
  function handleAssignBranch() {
    if (!assignModalOrder || !selectedBranchId) return;
    startTransition(async () => {
      await assignOrderBranch(assignModalOrder.id, selectedBranchId);
      setAssignModalOrder(null);
      router.refresh();
    });
  }

  // Order Approval
  function handleApprove(order: OrderRow) {
    startTransition(async () => {
      await approveAndProcessOrder({ orderId: order.id, locationId: order.locationId ?? undefined });
      router.refresh();
    });
  }

  // Reject / Cancel
  function handleRejectSubmit() {
    if (!rejectModalOrder) return;
    startTransition(async () => {
      await declineOrder(rejectModalOrder.id, rejectReason || undefined);
      setRejectModalOrder(null);
      setRejectReason("");
      router.refresh();
    });
  }

  // Status transition
  function handleStatusChange(order: OrderRow, status: CustomerOrderStatus, deliveryStatus?: OrderDeliveryStatus) {
    startTransition(async () => {
      await updateOrderFulfillmentStatus(order.id, status, deliveryStatus);
      router.refresh();
    });
  }

  // Convert to sale
  function handleConvertToSale(order: OrderRow) {
    startTransition(async () => {
      await convertOrderToSale(order.id);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6 pb-16">
      {/* Header & Breadcrumbs */}
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink-900 dark:text-white">Order Tracker</h1>
        <p className="text-xs text-ledger-400 dark:text-ledger-400 mt-0.5">Sales &gt; Orders &gt; Order Tracker</p>
      </div>

      {/* ── 1. Top KPI Metric Cards (8 Cards) ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <KpiCard
          label="Total Orders"
          value={metrics.totalOrders.toString()}
          trend="+18.2% this month"
          icon={ShoppingBag}
          customBg={theme.colors.primaryPale}
          customColor={theme.colors.primary}
        />
        <KpiCard
          label="Pending Orders"
          value={metrics.pendingOrders.toString()}
          trend="+12.4% this month"
          icon={Hourglass}
          iconColor="text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400"
        />
        <KpiCard
          label="Approved Orders"
          value={metrics.approvedOrders.toString()}
          trend="+16.7% this month"
          icon={CheckCircle}
          iconColor="text-green-600 bg-green-50 dark:bg-green-950/30 dark:text-green-400"
        />
        <KpiCard
          label="Orders in Delivery"
          value={metrics.ordersInDelivery.toString()}
          trend="+8.1% this month"
          icon={Truck}
          iconColor="text-blue-600 bg-blue-50 dark:bg-blue-950/30 dark:text-blue-400"
        />
        <KpiCard
          label="Delivered Orders"
          value={metrics.deliveredOrders.toString()}
          trend="+20.3% this month"
          icon={Home}
          iconColor="text-teal-600 bg-teal-50 dark:bg-teal-950/30 dark:text-teal-400"
        />
        <KpiCard
          label="Cancelled Orders"
          value={metrics.cancelledOrders.toString()}
          trend="+4.4% this month"
          icon={XCircle}
          iconColor="text-rose-600 bg-rose-50 dark:bg-rose-950/30 dark:text-rose-400"
        />
        <KpiCard
          label="Order Value Today"
          value={formatCurrency(metrics.orderValueToday, currency)}
          trend="+15.8% vs yesterday"
          icon={Coins}
          customBg={theme.colors.primaryPale}
          customColor={theme.colors.primary}
        />
        <KpiCard
          label="Avg. Processing Time"
          value={metrics.avgProcessingTime}
          trend="-8.3% vs last month"
          icon={Clock}
          iconColor="text-sky-600 bg-sky-50 dark:bg-sky-950/30 dark:text-sky-400"
        />
      </div>

      {/* ── 2. Filters Bar ── */}
      <div className="rounded-xl border border-ledger-200/80 bg-white p-4 shadow-sm dark:border-ledger-700/80 dark:bg-ink-900">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          {/* Date Range */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-ledger-400">Date Range</label>
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ledger-400" />
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange((prev) => ({ ...prev, start: e.target.value }))}
                className="h-8 w-full rounded-lg border border-ledger-200 bg-white pl-8 pr-2 text-xs text-ink-900 focus:outline-none focus:ring-1 focus:ring-signal dark:border-ledger-700 dark:bg-ink-800 dark:text-white"
              />
            </div>
          </div>

          {/* Customer */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-ledger-400">Customer</label>
            <select
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
              className="h-8 w-full rounded-lg border border-ledger-200 bg-white px-2.5 text-xs text-ink-900 focus:outline-none focus:ring-1 focus:ring-signal dark:border-ledger-700 dark:bg-ink-800 dark:text-white"
            >
              <option value="all">All Customers</option>
              {customerNames.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          {/* Branch */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-ledger-400">Branch</label>
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="h-8 w-full rounded-lg border border-ledger-200 bg-white px-2.5 text-xs text-ink-900 focus:outline-none focus:ring-1 focus:ring-signal dark:border-ledger-700 dark:bg-ink-800 dark:text-white"
            >
              <option value="all">All Branches</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>

          {/* Order Status */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-ledger-400">Order Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-8 w-full rounded-lg border border-ledger-200 bg-white px-2.5 text-xs text-ink-900 focus:outline-none focus:ring-1 focus:ring-signal dark:border-ledger-700 dark:bg-ink-800 dark:text-white"
            >
              <option value="all">All Statuses</option>
              <option value="new">New Order</option>
              <option value="approved">Approved</option>
              <option value="picking">Picking</option>
              <option value="packing">Packing</option>
              <option value="delivery">Out for Delivery</option>
              <option value="completed">Delivered</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* Payment Status */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-ledger-400">Payment Status</label>
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className="h-8 w-full rounded-lg border border-ledger-200 bg-white px-2.5 text-xs text-ink-900 focus:outline-none focus:ring-1 focus:ring-signal dark:border-ledger-700 dark:bg-ink-800 dark:text-white"
            >
              <option value="all">All Payment Status</option>
              <option value="paid">Paid</option>
              <option value="partial">Partial</option>
              <option value="unpaid">Unpaid</option>
            </select>
          </div>

          {/* Delivery Status */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-ledger-400">Delivery Status</label>
            <select
              value={deliveryFilter}
              onChange={(e) => setDeliveryFilter(e.target.value)}
              className="h-8 w-full rounded-lg border border-ledger-200 bg-white px-2.5 text-xs text-ink-900 focus:outline-none focus:ring-1 focus:ring-signal dark:border-ledger-700 dark:bg-ink-800 dark:text-white"
            >
              <option value="all">All Delivery Status</option>
              <option value="not_shipped">Not Shipped</option>
              <option value="picking">Picking</option>
              <option value="packing">Packing</option>
              <option value="in_delivery">In Delivery</option>
              <option value="delivered">Delivered</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── 3. Status Tabs & Action Controls ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ledger-200 pb-3 dark:border-ledger-700">
        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto">
          {TABS.map((t) => {
            const isActive = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); setPage(1); }}
                style={isActive ? { background: theme.colors.primary, color: "#ffffff" } : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                  isActive
                    ? "shadow-sm"
                    : "text-ledger-600 hover:bg-ledger-100 hover:text-ink-900 dark:text-ledger-300 dark:hover:bg-ink-800"
                )}
              >
                <span>{t.label}</span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.2 text-[10px]",
                    isActive
                      ? "bg-white/20 text-white"
                      : "bg-ledger-100 text-ledger-500 dark:bg-ink-700 dark:text-ledger-400"
                  )}
                >
                  {counts[t.key] ?? 0}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 rounded-lg border border-ledger-200 bg-white px-3 py-1.5 text-xs font-semibold text-ledger-700 shadow-sm hover:bg-ledger-50 dark:border-ledger-700 dark:bg-ink-800 dark:text-ledger-200"
          >
            <Download className="h-3.5 w-3.5 text-ledger-500" /> Export
          </button>
          <button
            onClick={() => router.refresh()}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-ledger-200 bg-white text-ledger-600 shadow-sm hover:bg-ledger-50 dark:border-ledger-700 dark:bg-ink-800 dark:text-ledger-200"
            title="Refresh list"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ── 4. Main Layout: Orders Table (Left) + Order Timeline & Summary (Right) ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Side: Table Area (8 Cols) */}
        <div className="space-y-4 lg:col-span-8">
          <div className="rounded-xl border border-ledger-200/80 bg-white shadow-sm dark:border-ledger-700/80 dark:bg-ink-900">
            {/* Table controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ledger-100 p-3.5 dark:border-ledger-800">
              <div className="flex items-center gap-2 text-xs text-ledger-500">
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                  className="h-7 rounded border border-ledger-200 bg-white px-2 text-xs text-ink-900 focus:outline-none dark:border-ledger-700 dark:bg-ink-800 dark:text-white"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
                <span>entries per page</span>
              </div>

              <div className="relative min-w-[200px] flex-1 max-w-xs">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ledger-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                  placeholder="Search in orders..."
                  className="h-8 w-full rounded-lg border border-ledger-200 bg-ledger-50/50 pl-8 pr-3 text-xs text-ink-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-signal dark:border-ledger-700 dark:bg-ink-800 dark:text-white"
                />
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-ledger-100 bg-ledger-50/40 text-[11px] font-semibold text-ledger-500 dark:border-ledger-800 dark:bg-ink-850 dark:text-ledger-400">
                    <th className="py-3 pl-4 pr-2">Order No.</th>
                    <th className="px-2 py-3">Customer</th>
                    <th className="px-2 py-3">Date</th>
                    <th className="px-2 py-3">Branch</th>
                    <th className="px-2 py-3">Sales Person</th>
                    <th className="px-2 py-3">Total Amount</th>
                    <th className="px-2 py-3">Payment Status</th>
                    <th className="px-2 py-3">Delivery Status</th>
                    <th className="px-2 py-3">Order Status</th>
                    <th className="px-2 py-3">Expected Delivery</th>
                    <th className="py-3 pl-2 pr-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ledger-100 dark:divide-ledger-800">
                  {paginatedOrders.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-12 text-center text-ledger-400">
                        No orders matching the current filter criteria.
                      </td>
                    </tr>
                  ) : (
                    paginatedOrders.map((o) => {
                      const isSelected = selectedOrder?.id === o.id;
                      return (
                        <tr
                          key={o.id}
                          onClick={() => setSelectedOrderId(o.id)}
                          style={isSelected ? { backgroundColor: theme.colors.primaryPale } : undefined}
                          className={cn(
                            "cursor-pointer transition-colors hover:bg-ledger-50/60 dark:hover:bg-ink-800/50",
                            isSelected && "font-medium"
                          )}
                        >
                          {/* Order No */}
                          <td className="py-3 pl-4 pr-2 font-mono font-semibold" style={{ color: theme.colors.primary }}>
                            <Link
                              href={`/orders/${o.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="hover:underline"
                            >
                              {o.orderNumber}
                            </Link>
                          </td>

                          {/* Customer with Avatar */}
                          <td className="px-2 py-3">
                            <div className="flex items-center gap-2">
                              <span
                                style={{ background: theme.colors.primaryPale, color: theme.colors.primary }}
                                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                              >
                                {o.customerName.charAt(0).toUpperCase()}
                              </span>
                              <span className="font-medium text-ink-900 dark:text-white truncate max-w-[110px]">
                                {o.customerName}
                              </span>
                            </div>
                          </td>

                          {/* Date */}
                          <td className="px-2 py-3 text-ledger-600 dark:text-ledger-300">
                            <div>
                              <span>{new Date(o.createdAt).toLocaleDateString("en-GH", { month: "short", day: "numeric", year: "numeric" })}</span>
                              <span className="block text-[10px] text-ledger-400">
                                {new Date(o.createdAt).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                          </td>

                          {/* Branch */}
                          <td className="px-2 py-3">
                            {o.branchName ? (
                              <span className="inline-flex items-center gap-1 rounded bg-ledger-100 px-2 py-0.5 text-[11px] font-medium text-ledger-700 dark:bg-ink-800 dark:text-ledger-300">
                                <Building2 className="h-3 w-3 text-ledger-400" />
                                {o.branchName}
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAssignModalOrder(o);
                                  setSelectedBranchId(locations[0]?.id ?? "");
                                }}
                                className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 border border-amber-200 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-400"
                              >
                                <MapPin className="h-3 w-3" /> Assign
                              </button>
                            )}
                          </td>

                          {/* Sales Person */}
                          <td className="px-2 py-3 text-ledger-600 dark:text-ledger-300">
                            {o.salesPersonName ?? "-"}
                          </td>

                          {/* Total Amount */}
                          <td className="px-2 py-3 font-mono font-semibold text-ink-900 dark:text-white">
                            {formatCurrency(o.total, currency)}
                          </td>

                          {/* Payment Status */}
                          <td className="px-2 py-3">
                            <span
                              className={cn(
                                "inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold",
                                o.paymentStatus === "paid" && "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
                                o.paymentStatus === "partial" && "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
                                o.paymentStatus === "unpaid" && "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                              )}
                            >
                              {PAYMENT_STATUS_LABEL[o.paymentStatus] ?? o.paymentStatus}
                            </span>
                          </td>

                          {/* Delivery Status */}
                          <td className="px-2 py-3">
                            <span
                              className={cn(
                                "inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold",
                                o.deliveryStatus === "delivered" && "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
                                o.deliveryStatus === "in_delivery" && "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
                                o.deliveryStatus === "packing" && "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300",
                                o.deliveryStatus === "picking" && "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
                                o.deliveryStatus === "not_shipped" && "bg-ledger-100 text-ledger-600 dark:bg-ink-800 dark:text-ledger-400"
                              )}
                            >
                              {DELIVERY_STATUS_LABEL[o.deliveryStatus] ?? o.deliveryStatus}
                            </span>
                          </td>

                          {/* Order Status */}
                          <td className="px-2 py-3">
                            <span
                              className={cn(
                                "inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold",
                                o.status === "new" && "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
                                o.status === "approved" && "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
                                o.status === "picking" && "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
                                o.status === "packing" && "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300",
                                o.status === "delivery" && "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
                                o.status === "completed" && "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
                                o.status === "cancelled" && "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
                                o.status === "returned" && "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300"
                              )}
                            >
                              {ORDER_STATUS_LABEL[o.status] ?? o.status}
                            </span>
                          </td>

                          {/* Expected Delivery */}
                          <td className="px-2 py-3 text-ledger-500 dark:text-ledger-400">
                            {o.expectedDeliveryDate
                              ? new Date(o.expectedDeliveryDate).toLocaleDateString("en-GH", { month: "short", day: "numeric", year: "numeric" })
                              : "-"}
                          </td>

                          {/* Actions */}
                          <td className="py-3 pl-2 pr-4 text-right relative">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActionMenuOrderId(actionMenuOrderId === o.id ? null : o.id);
                              }}
                              className="rounded p-1 text-ledger-400 hover:bg-ledger-100 hover:text-ink-900 dark:hover:bg-ink-800"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>

                            {/* Dropdown Action Menu */}
                            {actionMenuOrderId === o.id && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="absolute right-4 top-10 z-40 w-48 rounded-lg border border-ledger-200 bg-white p-1 text-left shadow-xl dark:border-ledger-700 dark:bg-ink-850"
                              >
                                <Link
                                  href={`/orders/${o.id}`}
                                  className="flex items-center gap-2 rounded px-2.5 py-1.5 text-xs text-ink-900 hover:bg-ledger-50 dark:text-white dark:hover:bg-ink-800"
                                >
                                  <Eye className="h-3.5 w-3.5 text-ledger-400" /> View Order Details
                                </Link>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setAssignModalOrder(o);
                                    setSelectedBranchId(o.locationId ?? locations[0]?.id ?? "");
                                    setActionMenuOrderId(null);
                                  }}
                                  className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs text-ink-900 hover:bg-ledger-50 dark:text-white dark:hover:bg-ink-800"
                                >
                                  <Building2 className="h-3.5 w-3.5 text-ledger-400" /> Assign Branch
                                </button>

                                {o.status === "new" && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleApprove(o);
                                      setActionMenuOrderId(null);
                                    }}
                                    className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                                  >
                                    <Check className="h-3.5 w-3.5" /> Approve Order
                                  </button>
                                )}

                                {o.status === "approved" && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleStatusChange(o, "picking");
                                      setActionMenuOrderId(null);
                                    }}
                                    className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                                  >
                                    <Package className="h-3.5 w-3.5" /> Start Picking
                                  </button>
                                )}

                                {o.status === "picking" && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleStatusChange(o, "packing");
                                      setActionMenuOrderId(null);
                                    }}
                                    className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950/30"
                                  >
                                    <Box className="h-3.5 w-3.5" /> Complete Packing
                                  </button>
                                )}

                                {o.status === "packing" && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleStatusChange(o, "delivery");
                                      setActionMenuOrderId(null);
                                    }}
                                    className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                                  >
                                    <Truck className="h-3.5 w-3.5" /> Out for Delivery
                                  </button>
                                )}

                                {o.status === "delivery" && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleStatusChange(o, "completed");
                                      setActionMenuOrderId(null);
                                    }}
                                    className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                                  >
                                    <CheckCircle className="h-3.5 w-3.5" /> Mark Delivered
                                  </button>
                                )}

                                {o.status !== "completed" && o.status !== "cancelled" && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleConvertToSale(o);
                                      setActionMenuOrderId(null);
                                    }}
                                    className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs text-ink-900 hover:bg-ledger-50 dark:text-white dark:hover:bg-ink-800"
                                  >
                                    <Coins className="h-3.5 w-3.5 text-ledger-400" /> Convert to Sale
                                  </button>
                                )}

                                {o.status !== "cancelled" && o.status !== "completed" && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setRejectModalOrder(o);
                                      setActionMenuOrderId(null);
                                    }}
                                    className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                                  >
                                    <X className="h-3.5 w-3.5" /> Reject Order
                                  </button>
                                )}
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

            {/* Pagination Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ledger-100 p-3.5 text-xs text-ledger-500 dark:border-ledger-800">
              <p>
                Showing {filteredOrders.length === 0 ? 0 : (page - 1) * pageSize + 1} to{" "}
                {Math.min(page * pageSize, filteredOrders.length)} of {filteredOrders.length} entries
              </p>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded border border-ledger-200 p-1 text-ledger-600 hover:bg-ledger-50 disabled:opacity-40 dark:border-ledger-700 dark:text-ledger-300"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                  .map((p, idx, arr) => {
                    const prev = arr[idx - 1];
                    const isCurrent = page === p;
                    return (
                      <React.Fragment key={p}>
                        {prev && p - prev > 1 && <span className="px-1 text-ledger-400">...</span>}
                        <button
                          type="button"
                          onClick={() => setPage(p)}
                          style={isCurrent ? { background: theme.colors.primary, color: "#ffffff" } : undefined}
                          className={cn(
                            "h-7 w-7 rounded font-medium",
                            !isCurrent && "border border-ledger-200 text-ledger-700 hover:bg-ledger-50 dark:border-ledger-700 dark:text-ledger-300"
                          )}
                        >
                          {p}
                        </button>
                      </React.Fragment>
                    );
                  })}
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded border border-ledger-200 p-1 text-ledger-600 hover:bg-ledger-50 disabled:opacity-40 dark:border-ledger-700 dark:text-ledger-300"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Order Timeline & Order Summary Panes (4 Cols) */}
        <div className="space-y-6 lg:col-span-4">
          {selectedOrder ? (
            <>
              {/* Order Timeline Sidebar Card */}
              <div className="rounded-xl border border-ledger-200/80 bg-white p-5 shadow-sm dark:border-ledger-700/80 dark:bg-ink-900">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-display text-sm font-bold text-ink-900 dark:text-white">Order Timeline</h3>
                  <span className="font-mono text-[11px] font-semibold" style={{ color: theme.colors.primary }}>
                    {selectedOrder.orderNumber}
                  </span>
                </div>

                <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-ledger-200 dark:before:bg-ledger-700">
                  {selectedOrder.timeline.length > 0 ? (
                    selectedOrder.timeline.map((event, idx) => (
                      <div key={idx} className="relative">
                        <span
                          style={{ background: theme.colors.primary }}
                          className="absolute -left-6 top-1 flex h-4 w-4 items-center justify-center rounded-full text-white ring-4 ring-white dark:ring-ink-900"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-white" />
                        </span>
                        <div>
                          <div className="flex items-baseline justify-between gap-1">
                            <p className="text-xs font-semibold text-ink-900 dark:text-white">{event.title}</p>
                            <span className="font-mono text-[10px] text-ledger-400">
                              {new Date(event.createdAt).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          {event.actorName && (
                            <p className="text-[11px] text-ledger-500 dark:text-ledger-400">by {event.actorName}</p>
                          )}
                          {event.notes && (
                            <p className="mt-0.5 text-[10px] text-ledger-400 italic">{event.notes}</p>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="relative">
                      <span
                        style={{ background: theme.colors.primary }}
                        className="absolute -left-6 top-1 flex h-4 w-4 items-center justify-center rounded-full text-white ring-4 ring-white dark:ring-ink-900"
                      />
                      <div>
                        <p className="text-xs font-semibold text-ink-900 dark:text-white">Order Created</p>
                        <p className="text-[11px] text-ledger-400">by {selectedOrder.customerName}</p>
                        <span className="font-mono text-[10px] text-ledger-400">
                          {new Date(selectedOrder.createdAt).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-5 border-t border-ledger-100 pt-3 text-center dark:border-ledger-800">
                  <button
                    type="button"
                    onClick={() => setTimelineModalOpen(true)}
                    style={{ color: theme.colors.primary }}
                    className="text-xs font-semibold hover:underline"
                  >
                    View Full Timeline
                  </button>
                </div>
              </div>

              {/* Order Summary Sidebar Card */}
              <div className="rounded-xl border border-ledger-200/80 bg-white p-5 shadow-sm dark:border-ledger-700/80 dark:bg-ink-900 space-y-3.5">
                <h3 className="font-display text-sm font-bold text-ink-900 dark:text-white">Order Summary</h3>

                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-ledger-500">Order No.</span>
                    <span className="font-mono font-semibold" style={{ color: theme.colors.primary }}>{selectedOrder.orderNumber}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-ledger-500">Customer</span>
                    <span className="font-medium text-ink-900 dark:text-white">{selectedOrder.customerName}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-ledger-500">Branch</span>
                    <span className="font-medium text-ink-900 dark:text-white">
                      {selectedOrder.branchName ?? "Unassigned"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-ledger-500">Sales Person</span>
                    <span className="font-medium text-ink-900 dark:text-white">
                      {selectedOrder.salesPersonName ?? "Not Assigned"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-ledger-500">Order Status</span>
                    <span className="font-semibold text-amber-700 dark:text-amber-400">
                      {ORDER_STATUS_LABEL[selectedOrder.status] ?? selectedOrder.status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-ledger-500">Payment Status</span>
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                      {PAYMENT_STATUS_LABEL[selectedOrder.paymentStatus] ?? selectedOrder.paymentStatus}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-ledger-500">Delivery Status</span>
                    <span className="font-semibold text-blue-700 dark:text-blue-400">
                      {DELIVERY_STATUS_LABEL[selectedOrder.deliveryStatus] ?? selectedOrder.deliveryStatus}
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-t border-ledger-100 pt-2 text-sm font-bold dark:border-ledger-800">
                    <span className="text-ink-900 dark:text-white">Total Amount</span>
                    <span className="font-mono" style={{ color: theme.colors.primary }}>
                      {formatCurrency(selectedOrder.total, currency)}
                    </span>
                  </div>
                </div>

                <Link
                  href={`/orders/${selectedOrder.id}`}
                  style={{ background: theme.colors.primary, color: "#ffffff" }}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-semibold shadow-sm hover:opacity-95 transition-opacity"
                >
                  View Order Details
                </Link>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-ledger-200 bg-white p-8 text-center text-xs text-ledger-400 dark:border-ledger-700 dark:bg-ink-900">
              Select an order to view summary &amp; timeline.
            </div>
          )}
        </div>
      </div>

      {/* ── 5. Bottom Section: Order Kanban Overview ── */}
      <div className="rounded-xl border border-ledger-200/80 bg-white p-5 shadow-sm dark:border-ledger-700/80 dark:bg-ink-900 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4" style={{ color: theme.colors.primary }} />
            <h3 className="font-display text-sm font-bold text-ink-900 dark:text-white">Order Kanban Overview</h3>
          </div>
          <Link
            href="/orders?view=kanban"
            style={{ color: theme.colors.primary }}
            className="inline-flex items-center gap-1 text-xs font-semibold hover:underline"
          >
            View Kanban Board <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
          <KanbanCard
            title="New Orders"
            count={kanbanStats.new.count}
            value={formatCurrency(kanbanStats.new.value, currency)}
            borderColor="border-amber-400"
          />
          <KanbanCard
            title="Approved"
            count={kanbanStats.approved.count}
            value={formatCurrency(kanbanStats.approved.value, currency)}
            borderColor="border-emerald-500"
          />
          <KanbanCard
            title="Picking"
            count={kanbanStats.picking.count}
            value={formatCurrency(kanbanStats.picking.value, currency)}
            borderColor="border-yellow-500"
          />
          <KanbanCard
            title="Packing"
            count={kanbanStats.packing.count}
            value={formatCurrency(kanbanStats.packing.value, currency)}
            borderColor="border-purple-500"
          />
          <KanbanCard
            title="Out for Delivery"
            count={kanbanStats.delivery.count}
            value={formatCurrency(kanbanStats.delivery.value, currency)}
            borderColor="border-blue-500"
          />
          <KanbanCard
            title="Delivered"
            count={kanbanStats.completed.count}
            value={formatCurrency(kanbanStats.completed.value, currency)}
            borderColor="border-teal-500"
          />
          <KanbanCard
            title="Cancelled"
            count={kanbanStats.cancelled.count}
            value={formatCurrency(kanbanStats.cancelled.value, currency)}
            borderColor="border-rose-500"
          />
        </div>
      </div>

      {/* ── Assign Branch Modal ── */}
      <Dialog
        open={Boolean(assignModalOrder)}
        onClose={() => setAssignModalOrder(null)}
        title="Assign Branch Location"
        description={assignModalOrder ? `Assign a branch to order ${assignModalOrder.orderNumber} for ${assignModalOrder.customerName}.` : ""}
      >
        <div className="space-y-4 pt-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-900 dark:text-white">Select Fulfillment Branch</label>
            <select
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              className="h-9 w-full rounded-lg border border-ledger-200 bg-white px-3 text-xs text-ink-900 focus:outline-none focus:ring-1 focus:ring-signal dark:border-ledger-700 dark:bg-ink-800 dark:text-white"
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} {l.city ? `(${l.city})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="md" onClick={() => setAssignModalOrder(null)} disabled={isPending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={handleAssignBranch}
              disabled={isPending}
              style={{ background: theme.colors.primary, color: "#ffffff" }}
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />} Assign Branch
            </Button>
          </div>
        </div>
      </Dialog>

      {/* ── Reject Modal ── */}
      <Dialog
        open={Boolean(rejectModalOrder)}
        onClose={() => setRejectModalOrder(null)}
        title="Reject / Cancel Order"
        description={rejectModalOrder ? `Are you sure you want to cancel order ${rejectModalOrder.orderNumber}?` : ""}
      >
        <div className="space-y-4 pt-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-900 dark:text-white">Rejection Reason (Optional)</label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="e.g. Out of stock, invalid delivery address, customer requested cancellation..."
              className="w-full rounded-lg border border-ledger-200 bg-white p-2.5 text-xs text-ink-900 focus:outline-none focus:ring-1 focus:ring-rose-500 dark:border-ledger-700 dark:bg-ink-800 dark:text-white"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="md" onClick={() => setRejectModalOrder(null)} disabled={isPending}>
              Cancel
            </Button>
            <Button variant="destructive" size="md" onClick={handleRejectSubmit} disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />} Reject Order
            </Button>
          </div>
        </div>
      </Dialog>

      {/* ── Full Timeline Modal ── */}
      <Dialog
        open={timelineModalOpen}
        onClose={() => setTimelineModalOpen(false)}
        title={`Full Order Timeline - ${selectedOrder?.orderNumber ?? ""}`}
        description={`Complete audit history and notifications log for order ${selectedOrder?.orderNumber ?? ""}`}
      >
        <div className="max-h-96 overflow-y-auto pr-2 space-y-4 pt-3">
          {selectedOrder?.timeline.map((event, idx) => (
            <div key={idx} className="flex items-start gap-3 rounded-lg border border-ledger-100 p-3 dark:border-ledger-800">
              <span
                style={{ background: theme.colors.primaryPale, color: theme.colors.primary }}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold"
              >
                {idx + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-xs font-semibold text-ink-900 dark:text-white">{event.title}</p>
                  <span className="font-mono text-[10px] text-ledger-400">
                    {new Date(event.createdAt).toLocaleString("en-GH")}
                  </span>
                </div>
                <p className="text-[11px] text-ledger-500 dark:text-ledger-400">Actor: {event.actorName}</p>
                {event.notes && <p className="mt-1 text-[11px] text-ledger-600 dark:text-ledger-300">{event.notes}</p>}
              </div>
            </div>
          ))}
        </div>
      </Dialog>
    </div>
  );
}

function KpiCard({
  label,
  value,
  trend,
  icon: Icon,
  iconColor,
  customBg,
  customColor,
}: {
  label: string;
  value: string;
  trend: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor?: string;
  customBg?: string;
  customColor?: string;
}) {
  return (
    <div className="rounded-xl border border-ledger-200/80 bg-white p-3.5 shadow-sm dark:border-ledger-700/80 dark:bg-ink-900">
      <div className="flex items-center justify-between">
        <span
          style={customBg && customColor ? { background: customBg, color: customColor } : undefined}
          className={cn("flex h-8 w-8 items-center justify-center rounded-lg", iconColor)}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 text-[11px] font-medium text-ledger-500 dark:text-ledger-400 truncate">{label}</p>
      <p className="font-display text-lg font-bold tracking-tight text-ink-900 dark:text-white truncate">{value}</p>
      <p className="mt-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 truncate">{trend}</p>
    </div>
  );
}

function KanbanCard({
  title,
  count,
  value,
  borderColor,
}: {
  title: string;
  count: number;
  value: string;
  borderColor: string;
}) {
  return (
    <div className={cn("rounded-xl border bg-ledger-50/60 p-3 dark:bg-ink-850", borderColor)}>
      <p className="text-xs font-semibold text-ink-900 dark:text-white truncate">{title}</p>
      <p className="mt-1 text-[11px] text-ledger-500 dark:text-ledger-400">{count} Orders</p>
      <p className="font-mono text-xs font-bold text-ink-900 dark:text-white truncate">{value}</p>
    </div>
  );
}