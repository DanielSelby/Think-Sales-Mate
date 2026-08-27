"use client";

import * as React from "react";
import Link from "next/link";
import { Search, Filter, Calendar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/sales/format";
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE } from "@/lib/customer-portal/format";
import type { CustomerOrderStatus } from "@/types/database";

export interface OrderRow {
  id: string;
  orderNumber: string;
  customerName: string;
  createdAt: string;
  total: number;
  status: CustomerOrderStatus;
}

interface OrdersListViewProps {
  orders: OrderRow[];
  currency: string;
}

const TABS: { key: "all" | CustomerOrderStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "processing", label: "Processing" },
  { key: "reviewed", label: "Reviewed" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];

export function OrdersListView({ orders, currency }: OrdersListViewProps) {
  const [tab, setTab] = React.useState<"all" | CustomerOrderStatus>("all");
  const [query, setQuery] = React.useState("");

  const counts = React.useMemo(() => {
    const c: Record<"all" | CustomerOrderStatus, number> = { all: orders.length, new: 0, processing: 0, reviewed: 0, completed: 0, cancelled: 0 };
    for (const o of orders) c[o.status] += 1;
    return c;
  }, [orders]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((o) => {
      if (tab !== "all" && o.status !== tab) return false;
      if (q && !o.orderNumber.toLowerCase().includes(q) && !o.customerName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [orders, tab, query]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-900 dark:text-white">Incoming Customer Orders</h1>
        <p className="mt-0.5 text-sm text-ledger-500 dark:text-ledger-400">Review and manage orders placed by customers.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
              tab === t.key ? "bg-ink-900 text-white dark:bg-white dark:text-ink-900" : "border border-ledger-200 text-ledger-600 hover:bg-ledger-50 dark:border-ledger-700 dark:text-ledger-300"
            )}
          >
            {t.label} {counts[t.key]}
          </button>
        ))}
      </div>

      <Card accent="neutral">
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ledger-400" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search orders..." className="pl-9" />
            </div>
            <Button variant="outline" size="md"><Calendar className="h-4 w-4" /> Date Range</Button>
            <Button variant="outline" size="md"><Filter className="h-4 w-4" /> Filters</Button>
          </div>
        </CardContent>
      </Card>

      <Card accent="neutral" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-ledger-100 text-ledger-400 dark:border-ledger-700">
                <th className="px-3 py-3 font-medium">Order ID</th>
                <th className="px-3 py-3 font-medium">Customer</th>
                <th className="px-3 py-3 font-medium">Date</th>
                <th className="px-3 py-3 text-right font-medium">Amount</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 pr-4 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ledger-100 dark:divide-ledger-700">
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-ledger-400">No orders yet.</td></tr>
              )}
              {filtered.map((o) => (
                <tr key={o.id} className="hover:bg-ledger-50/60 dark:hover:bg-white/[0.03]">
                  <td className="px-3 py-3 font-mono text-[13px] text-signal">{o.orderNumber}</td>
                  <td className="px-3 py-3 text-ink-900 dark:text-white">{o.customerName}</td>
                  <td className="px-3 py-3 text-ledger-600 dark:text-ledger-300">
                    {new Date(o.createdAt).toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" })}
                    <span className="block text-xs text-ledger-400">{new Date(o.createdAt).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" })}</span>
                  </td>
                  <td className="px-3 py-3 text-right font-mono font-medium text-ink-900 dark:text-white">{formatCurrency(o.total, currency)}</td>
                  <td className="px-3 py-3"><Badge tone={ORDER_STATUS_TONE[o.status]}>{ORDER_STATUS_LABEL[o.status]}</Badge></td>
                  <td className="px-3 py-3 pr-4 text-right">
                    <Link href={`/orders/${o.id}`} className="text-sm font-medium text-signal hover:underline">View</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}