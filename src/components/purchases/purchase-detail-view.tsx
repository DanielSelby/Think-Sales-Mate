"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDateTime, PAYMENT_STATUS_LABEL, type PaymentStatus } from "@/lib/sales/format";
import { PURCHASE_STATUS_LABEL, PURCHASE_STATUS_TONE, formatPurchaseNumber } from "@/lib/purchases/format";
import { PurchaseRowMenu } from "@/components/purchases/purchase-row-menu";
import type { PurchaseStatus } from "@/types/database";

export interface PurchaseDetailItem {
  id: string;
  productId: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  quantity: number;
  quantityReceived: number;
  unit: string;
  unitPrice: number;
  discountPercent: number;
  taxPercent: number;
  lineTotal: number;
}

export interface PurchaseDetailSupplier {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  paymentTerms: string | null;
  currency: string;
}

export interface PurchaseDetail {
  id: string;
  purchaseNumber: number;
  purchaseDate: string;
  expectedDeliveryDate: string | null;
  reference: string | null;
  shippingMethod: string | null;
  deliveryAddress: string | null;
  deliveryNotes: string | null;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  shippingCost: number;
  total: number;
  paidAmount: number;
  paymentStatus: PaymentStatus;
  paymentMethod: string | null;
  paymentAccount: string | null;
  payFromAccount: string | null;
  purchaseNote: string | null;
  internalNote: string | null;
  status: PurchaseStatus;
  receivedAt: string | null;
  createdAt: string;
  createdByName: string;
  supplier: PurchaseDetailSupplier | null;
  locationName: string;
  projectName: string | null;
  items: PurchaseDetailItem[];
}

