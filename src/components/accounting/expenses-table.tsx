"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteExpense } from "@/app/(dashboard)/accounting/expenses/actions";

export interface ExpenseRow {
  id: string;
  category: string;
  vendor: string | null;
  description: string | null;
  amount: number;
  expenseDate: string;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export function ExpensesTable({ expenses, canManage }: { expenses: ExpenseRow[]; canManage: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete(id: string, category: string) {
    if (!confirm(`Remove this "${category}" expense? This can't be undone.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteExpense(id);
      if (result?.error) setError(result.error);
    });
  }

  if (expenses.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-ledger-200 bg-white p-10 text-center dark:border-ledger-700 dark:bg-ink-900">
        <p className="text-sm text-ledger-500 dark:text-ledger-400">No expenses recorded yet.</p>
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
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Vendor</th>
              <th className="px-4 py-3 text-right">Amount</th>
              {canManage && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {expenses.map((expense) => (
              <tr key={expense.id} className="border-b border-ledger-50 last:border-0 dark:border-ledger-700/50">
                <td className="px-4 py-3 text-ledger-500 dark:text-ledger-400">
                  {new Date(expense.expenseDate).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-ink-900 dark:text-white">{expense.category}</td>
                <td className="px-4 py-3 text-ledger-500 dark:text-ledger-400">{expense.vendor ?? "—"}</td>
                <td className="px-4 py-3 text-right figure text-alert">${formatMoney(expense.amount)}</td>
                {canManage && (
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(expense.id, expense.category)}
                      disabled={isPending}
                      className="text-ledger-400 hover:text-alert disabled:opacity-40"
                      aria-label="Remove expense"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
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