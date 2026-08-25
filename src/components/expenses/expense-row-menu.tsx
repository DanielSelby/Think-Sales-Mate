"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, Pencil, Printer, MoreVertical, CheckCircle2, XCircle, Wallet, Trash2, Loader2 } from "lucide-react";
import { approveExpense, rejectExpense, markExpensePaid, deleteExpense } from "@/app/(dashboard)/expenses/actions";
import { formatExpenseNumber } from "@/lib/expenses/format";
import { formatCurrency } from "@/lib/sales/format";
import type { ExpenseStatus, ExpensePaymentStatus } from "@/types/database";

interface ExpenseRowMenuProps {
  expenseId: string;
  expenseNumber: number;
  status: ExpenseStatus;
  paymentStatus: ExpensePaymentStatus;
  onNotice: (message: string, tone?: "success" | "error") => void;
  /** Used to build the standalone print document — without these, Print
   *  falls back to printing the whole page instead of just this expense. */
  category?: string;
  vendor?: string | null;
  date?: string;
  amount?: number;
  currency?: string;
}

export function ExpenseRowMenu({
  expenseId, expenseNumber, status, paymentStatus, onNotice, category, vendor, date, amount, currency,
}: ExpenseRowMenuProps) {
  const router = useRouter();
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen]);

  function run(action: () => Promise<{ ok: boolean; error?: string }>, successMessage: string) {
    setMenuOpen(false);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) return onNotice(result.error ?? "Something went wrong.", "error");
      onNotice(successMessage);
      router.refresh();
    });
  }

  function handlePrint() {
    setMenuOpen(false);
    printExpense({
      expenseNumber,
      category: category ?? "—",
      vendor: vendor ?? null,
      date: date ?? new Date().toISOString(),
      amount: amount ?? 0,
      currency: currency ?? "USD",
    });
  }

  return (
    <div className="flex items-center justify-end gap-1 text-ledger-400">
      <Link href={`/expenses/${expenseId}`} className="rounded-md p-1.5 hover:bg-ledger-100 hover:text-ink-900 dark:hover:bg-white/[0.06] dark:hover:text-white" title="View">
        <Eye className="h-4 w-4" />
      </Link>
      <Link href={`/expenses/${expenseId}/edit`} className="rounded-md p-1.5 hover:bg-ledger-100 hover:text-ink-900 dark:hover:bg-white/[0.06] dark:hover:text-white" title="Edit">
        <Pencil className="h-4 w-4" />
      </Link>
      <button onClick={handlePrint} className="rounded-md p-1.5 hover:bg-ledger-100 hover:text-ink-900 dark:hover:bg-white/[0.06] dark:hover:text-white" title="Print">
        <Printer className="h-4 w-4" />
      </button>

      <div className="relative" ref={menuRef}>
        <button onClick={() => setMenuOpen((v) => !v)} className="rounded-md p-1.5 hover:bg-ledger-100 hover:text-ink-900 dark:hover:bg-white/[0.06] dark:hover:text-white" title="More">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
        </button>
        {menuOpen && (
          <div role="menu" className="absolute right-0 top-8 z-40 w-48 overflow-hidden rounded-md border border-ledger-100 bg-white py-1 shadow-card-hover dark:border-ledger-700 dark:bg-ink-900">
            {status === "pending_approval" && (
              <>
                <button onClick={() => run(() => approveExpense(expenseId), `${formatExpenseNumber(expenseNumber)} approved`)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-900 hover:bg-ledger-50 dark:text-white dark:hover:bg-white/[0.06]">
                  <CheckCircle2 className="h-4 w-4 text-signal" /> Approve
                </button>
                <button onClick={() => run(() => rejectExpense(expenseId), `${formatExpenseNumber(expenseNumber)} rejected`)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-alert hover:bg-alert-soft">
                  <XCircle className="h-4 w-4" /> Reject
                </button>
              </>
            )}
            {status === "approved" && paymentStatus === "unpaid" && (
              <button onClick={() => run(() => markExpensePaid(expenseId), `${formatExpenseNumber(expenseNumber)} marked paid`)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-900 hover:bg-ledger-50 dark:text-white dark:hover:bg-white/[0.06]">
                <Wallet className="h-4 w-4 text-ledger-400" /> Mark as Paid
              </button>
            )}
            <button onClick={() => run(() => deleteExpense(expenseId), `${formatExpenseNumber(expenseNumber)} deleted`)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-alert hover:bg-alert-soft">
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Print — opens a minimal print-ready document for just this expense in a
// new tab and triggers the browser print dialog, instead of printing
// whatever happens to be the current page.
// ---------------------------------------------------------------------------
function printExpense(info: { expenseNumber: number; category: string; vendor: string | null; date: string; amount: number; currency: string }) {
  const win = window.open("", "_blank");
  if (!win) return;
  const printedAt = new Date().toLocaleString();
  const expenseDate = new Date(info.date).toLocaleDateString();
  win.document.write(`
    <html>
      <head>
        <title>${formatExpenseNumber(info.expenseNumber)}</title>
        <style>
          body { font-family: -apple-system, sans-serif; padding: 40px; color: #12161d; }
          h1 { font-size: 20px; margin-bottom: 4px; }
          p { color: #68655c; margin: 2px 0; }
          .total { margin-top: 24px; font-size: 18px; font-weight: 600; }
        </style>
      </head>
      <body>
        <h1>${formatExpenseNumber(info.expenseNumber)}</h1>
        <p>Category: ${info.category}</p>
        ${info.vendor ? `<p>Vendor: ${info.vendor}</p>` : ""}
        <p>Date: ${expenseDate}</p>
        <p>Printed: ${printedAt}</p>
        <p class="total">Amount: ${formatCurrency(info.amount, info.currency)}</p>
      </body>
    </html>
  `);
  win.document.close();
  win.focus();
  win.print();
}