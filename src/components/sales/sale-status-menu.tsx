"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, Undo2, XCircle, RotateCcw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  updateSaleStatus,
  getSaleReturnableItems,
  getSaleRefundOptions,
  type ReturnableLine,
  type SaleRefundAccountOption,
} from "@/app/(dashboard)/sales/actions";
import { formatCurrency } from "@/lib/sales/format";
import type { SaleStatus } from "@/types/database";
import { TransactionFeedback } from "@/components/transactions/transaction-feedback";

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
    description: "Choose the returned items, refund amount and refund method. Cash refunds are recorded against your open register.",
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
  const [refundAccounts, setRefundAccounts] = React.useState<SaleRefundAccountOption[]>([]);
  const [maxRefundable, setMaxRefundable] = React.useState(0);
  const [returnQty, setReturnQty] = React.useState<Record<string, string>>({});
  const [refundInput, setRefundInput] = React.useState("0");
  const [refundPaymentMethod, setRefundPaymentMethod] = React.useState("");
  const [refundAccountId, setRefundAccountId] = React.useState("");
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<{ kind: "warning"; message: string } | null>(null);
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
    setRefundInput("0");
    setRefundPaymentMethod("");
    setRefundAccountId("");
    setNote("");
    setError(null);
    setNotice(null);
    setLines(null);
    setRefundAccounts([]);
    setMaxRefundable(0);
    setReturnQty({});

    if (nextStatus === "returned") {
      setLoadingLines(true);
      Promise.all([getSaleReturnableItems(saleId), getSaleRefundOptions(saleId)])
        .then(([fetched, refundOptions]) => {
          setLines(fetched);
          setRefundAccounts(refundOptions.accounts);
          setMaxRefundable(refundOptions.maxRefundable);
          const defaults: Record<string, string> = {};
          let suggestedRefund = 0;
          for (const line of fetched) {
            defaults[line.saleItemId] = String(line.remaining);
            suggestedRefund += line.remaining * line.unitPrice;
          }
          setReturnQty(defaults);
          setRefundInput(String(Math.min(suggestedRefund, refundOptions.maxRefundable)));
        })
        .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Couldn't load this sale's return details."))
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
      if (refundedAmount > maxRefundable) {
        setError(`Refund amount can't exceed the unrefunded amount paid (${formatCurrency(maxRefundable, currency)}).`);
        return;
      }
      if (refundedAmount > 0 && !refundPaymentMethod) {
        setError("Select how the refund is being paid.");
        return;
      }
      if (refundedAmount > 0 && refundPaymentMethod !== "Cash" && !refundAccountId) {
        setError("Select the account used to pay this refund.");
        return;
      }
    }

    startTransition(async () => {
      const result = await updateSaleStatus({
        saleId,
        status: target,
        refundedAmount,
        refundPaymentMethod: refundPaymentMethod || null,
        refundAccountId: refundAccountId || null,
        note,
        returnLines,
      });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong. Try again.");
        return;
      }
      setTarget(null);
      if (result.error) setNotice({ kind: "warning", message: result.error });
      router.refresh();
    });
  }

  const availableActions = ACTIONS.filter((a) => a.target !== status);
  const compatibleRefundAccounts = refundPaymentMethod === "Mobile Money"
    ? refundAccounts.filter((account) => account.accountType === "mobile_money")
    : refundPaymentMethod === "Card"
      ? refundAccounts.filter((account) => ["card", "checking", "savings", "other"].includes(account.accountType))
      : refundPaymentMethod === "Bank Transfer" || refundPaymentMethod === "Cheque"
        ? refundAccounts.filter((account) => ["card", "checking", "savings", "other"].includes(account.accountType))
        : refundPaymentMethod === "Other"
          ? refundAccounts
          : [];

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="rounded-md p-1.5 text-ledger-500 hover:bg-ledger-100 dark:text-ledger-300 dark:hover:bg-white/[0.08]"
          title="More"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <MoreVertical className="h-4 w-4" strokeWidth={2.25} />
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
      {notice && <TransactionFeedback kind={notice.kind} message={notice.message} onClose={() => setNotice(null)} />}

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
            <div className="space-y-3">
              <label className="block text-xs font-medium text-ledger-500">
                Refund amount (up to {formatCurrency(maxRefundable, currency)} collected and not previously refunded)
                <input
                  type="number"
                  min={0}
                  max={maxRefundable}
                  step="0.01"
                  value={refundInput}
                  disabled={maxRefundable <= 0}
                  onChange={(e) => setRefundInput(e.target.value)}
                  className="mt-1 flex h-10 w-full rounded-md border border-ledger-200 bg-white px-3 text-sm text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40 focus-visible:border-signal dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                />
              </label>
              {maxRefundable <= 0 ? (
                <p className="rounded-md border border-ledger-100 bg-ledger-50 px-3 py-2 text-xs text-ledger-600 dark:border-ledger-700 dark:bg-ink-800 dark:text-ledger-300">
                  No payment remains available to refund. You can return the items without selecting a payment method.
                </p>
              ) : Number(refundInput) > 0 ? (
                <>
                  <label className="block text-xs font-medium text-ledger-500">
                    Refund paid by <span className="text-alert">*</span>
                    <select
                      value={refundPaymentMethod}
                      onChange={(e) => {
                        setRefundPaymentMethod(e.target.value);
                        setRefundAccountId("");
                      }}
                      required
                      className="mt-1 h-10 w-full rounded-md border border-ledger-200 bg-white px-3 text-sm text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40 focus-visible:border-signal dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                    >
                      <option value="">Select refund method</option>
                      <option value="Cash">Cash</option>
                      <option value="Card">Card</option>
                      <option value="Mobile Money">Mobile Money</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="Cheque">Cheque</option>
                      <option value="Other">Other</option>
                    </select>
                  </label>
                  {refundPaymentMethod && refundPaymentMethod !== "Cash" && (
                    <label className="block text-xs font-medium text-ledger-500">
                      Refund account <span className="text-alert">*</span>
                      <select
                        value={refundAccountId}
                        onChange={(e) => setRefundAccountId(e.target.value)}
                        required
                        className="mt-1 h-10 w-full rounded-md border border-ledger-200 bg-white px-3 text-sm text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40 focus-visible:border-signal dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                      >
                        <option value="">Select account</option>
                        {compatibleRefundAccounts.map((account) => (
                          <option key={account.id} value={account.id}>{account.name}</option>
                        ))}
                      </select>
                      {compatibleRefundAccounts.length === 0 && (
                        <span className="mt-1 block font-normal text-alert">No compatible account is configured for this refund method.</span>
                      )}
                    </label>
                  )}
                </>
              ) : null}
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