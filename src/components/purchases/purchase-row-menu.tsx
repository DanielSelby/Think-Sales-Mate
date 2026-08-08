"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Eye, Printer, MoreVertical, Pencil, PackageCheck, Copy, Wallet, Loader2,
} from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDateTime } from "@/lib/sales/format";
import { formatPurchaseNumber } from "@/lib/purchases/format";
import {
  getPurchaseReceivableItems, receivePurchaseItems, duplicatePurchase, recordPurchasePayment,
  type ReceivableLine,
} from "@/app/(dashboard)/purchases/actions";
import type { PurchaseStatus } from "@/types/database";

export interface PurchaseRowMenuProps {
  purchaseId: string;
  purchaseNumber: number;
  status: PurchaseStatus;
  total: number;
  paidAmount: number;
  currency: string;
  supplierName: string;
  onNotice: (message: string, tone?: "success" | "error") => void;
}

type DialogKind = "receive" | "payment" | null;

export function PurchaseRowMenu({
  purchaseId, purchaseNumber, status, total, paidAmount, currency, supplierName, onNotice,
}: PurchaseRowMenuProps) {
  const router = useRouter();
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [dialog, setDialog] = React.useState<DialogKind>(null);
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const [lines, setLines] = React.useState<ReceivableLine[] | null>(null);
  const [receiveQty, setReceiveQty] = React.useState<Record<string, string>>({});
  const [loadingLines, setLoadingLines] = React.useState(false);

  const outstanding = Math.max(0, total - paidAmount);
  const [paymentAmount, setPaymentAmount] = React.useState(String(outstanding));
  const [note, setNote] = React.useState("");

  React.useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen]);

  function openReceive() {
    setMenuOpen(false);
    setError(null);
    setDialog("receive");
    setLoadingLines(true);
    getPurchaseReceivableItems(purchaseId)
      .then((fetched) => {
        setLines(fetched);
        const defaults: Record<string, string> = {};
        for (const l of fetched) defaults[l.purchaseItemId] = String(l.remaining);
        setReceiveQty(defaults);
      })
      .catch(() => setError("Couldn't load this purchase's line items."))
      .finally(() => setLoadingLines(false));
  }

  function openPayment() {
    setMenuOpen(false);
    setError(null);
    setPaymentAmount(String(outstanding));
    setNote("");
    setDialog("payment");
  }

  function submitReceive() {
    if (!lines) return;
    const toReceive = lines
      .map((l) => ({ purchaseItemId: l.purchaseItemId, productId: l.productId, quantity: Number(receiveQty[l.purchaseItemId] ?? 0) }))
      .filter((l) => l.quantity > 0);

    for (const l of lines) {
      const qty = Number(receiveQty[l.purchaseItemId] ?? 0);
      if (Number.isNaN(qty) || qty < 0 || qty > l.remaining) {
        setError(`Enter a valid quantity for ${l.productName} (max ${l.remaining}).`);
        return;
      }
    }
    if (toReceive.length === 0) {
      setError("Enter a quantity for at least one item.");
      return;
    }

    startTransition(async () => {
      const result = await receivePurchaseItems({ purchaseId, lines: toReceive, note });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setDialog(null);
      onNotice(`Items received for ${formatPurchaseNumber(purchaseNumber)}`);
      router.refresh();
    });
  }

  function submitPayment() {
    const amount = Number(paymentAmount);
    if (Number.isNaN(amount) || amount <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    if (amount > outstanding) {
      setError(`Can't exceed the outstanding balance of ${formatCurrency(outstanding, currency)}.`);
      return;
    }
    startTransition(async () => {
      const result = await recordPurchasePayment(purchaseId, amount, note);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setDialog(null);
      onNotice(`Payment recorded for ${formatPurchaseNumber(purchaseNumber)}`);
      router.refresh();
    });
  }

  function handleDuplicate() {
    setMenuOpen(false);
    startTransition(async () => {
      const result = await duplicatePurchase(purchaseId);
      if (!result.ok) {
        onNotice(result.error ?? "Couldn't duplicate this purchase.", "error");
        return;
      }
      onNotice(`Duplicated as ${result.purchaseNumber} (draft)`);
      router.refresh();
    });
  }

  function handlePrint() {
    setMenuOpen(false);
    printPurchase({ purchaseNumber, supplierName, total, currency });
  }

  const canReceive = status === "ordered" || status === "partially_received";

  return (
    <>
      <div className="flex items-center justify-end gap-1 text-ledger-400">
        <Link href={`/purchases/${purchaseId}`} className="rounded-md p-1.5 hover:bg-ledger-100 hover:text-ink-900 dark:hover:bg-white/[0.06] dark:hover:text-white" title="View">
          <Eye className="h-4 w-4" />
        </Link>
        <button onClick={handlePrint} className="rounded-md p-1.5 hover:bg-ledger-100 hover:text-ink-900 dark:hover:bg-white/[0.06] dark:hover:text-white" title="Print / Download PDF">
          <Printer className="h-4 w-4" />
        </button>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-md p-1.5 hover:bg-ledger-100 hover:text-ink-900 dark:hover:bg-white/[0.06] dark:hover:text-white"
            title="More"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-8 z-40 w-52 overflow-hidden rounded-md border border-ledger-100 bg-white py-1 shadow-card-hover dark:border-ledger-700 dark:bg-ink-900"
            >
              <Link
                href={`/purchases/${purchaseId}/edit`}
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-left text-sm text-ink-900 hover:bg-ledger-50 dark:text-white dark:hover:bg-white/[0.06]"
              >
                <Pencil className="h-4 w-4 text-ledger-400" /> Edit
              </Link>
              {canReceive && (
                <button
                  onClick={openReceive}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-900 hover:bg-ledger-50 dark:text-white dark:hover:bg-white/[0.06]"
                >
                  <PackageCheck className="h-4 w-4 text-ledger-400" /> Receive Items
                </button>
              )}
              {outstanding > 0 && (
                <button
                  onClick={openPayment}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-900 hover:bg-ledger-50 dark:text-white dark:hover:bg-white/[0.06]"
                >
                  <Wallet className="h-4 w-4 text-ledger-400" /> Record Payment
                </button>
              )}
              <button
                onClick={handleDuplicate}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-900 hover:bg-ledger-50 dark:text-white dark:hover:bg-white/[0.06]"
              >
                <Copy className="h-4 w-4 text-ledger-400" /> Duplicate
              </button>
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={dialog === "receive"}
        onClose={() => (isPending ? null : setDialog(null))}
        title={`Receive Items — ${formatPurchaseNumber(purchaseNumber)}`}
        description="Enter how many units of each line arrived. Stock updates immediately."
        className="max-w-lg"
      >
        <div className="space-y-4">
          {loadingLines && (
            <div className="flex items-center gap-2 py-3 text-sm text-ledger-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading line items...
            </div>
          )}
          {!loadingLines && lines && lines.length > 0 && (
            <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border border-ledger-100 p-2 dark:border-ledger-700">
              {lines.map((l) => (
                <div key={l.purchaseItemId} className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate text-ink-900 dark:text-white">{l.productName}</p>
                    <p className="text-xs text-ledger-400">
                      {l.alreadyReceived}/{l.quantityOrdered} received — {l.remaining} outstanding
                    </p>
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={l.remaining}
                    value={receiveQty[l.purchaseItemId] ?? "0"}
                    disabled={l.remaining === 0}
                    onChange={(e) => setReceiveQty((prev) => ({ ...prev, [l.purchaseItemId]: e.target.value }))}
                    className="h-9 w-20 shrink-0 rounded-md border border-ledger-200 bg-white px-2 text-right text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white disabled:opacity-40"
                  />
                </div>
              ))}
            </div>
          )}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Note (optional) — e.g. GRN reference"
            className="flex w-full rounded-md border border-ledger-200 bg-white px-3 py-2 text-sm placeholder:text-ledger-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40 dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
          />
          {error && <p className="text-sm text-alert">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="md" onClick={() => setDialog(null)} disabled={isPending}>Cancel</Button>
            <Button variant="primary" size="md" onClick={submitReceive} disabled={isPending || loadingLines}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />} Confirm
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={dialog === "payment"}
        onClose={() => (isPending ? null : setDialog(null))}
        title={`Record Payment — ${formatPurchaseNumber(purchaseNumber)}`}
        description={`Outstanding balance: ${formatCurrency(outstanding, currency)}`}
      >
        <div className="space-y-4">
          <input
            type="number"
            min={0}
            max={outstanding}
            step="0.01"
            value={paymentAmount}
            onChange={(e) => setPaymentAmount(e.target.value)}
            className="flex h-10 w-full rounded-md border border-ledger-200 bg-white px-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
          />
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Note (optional)"
            className="flex w-full rounded-md border border-ledger-200 bg-white px-3 py-2 text-sm placeholder:text-ledger-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40 dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
          />
          {error && <p className="text-sm text-alert">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="md" onClick={() => setDialog(null)} disabled={isPending}>Cancel</Button>
            <Button variant="primary" size="md" onClick={submitPayment} disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />} Record
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Print / Download PDF — opens a minimal print-ready document in a new tab
// and triggers the browser print dialog (which covers "Save as PDF" too).
// A branded template is a natural next step once you have one designed.
// ---------------------------------------------------------------------------
function printPurchase(info: { purchaseNumber: number; supplierName: string; total: number; currency: string }) {
  const win = window.open("", "_blank");
  if (!win) return;
  const { date } = formatDateTime(new Date().toISOString());
  win.document.write(`
    <html>
      <head>
        <title>${formatPurchaseNumber(info.purchaseNumber)}</title>
        <style>
          body { font-family: -apple-system, sans-serif; padding: 40px; color: #12161d; }
          h1 { font-size: 20px; margin-bottom: 4px; }
          p { color: #68655c; margin: 2px 0; }
          .total { margin-top: 24px; font-size: 18px; font-weight: 600; }
        </style>
      </head>
      <body>
        <h1>${formatPurchaseNumber(info.purchaseNumber)}</h1>
        <p>Supplier: ${info.supplierName}</p>
        <p>Printed: ${date}</p>
        <p class="total">Total: ${formatCurrency(info.total, info.currency)}</p>
      </body>
    </html>
  `);
  win.document.close();
  win.focus();
  win.print();
}