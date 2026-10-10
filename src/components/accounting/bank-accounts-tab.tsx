"use client";

import Link from "next/link";
import { ArrowUpRight, Landmark, Wallet } from "lucide-react";
import { useAccountingStore } from "@/lib/accounting/accounting-store";
import { formatCurrencyAmount } from "@/lib/currency";
import type { BankAccountItem } from "@/types/accounting";

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  cash: "Cash account",
  checking: "Current account",
  savings: "Savings account",
  mobile_money: "Mobile money",
  card: "Card settlement account",
  other: "Other account",
};

export function BankAccountsTab({ initialBankAccounts }: { initialBankAccounts: BankAccountItem[] }) {
  const { currencyConfig } = useAccountingStore();

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">Bank Accounts</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Accounts and balances connected to this organization&apos;s Bank Accounts workspace.</p>
        </div>
        <Link href="/banking" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
          Manage Bank Accounts
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      {initialBankAccounts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center dark:border-slate-800 dark:bg-slate-900">
          <Landmark className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
          <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">No bank accounts yet</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Add a bank account or mobile money wallet to see it here.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {initialBankAccounts.map((account) => {
            const isMobileMoney = account.type === "mobile_money";
            const Icon = isMobileMoney ? Wallet : Landmark;
            return (
              <article key={account.id} className="min-w-0 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    {account.logoUrl ? (
                      <span
                        role="img"
                        aria-label={`${account.name} logo`}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white bg-contain bg-center bg-no-repeat dark:border-slate-700 dark:bg-slate-950"
                        style={{ backgroundImage: `url("${account.logoUrl}")` }}
                      />
                    ) : (
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                    )}
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-white">{account.name}</h3>
                      <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">{ACCOUNT_TYPE_LABELS[account.type] ?? account.type}</p>
                    </div>
                  </div>
                </div>
                <p className="mt-3 truncate font-mono text-[11px] text-slate-500 dark:text-slate-400" title={account.accountNumber || "No account number added"}>{account.accountNumber || "No account number added"}</p>
                <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">Current balance</p>
                <p className="mt-0.5 truncate font-display text-xl font-bold text-slate-900 dark:text-white">
                  {formatCurrencyAmount(account.bookBalance, currencyConfig)}
                </p>
                <Link href={`/banking/${account.id}`} className="mt-4 inline-flex min-h-9 items-center text-xs font-semibold text-blue-700 hover:underline dark:text-blue-300">
                  View transactions
                </Link>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
