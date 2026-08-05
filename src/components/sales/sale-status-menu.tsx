"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, Undo2, XCircle, RotateCcw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { updateSaleStatus, getSaleReturnableItems, type ReturnableLine } from "@/app/(dashboard)/sales/actions";
import { formatCurrency } from "@/lib/sales/format";
import type { SaleStatus } from "@/types/database";

interface SaleStatusMenuProps {
  saleId: string;
  status: SaleStatus;
  total: number;
  currency: string;
}

const ACTIONS: { target: SaleStatus; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { target: "completed", label: "Restore to Completed", icon: RotateCcw },
  { target: "returned", label: "Mark as Returned", icon: Undo2 },
  { target: "cancelled", label: "Mark as Cancelled", icon: XCircle },
];

const DIALOG_COPY: Record<SaleStatus, { title: string; description: string }> = {
  completed: {
    title: "Restore to Completed",
    description: "This reverses any stock previously restocked by a return or cancellation and clears the refund.",
  },
  returned: {
    title: "Mark as Returned",
    description: "Choose how many units of each line are coming back. Stock is restocked automatically.",
  },
  cancelled: {
    title: "Mark as Cancelled",
    description: "This voids the sale and restocks everything not already returned.",
  },
};

export function SaleStatusMenu({ saleId, status, total, currency }: SaleStatusMenuProps) {
  const router = useRouter();
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [target, setTarget] = React.useState<SaleStatus | null>(null);
  const [lines, setLines] = React.useState<ReturnableLine[] | null>(null);
  const [returnQty, setReturnQty] = React.useState<Record<string, string>>({});
  const [refundInput, setRefundInput] = React.useState(String(total));
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loadingLines, setLoadingLines] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen]);

  function openDialogFor(nextStatus: SaleStatus) {
    setMenuOpen(false);
    setTarget(nextStatus);
    setRefundInput(String(total));
    setNote("");
    setError(null);
    setLines(null);
    setReturnQty({});

    if (nextStatus === "returned") {
      setLoadingLines(true);
      getSaleReturnableItems(saleId)
        .then((fetched) => {
          setLines(fetched);
          const defaults: Record<string, string> = {};
          let suggestedRefund = 0;
          for (const line of fetched) {
            defaults[line.saleItemId] = String(line.remaining);
            suggestedRefund += line.remaining * line.unitPrice;
          }
          setReturnQty(defaults);
          setRefundInput(String(Math.min(suggestedRefund, total)));
        })
        .catch(() => setError("Couldn't load this sale's line items."))
        .finally(() => setLoadingLines(false));
    }
  }

  function submit() {
    if (!target) return;

    let returnLines: { saleItemId: string; productId: string; quantity: number }[] | undefined;
    let refundedAmount = 0;

    if (target === "returned") {
      if (!lines) return;
      returnLines = lines
        .map((line) => ({
          saleItemId: line.saleItemId,
          productId: line.productId,
          quantity: Number(returnQty[line.saleItemId] ?? 0),
        }))
        .filter((l) => l.quantity > 0);

      for (const line of lines) {
        const qty = Number(returnQty[line.saleItemId] ?? 0);
        if (Number.isNaN(qty) || qty < 0) {
          setError(`Enter a valid quantity for ${line.productName}.`);
          return;
        }
        if (qty > line.remaining) {
          setError(`Can't return more than ${line.remaining} of ${line.productName}.`);
          return;
        }
      }
      if (returnLines.length === 0) {
        setError("Select at least one item to return.");
        return;
      }

      refundedAmount = Number(refundInput);
      if (Number.isNaN(refundedAmount) || refundedAmount < 0) {
        setError("Enter a valid refund amount.");
        return;
      }
      if (refundedAmount > total) {
        setError("Refund amount can't exceed the sale total.");
        return;
      }
    }

    startTransition(async () => {
      const result = await updateSaleStatus({ saleId, status: target, refundedAmount, note, returnLines });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong. Try again.");
        return;
      }
      setTarget(null);
      router.refresh();
    });
  }

  const availableActions = ACTIONS.filter((a) => a.target !== status);

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="rounded-md p-1.5 text-ledger-400 hover:bg-ledger-100 hover:text-ink-900 dark:hover:bg-white/[0.06] dark:hover:text-white"
          title="More"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <MoreVertical className="h-4 w-4" />
        </button>

        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-8 z-40 w-52 overflow-hidden rounded-md border border-ledger-100 bg-white py-1 shadow-card-hover dark:border-ledger-700 dark:bg-ink-900"
          >
            {availableActions.map((action) => (
              <button
                key={action.target}
                role="menuitem"
                onClick={() => openDialogFor(action.target)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-900 hover:bg-ledger-50 dark:text-white dark:hover:bg-white/[0.06]"
              >
                <action.icon className="h-4 w-4 text-ledger-400" />
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={target !== null}
        onClose={() => (isPending ? null : setTarget(null))}
        title={target ? DIALOG_COPY[target].title : ""}
        description={target ? DIALOG_COPY[target].description : undefined}
        className={target === "returned" ? "max-w-lg" : undefined}
      >
        <div className="space-y-4">
          {target === "returned" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-ledger-500">Items being returned</label>
              {loadingLines && (
                <div className="flex items-center gap-2 py-3 text-sm text-ledger-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading line items...
                </div>
              )}
              {!loadingLines && lines && lines.length === 0 && (
                <p className="py-2 text-sm text-ledger-400">This sale has no line items.</p>
              )}
              {!loadingLines && lines && lines.length > 0 && (
                <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-ledger-100 p-2 dark:border-ledger-700">
                  {lines.map((line) => (
                    <div key={line.saleItemId} className="flex items-center justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate text-ink-900 dark:text-white">{line.productName}</p>
                        <p className="text-xs text-ledger-400">
                          {line.remaining} of {line.quantitySold} available to return
                        </p>
                      </div>
                      <input
                        type="number"
                        min={0}
                        max={line.remaining}
                        value={returnQty[line.saleItemId] ?? "0"}
                        disabled={line.remaining === 0}
                        onChange={(e) => setReturnQty((prev) => ({ ...prev, [line.saleItemId]: e.target.value }))}
                        className="h-9 w-20 shrink-0 rounded-md border border-ledger-200 bg-white px-2 text-right text-sm text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40 focus-visible:border-signal disabled:opacity-40 dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {target === "returned" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-ledger-500">
                Refund amount ({formatCurrency(total, currency)} total)
              </label>
              <input
                type="number"
                min={0}
                max={total}
                step="0.01"
                value={refundInput}
                onChange={(e) => setRefundInput(e.target.value)}
                className="flex h-10 w-full rounded-md border border-ledger-200 bg-white px-3 text-sm text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40 focus-visible:border-signal dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-ledger-500">Note (optional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Reason for this change — visible in the audit log."
              className="flex w-full rounded-md border border-ledger-200 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ledger-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40 focus-visible:border-signal dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
            />
          </div>

          {error && <p className="text-sm text-alert">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="md" onClick={() => setTarget(null)} disabled={isPending}>
              Cancel
            </Button>
            <Button
              variant={target === "cancelled" ? "destructive" : "primary"}
              size="md"
              onClick={submit}
              disabled={isPending || loadingLines}
              className={cn(isPending && "pointer-events-none")}
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirm
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}