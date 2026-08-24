"use client";

import { useState } from "react";
import { X, Printer, Download, CheckCircle2, Building2, User, Calendar, FileText, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StockMovement, formatLedgerMoney } from "@/lib/inventory/stock-ledger";

interface SourceDocumentModalProps {
  movement: StockMovement | null;
  productName: string;
  sku: string;
  currency?: string;
  onClose: () => void;
}

export function SourceDocumentModal({
  movement,
  productName,
  sku,
  currency = "GHS",
  onClose,
}: SourceDocumentModalProps) {
  if (!movement) return null;

  const handlePrint = () => {
    window.print();
  };

  const isSale = movement.type === "Sale";
  const isPurchase = movement.type === "Purchase";
  const isTransfer = movement.type === "Stock Transfer" || movement.type.startsWith("Stock Transfer");
  const isAdjustment = movement.type === "Stock Adjustment";
  const isReturn = movement.type === "Return" || movement.type === "Sales Return" || movement.type === "Purchase Return";

  const quantity = movement.inQty ?? movement.outQty ?? 1;
  const lineTotal = movement.totalValue || quantity * movement.unitCost;
  const taxAmount = isSale ? lineTotal * 0.15 : 0;
  const grandTotal = lineTotal + taxAmount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-ledger-100 bg-white p-6 shadow-2xl dark:border-ledger-700 dark:bg-ink-900">
        {/* Header Actions */}
        <div className="flex items-center justify-between border-b border-ledger-100 pb-4 dark:border-ledger-700">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-ink-900 dark:text-white">
                {movement.referenceType} Details
              </h2>
              <p className="font-mono text-xs text-ledger-400">{movement.referenceNo}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="h-8 gap-1.5 rounded-lg border-ledger-200 text-xs font-medium dark:border-ledger-700"
            >
              <Printer className="h-3.5 w-3.5" />
              Print
            </Button>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-ledger-400 hover:bg-ledger-50 hover:text-ink-900 dark:hover:bg-white/[0.06] dark:hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Printable ERP Document Container */}
        <div className="mt-5 space-y-6 text-sm">
          {/* Company & Document Status Banner */}
          <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl bg-ledger-50 p-4 dark:bg-white/[0.03]">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-600 text-xs font-bold text-white">
                  T
                </span>
                <span className="font-bold tracking-tight text-ink-900 dark:text-white">ThinkSales Pro</span>
              </div>
              <p className="mt-1 text-xs text-ledger-500">Enterprise Resource Planning</p>
              <p className="text-xs text-ledger-400">Location: {movement.branchName}</p>
            </div>

            <div className="text-right">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
                <CheckCircle2 className="h-3 w-3" />
                Completed
              </span>
              <p className="mt-1 text-xs text-ledger-400">Date: {movement.dateFormatted} {movement.timeFormatted}</p>
              <p className="text-xs text-ledger-400">Operator: <span className="font-medium text-ink-900 dark:text-white">{movement.userName}</span></p>
            </div>
          </div>

          {/* Party Details (Customer/Supplier/Branches) */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-ledger-100 p-3.5 dark:border-ledger-700">
              <p className="text-xs font-semibold uppercase tracking-wider text-ledger-400">
                {isSale ? "Customer Information" : isPurchase ? "Supplier Information" : isTransfer ? "Origin Location" : "Branch / Location"}
              </p>
              <p className="mt-1.5 font-semibold text-ink-900 dark:text-white">
                {isSale
                  ? "Direct Customer / POS Account"
                  : isPurchase
                  ? "Samsung Electronics Direct Ltd"
                  : isTransfer
                  ? "Central Distribution Hub"
                  : movement.branchName}
              </p>
              <p className="text-xs text-ledger-500">
                {movement.branchName} · Accra, Ghana
              </p>
            </div>

            <div className="rounded-xl border border-ledger-100 p-3.5 dark:border-ledger-700">
              <p className="text-xs font-semibold uppercase tracking-wider text-ledger-400">
                {isTransfer ? "Destination Location" : "Transaction Attributes"}
              </p>
              <p className="mt-1.5 font-semibold text-ink-900 dark:text-white">
                {isTransfer ? movement.branchName : `Payment Method: Cash / Instant`}
              </p>
              <p className="text-xs text-ledger-500">
                Audit Ref: #{movement.id.slice(0, 8)} · Status: Settled
              </p>
            </div>
          </div>

          {/* Items Table */}
          <div className="overflow-hidden rounded-xl border border-ledger-100 dark:border-ledger-700">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-ledger-100 bg-ledger-50 font-semibold uppercase tracking-wider text-ledger-500 dark:border-ledger-700 dark:bg-white/[0.03]">
                <tr>
                  <th className="px-4 py-2.5">Item Description</th>
                  <th className="px-3 py-2.5 text-center">SKU</th>
                  <th className="px-3 py-2.5 text-right">Quantity</th>
                  <th className="px-3 py-2.5 text-right">Unit Rate ({currency})</th>
                  <th className="px-4 py-2.5 text-right">Total Amount ({currency})</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ledger-100 dark:divide-ledger-700">
                <tr className="bg-white dark:bg-ink-900">
                  <td className="px-4 py-3 font-medium text-ink-900 dark:text-white">
                    {productName}
                    {movement.subTypeNote && (
                      <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">
                        {movement.subTypeNote}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center font-mono text-ledger-500">
                    {sku}
                  </td>
                  <td className="px-3 py-3 text-right font-semibold text-ink-900 dark:text-white">
                    {quantity}
                  </td>
                  <td className="px-3 py-3 text-right text-ledger-600 dark:text-ledger-300">
                    {formatLedgerMoney(movement.unitCost, currency)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-ink-900 dark:text-white">
                    {formatLedgerMoney(lineTotal, currency)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Totals Breakdown */}
          <div className="flex justify-end">
            <div className="w-full max-w-xs space-y-2 rounded-xl bg-ledger-50 p-4 text-xs dark:bg-white/[0.03]">
              <div className="flex justify-between text-ledger-500">
                <span>Subtotal</span>
                <span className="font-medium text-ink-900 dark:text-white">
                  {currency} {formatLedgerMoney(lineTotal, currency)}
                </span>
              </div>
              {taxAmount > 0 && (
                <div className="flex justify-between text-ledger-500">
                  <span>VAT / Tax (15%)</span>
                  <span className="font-medium text-ink-900 dark:text-white">
                    {currency} {formatLedgerMoney(taxAmount, currency)}
                  </span>
                </div>
              )}
              <div className="flex justify-between border-t border-ledger-200 pt-2 font-bold text-sm text-ink-900 dark:border-ledger-700 dark:text-white">
                <span>Total Value</span>
                <span className="text-blue-600 dark:text-blue-400">
                  {currency} {formatLedgerMoney(grandTotal, currency)}
                </span>
              </div>
            </div>
          </div>

          {/* Movement Notes & Audit Confirmation */}
          {movement.notes && (
            <div className="rounded-xl border border-dashed border-ledger-200 p-3 text-xs text-ledger-600 dark:border-ledger-700 dark:text-ledger-400">
              <span className="font-semibold text-ink-900 dark:text-white">Movement Note: </span>
              {movement.notes}
            </div>
          )}

          {/* Footer note */}
          <div className="flex items-center justify-between border-t border-ledger-100 pt-4 text-[11px] text-ledger-400 dark:border-ledger-700">
            <span>Verified electronic document generated by ThinkSales Pro</span>
            <span>Ref: {movement.referenceNo}</span>
          </div>
        </div>

        {/* Close Button Bottom */}
        <div className="mt-6 flex justify-end">
          <Button
            variant="outline"
            onClick={onClose}
            className="rounded-xl border-ledger-200 dark:border-ledger-700"
          >
            Close Viewer
          </Button>
        </div>
      </div>
    </div>
  );
}