export function PurchaseDetailView({ purchase, currency }: { purchase: PurchaseDetail; currency: string }) {
  const { date: createdDate } = formatDateTime(purchase.createdAt);
  const outstanding = Math.max(0, purchase.total - purchase.paidAmount);

  const [notice, setNotice] = React.useState<{ message: string; tone: "success" | "error" } | null>(null);
  function showNotice(message: string, tone: "success" | "error" = "success") {
    setNotice({ message, tone });
    setTimeout(() => setNotice(null), 4000);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/purchases"
            className="mb-1 inline-flex items-center gap-1 text-sm text-ledger-500 hover:text-ink-900 dark:text-ledger-400 dark:hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Purchases
          </Link>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-semibold text-ink-900 dark:text-white">
              {formatPurchaseNumber(purchase.purchaseNumber)}
            </h1>
            <Badge tone={PURCHASE_STATUS_TONE[purchase.status]}>{PURCHASE_STATUS_LABEL[purchase.status]}</Badge>
          </div>
          <p className="mt-0.5 text-sm text-ledger-500 dark:text-ledger-400">
            {purchase.supplier?.name ?? "Unknown supplier"} · Created {createdDate}
          </p>
        </div>
        <PurchaseRowMenu
          purchaseId={purchase.id}
          purchaseNumber={purchase.purchaseNumber}
          status={purchase.status}
          total={purchase.total}
          paidAmount={purchase.paidAmount}
          currency={currency}
          supplierName={purchase.supplier?.name ?? "Unknown supplier"}
          onNotice={showNotice}
        />
      </div>

      {notice && (
        <div
          className={cn(
            "flex items-center justify-between gap-2 rounded-md border px-4 py-2.5 text-sm",
            notice.tone === "success"
              ? "border-signal/30 bg-signal-soft text-ink-900 dark:bg-signal/10 dark:text-white"
              : "border-alert/30 bg-alert-soft text-alert"
          )}
        >
          {notice.message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card accent="neutral" className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">
              Purchase Details
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-x-5 gap-y-3 pt-0 text-sm sm:grid-cols-2">
            <DetailRow label="Purchase Date" value={purchase.purchaseDate} />
            <DetailRow label="Expected Delivery" value={purchase.expectedDeliveryDate ?? "—"} />
            <DetailRow label="Reference" value={purchase.reference ?? "—"} />
            <DetailRow label="Location" value={purchase.locationName} />
            <DetailRow label="Shipping Method" value={purchase.shippingMethod ?? "—"} />
            <DetailRow label="Project" value={purchase.projectName ?? "—"} />
            <DetailRow label="Delivery Address" value={purchase.deliveryAddress ?? "—"} />
            <DetailRow label="Delivery Notes" value={purchase.deliveryNotes ?? "—"} />
          </CardContent>
        </Card>

        <Card accent="neutral">
          <CardHeader className="pb-2">
            <CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">
              Supplier
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0 text-sm">
            {purchase.supplier ? (
              <>
                <p className="font-medium text-ink-900 dark:text-white">{purchase.supplier.name}</p>
                <DetailRow label="Contact" value={purchase.supplier.contactPerson ?? "—"} />
                <DetailRow label="Phone" value={purchase.supplier.phone ?? "—"} />
                <DetailRow label="Email" value={purchase.supplier.email ?? "—"} />
                <DetailRow label="Payment Terms" value={purchase.supplier.paymentTerms ?? "—"} />
              </>
            ) : (
              <p className="text-ledger-400">Supplier not found.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card accent="neutral" className="overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">
            Items
          </CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-ledger-100 text-xs font-semibold text-ledger-400 dark:border-ledger-700">
                <th className="px-4 py-2">Product</th>
                <th className="px-3 py-2">SKU</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Received</th>
                <th className="px-3 py-2 text-right">Unit Price</th>
                <th className="px-3 py-2 text-right">Disc. (%)</th>
                <th className="px-3 py-2 text-right">Tax (%)</th>
                <th className="px-3 py-2 pr-4 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ledger-100 dark:divide-ledger-700">
              {purchase.items.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-ledger-400">No items on this purchase.</td>
                </tr>
              )}
              {purchase.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-2.5 text-ink-900 dark:text-white">{item.name}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-ledger-500">{item.sku ?? "—"}</td>
                  <td className="px-3 py-2.5 text-right text-ledger-600 dark:text-ledger-300">{item.quantity} {item.unit}</td>
                  <td className="px-3 py-2.5 text-right text-ledger-600 dark:text-ledger-300">{item.quantityReceived}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-ledger-600 dark:text-ledger-300">{formatCurrency(item.unitPrice, currency)}</td>
                  <td className="px-3 py-2.5 text-right text-ledger-600 dark:text-ledger-300">{item.discountPercent}%</td>
                  <td className="px-3 py-2.5 text-right text-ledger-600 dark:text-ledger-300">{item.taxPercent}%</td>
                  <td className="px-3 py-2.5 pr-4 text-right font-mono font-medium text-ink-900 dark:text-white">{formatCurrency(item.lineTotal, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card accent="signal">
          <CardHeader className="pb-2">
            <CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">
              Totals
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0 text-sm">
            <TotalsRow label="Subtotal" value={formatCurrency(purchase.subtotal, currency)} />
            <TotalsRow label="Discount" value={`- ${formatCurrency(purchase.discountAmount, currency)}`} />
            <TotalsRow label="Tax" value={formatCurrency(purchase.taxAmount, currency)} />
            <TotalsRow label="Shipping" value={formatCurrency(purchase.shippingCost, currency)} />
            <div className="flex items-center justify-between border-t border-ledger-100 pt-2 dark:border-ledger-700">
              <span className="font-medium text-ink-900 dark:text-white">Total</span>
              <span className="font-display text-lg font-semibold text-signal">{formatCurrency(purchase.total, currency)}</span>
            </div>
            <TotalsRow label="Paid" value={formatCurrency(purchase.paidAmount, currency)} />
            <TotalsRow label="Outstanding" value={formatCurrency(outstanding, currency)} emphasis={outstanding > 0} />
          </CardContent>
        </Card>

        <Card accent="neutral">
          <CardHeader className="pb-2">
            <CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">
              Payment Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0 text-sm">
            <DetailRow label="Method" value={purchase.paymentMethod ?? "—"} />
            <DetailRow label="Account" value={purchase.paymentAccount ?? "—"} />
            <DetailRow label="Pay From" value={purchase.payFromAccount ?? "—"} />
            <DetailRow label="Status" value={PAYMENT_STATUS_LABEL[purchase.paymentStatus]} />
          </CardContent>
        </Card>

        <Card accent="neutral">
          <CardHeader className="pb-2">
            <CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">
              Notes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0 text-sm">
            <div>
              <p className="text-xs font-medium text-ledger-400">Purchase Note</p>
              <p className="text-ledger-600 dark:text-ledger-300">{purchase.purchaseNote ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-ledger-400">Internal Note (team only)</p>
              <p className="text-ledger-600 dark:text-ledger-300">{purchase.internalNote ?? "—"}</p>
            </div>
            <DetailRow label="Created By" value={purchase.createdByName} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-ledger-400">{label}</p>
      <p className="text-ink-900 dark:text-white">{value}</p>
    </div>
  );
}

function TotalsRow({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ledger-500">{label}</span>
      <span className={emphasis ? "font-mono font-semibold text-alert" : "font-mono text-ink-900 dark:text-white"}>{value}</span>
    </div>
  );
}