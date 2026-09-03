"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { deleteAccount } from "@/app/(dashboard)/banking/actions";
import { formatCurrency } from "@/lib/sales/format";

export interface AccountRow {
  id: string;
  name: string;
  accountType: string;
  currentBalance: number;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

const TYPE_LABELS: Record<string, string> = {
  cash: "Cash",
  checking: "Checking",
  savings: "Savings",
  mobile_money: "Mobile money",
  other: "Other"
};

export function AccountsTable({ accounts, canManage, currency }: { accounts: AccountRow[]; canManage: boolean; currency: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete(id: string, name: string) {
    if (!confirm(`Remove "${name}"? This can't be undone — its transaction history goes with it.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteAccount(id);
      if (result?.error) setError(result.error);
    });
  }

  if (accounts.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-ledger-200 bg-white p-10 text-center dark:border-ledger-700 dark:bg-ink-900">
        <p className="text-sm text-ledger-500 dark:text-ledger-400">No accounts yet — add your first one.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">{error}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((account) => (
          <div
            key={account.id}
            className="rounded-card border border-ledger-100 bg-white p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-card-hover dark:border-ledger-700 dark:bg-ink-900"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ledger-400">
                  {TYPE_LABELS[account.accountType] ?? account.accountType}
                </p>
                <Link href={`/banking/${account.id}`} className="font-display text-lg font-semibold text-ink-900 hover:underline dark:text-white">
                  {account.name}
                </Link>
              </div>
              {canManage && (
                <button
                  onClick={() => handleDelete(account.id, account.name)}
                  disabled={isPending}
                  className="text-ledger-400 hover:text-alert disabled:opacity-40"
                  aria-label={`Remove ${account.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <p className="figure mt-3 text-2xl font-semibold text-ink-900 dark:text-white">
              {formatCurrency(account.currentBalance, currency)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}