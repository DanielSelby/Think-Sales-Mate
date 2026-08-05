"use client";

import { useState, useTransition } from "react";
import { markInvoicePaid, voidInvoice } from "@/app/(dashboard)/accounting/invoices/actions";

export interface InvoiceRow {
  id: string;
  invoiceNumber: number;
  customerName: string;
  amount: number;
  status: "draft" | "sent" | "paid" | "overdue" | "void";
  dueDate: string;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

const STATUS_STYLES: Record<InvoiceRow["status"], string> = {
  draft: "bg-ledger-100 text-ledger-600 dark:bg-white/10 dark:text-ledger-300",
  sent: "bg-amber-soft text-amber",
  paid: "bg-signal-soft text-signal",
  overdue: "bg-alert-soft text-alert",
  void: "bg-ledger-100 text-ledger-400 dark:bg-white/5 dark:text-ledger-500"
};

export function InvoicesTable({ invoices, canManage }: { invoices: InvoiceRow[]; canManage: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleMarkPaid(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await markInvoicePaid(id);
      if (result?.error) setError(result.error);
    });
  }

  function handleVoid(id: string) {
    if (!confirm("Void this invoice? It will no longer count as outstanding.")) return;
    setError(null);
    startTransition(async () => {
      const result = await voidInvoice(id);
      if (result?.error) setError(result.error);
    });
  }

  if (invoices.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-ledger-200 bg-white p-10 text-center dark:border-ledger-700 dark:bg-ink-900">
        <p className="text-sm text-ledger-500 dark:text-ledger-400">No invoices yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">{error}</p>}
      <div className="overflow-hidden rounded-card border border-ledger-100 bg-white shadow-card dark:border-ledger-700 dark:bg-ink-900">
        <table className="w-full text-sm">
          <thead className="border-b border-ledger-100 text-left text-xs font-medium uppercase tracking-wide text-ledger-400 dark:border-ledger-700">
            <tr>
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Due</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Amount</th>
              {canManage && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr key={invoice.id} className="border-b border-ledger-50 last:border-0 dark:border-ledger-700/50">
                <td className="px-4 py-3 font-medium text-ink-900 dark:text-white">
                  #{String(invoice.invoiceNumber).padStart(4, "0")}
                </td>
                <td className="px-4 py-3 text-ledger-600 dark:text-ledger-300">{invoice.customerName}</td>
                <td className="px-4 py-3 text-ledger-500 dark:text-ledger-400">
                  {new Date(invoice.dueDate).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLES[invoice.status]}`}>
                    {invoice.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right figure text-ink-900 dark:text-white">${formatMoney(invoice.amount)}</td>
                {canManage && (
                  <td className="px-4 py-3">
                    {(invoice.status === "sent" || invoice.status === "overdue") && (
                      <div className="flex justify-end gap-3">
                        <button
                          onClick={() => handleMarkPaid(invoice.id)}
                          disabled={isPending}
                          className="text-xs font-medium text-signal hover:underline disabled:opacity-40"
                        >
                          Mark paid
                        </button>
                        <button
                          onClick={() => handleVoid(invoice.id)}
                          disabled={isPending}
                          className="text-xs font-medium text-alert hover:underline disabled:opacity-40"
                        >
                          Void
                        </button>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}