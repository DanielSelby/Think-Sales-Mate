"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, ArrowUpRight, FileText, Landmark, Plus, Settings2, Wallet, X } from "lucide-react";
import { transferBankFunds } from "@/app/(dashboard)/banking/actions";
import { Button } from "@/components/ui/button";
import type { AccountRow } from "@/components/banking/accounts-table";
import { formatCurrency } from "@/lib/sales/format";

export interface BankingTransactionRow {
  id: string;
  type: string;
  amount: number;
  formattedAmount: string;
  description: string | null;
  transactionDate: string;
  accountName: string;
}

export interface BankingTransactionFilters {
  accountId: string;
  type: string;
  from: string;
  to: string;
  description: string;
}

export function BankingOverview({
  accounts,
  transactions,
  currency,
  canAddAccount,
  canTransfer,
  totalBalance,
  today,
  transactionPage,
  transactionPages,
  transactionFilters,
  initialTransferOpen = false,
}: {
  accounts: AccountRow[];
  transactions: BankingTransactionRow[];
  currency: string;
  canAddAccount: boolean;
  canTransfer: boolean;
  totalBalance: number;
  today: string;
  transactionPage: number;
  transactionPages: number;
  transactionFilters: BankingTransactionFilters;
  initialTransferOpen?: boolean;
}) {
  const [transferOpen, setTransferOpen] = useState(initialTransferOpen);
  const [transferMessage, setTransferMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const firstStatementHref = accounts[0] ? `/banking/${accounts[0].id}` : "#accounts";
  const bankAccountsCount = accounts.filter((account) => account.accountType !== "mobile_money").length;
  const mobileMoneyCount = accounts.filter((account) => account.accountType === "mobile_money").length;
  const pageHref = (page: number) => {
    const params = new URLSearchParams();
    if (transactionFilters.accountId) params.set("accountId", transactionFilters.accountId);
    if (transactionFilters.type) params.set("type", transactionFilters.type);
    if (transactionFilters.from) params.set("from", transactionFilters.from);
    if (transactionFilters.to) params.set("to", transactionFilters.to);
    if (transactionFilters.description) params.set("description", transactionFilters.description);
    params.set("transactionsPage", String(page));
    return `/banking?${params.toString()}#recent-transactions`;
  };

  function submitTransfer(formData: FormData) {
    setTransferMessage(null);
    startTransition(async () => {
      const result = await transferBankFunds(formData);
      if (result.error) {
        setTransferMessage({ kind: "error", text: result.error });
        return;
      }
      setTransferMessage({ kind: "success", text: "Transfer recorded successfully." });
      router.refresh();
    });
  }

  function closeTransfer() {
    setTransferOpen(false);
    if (initialTransferOpen) router.replace("/banking", { scroll: false });
  }

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
        <section className="overflow-hidden rounded-2xl border border-ledger-100 bg-white shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <div className="flex items-center justify-between gap-3 border-b border-ledger-100 px-5 py-4 dark:border-ledger-700">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                <FileText className="h-4 w-4" aria-hidden="true" />
              </span>
              <h2 className="font-display text-base font-semibold text-ink-900 dark:text-white">Recent Transactions</h2>
            </div>
            <Link href={accounts[0] ? `/banking/${accounts[0].id}` : "#accounts"} className="text-xs font-semibold text-blue-700 hover:underline dark:text-blue-300">
              View all
            </Link>
          </div>
          <form action="/banking#recent-transactions" method="get" className="grid gap-2 border-b border-ledger-100 bg-ledger-50/50 p-4 sm:grid-cols-2 xl:grid-cols-5 dark:border-ledger-700 dark:bg-white/[0.02]">
            <label className="sr-only" htmlFor="transaction-account-filter">Filter by account</label>
            <select id="transaction-account-filter" name="accountId" defaultValue={transactionFilters.accountId} className="h-9 min-w-0 rounded-lg border border-ledger-200 bg-white px-2.5 text-xs text-ink-900 dark:border-ledger-700 dark:bg-ink-950 dark:text-white">
              <option value="">All accounts</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
            <label className="sr-only" htmlFor="transaction-type-filter">Filter by transaction type</label>
            <select id="transaction-type-filter" name="type" defaultValue={transactionFilters.type} className="h-9 min-w-0 rounded-lg border border-ledger-200 bg-white px-2.5 text-xs text-ink-900 dark:border-ledger-700 dark:bg-ink-950 dark:text-white">
              <option value="">All transaction types</option>
              <option value="deposit">Deposits</option>
              <option value="withdrawal">Withdrawals</option>
              <option value="transfer">Transfers</option>
            </select>
            <label className="sr-only" htmlFor="transaction-date-from">From date</label>
            <input id="transaction-date-from" name="from" type="date" aria-label="Transactions from date" defaultValue={transactionFilters.from} className="h-9 min-w-0 rounded-lg border border-ledger-200 bg-white px-2.5 text-xs text-ink-900 dark:border-ledger-700 dark:bg-ink-950 dark:text-white" />
            <label className="sr-only" htmlFor="transaction-date-to">To date</label>
            <input id="transaction-date-to" name="to" type="date" aria-label="Transactions to date" min={transactionFilters.from || undefined} defaultValue={transactionFilters.to} className="h-9 min-w-0 rounded-lg border border-ledger-200 bg-white px-2.5 text-xs text-ink-900 dark:border-ledger-700 dark:bg-ink-950 dark:text-white" />
            <div className="flex gap-2">
              <label className="sr-only" htmlFor="transaction-description-filter">Search transaction description</label>
              <input id="transaction-description-filter" name="description" type="search" maxLength={100} defaultValue={transactionFilters.description} placeholder="Search description" className="h-9 min-w-0 flex-1 rounded-lg border border-ledger-200 bg-white px-2.5 text-xs text-ink-900 placeholder:text-ledger-400 dark:border-ledger-700 dark:bg-ink-950 dark:text-white" />
              <button type="submit" className="rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700">Filter</button>
            </div>
            <div className="flex items-center justify-between sm:col-span-2 xl:col-span-5">
              <span className="text-[11px] text-ledger-500 dark:text-ledger-400">Filter transactions by account, type, date, or description.</span>
              <Link href="/banking#recent-transactions" className="text-xs font-semibold text-blue-700 hover:underline dark:text-blue-300">Clear filters</Link>
            </div>
          </form>
          <div id="recent-transactions" className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-ledger-50/70 text-[11px] font-semibold uppercase tracking-wide text-ledger-500 dark:bg-white/[0.03] dark:text-ledger-400">
                <tr>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-3 py-3">Description</th>
                  <th className="px-3 py-3">Account</th>
                  <th className="px-3 py-3">Type</th>
                  <th className="px-5 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ledger-50 dark:divide-ledger-700/60">
                {accounts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-sm text-ledger-500 dark:text-ledger-400">
                      Add an account to see its transaction history here.
                    </td>
                  </tr>
                ) : null}
                {accounts.length > 0 && !transactions?.length ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-sm text-ledger-500 dark:text-ledger-400">
                      No transactions recorded yet.
                    </td>
                  </tr>
                ) : null}
                {transactions?.map((transaction) => {
                  const incoming = transaction.type === "deposit";
                  const isTransfer = transaction.description?.startsWith("Transfer ") ?? false;
                  return (
                    <tr key={transaction.id} className="hover:bg-ledger-50/60 dark:hover:bg-white/[0.025]">
                      <td className="whitespace-nowrap px-5 py-3.5 text-xs text-ledger-500 dark:text-ledger-400">
                        {new Date(`${transaction.transactionDate}T00:00:00`).toLocaleDateString(undefined, {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="max-w-[230px] px-3 py-3.5">
                        <span className="block truncate font-medium text-ink-900 dark:text-white">
                          {transaction.description || (isTransfer ? "Account transfer" : incoming ? "Deposit" : "Withdrawal")}
                        </span>
                      </td>
                      <td className="max-w-[150px] truncate px-3 py-3.5 text-xs text-ledger-600 dark:text-ledger-300">
                        {transaction.accountName}
                      </td>
                      <td className="px-3 py-3.5">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          isTransfer
                            ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"
                            : incoming
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                              : "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
                        }`}>
                          {isTransfer ? "Transfer" : incoming ? "Deposit" : "Withdrawal"}
                        </span>
                      </td>
                      <td className={`whitespace-nowrap px-5 py-3.5 text-right font-semibold tabular-nums ${
                        isTransfer ? "text-blue-700 dark:text-blue-300" : incoming ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"
                      }`}>
                        {incoming ? "+" : "−"}{transaction.formattedAmount}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {transactionPages > 1 && (
            <nav aria-label="Recent transaction pages" className="flex items-center justify-between border-t border-ledger-100 px-5 py-3 dark:border-ledger-700">
              <span className="text-xs text-ledger-500 dark:text-ledger-400">Page {transactionPage} of {transactionPages}</span>
              <div className="flex gap-2">
                <Link
                  href={pageHref(Math.max(1, transactionPage - 1))}
                  aria-disabled={transactionPage <= 1}
                  className={`rounded-lg border border-ledger-200 px-3 py-1.5 text-xs font-semibold dark:border-ledger-700 ${transactionPage <= 1 ? "pointer-events-none opacity-40" : "hover:bg-ledger-50 dark:hover:bg-white/[0.06]"}`}
                >
                  Previous
                </Link>
                <Link
                  href={pageHref(Math.min(transactionPages, transactionPage + 1))}
                  aria-disabled={transactionPage >= transactionPages}
                  className={`rounded-lg border border-ledger-200 px-3 py-1.5 text-xs font-semibold dark:border-ledger-700 ${transactionPage >= transactionPages ? "pointer-events-none opacity-40" : "hover:bg-ledger-50 dark:hover:bg-white/[0.06]"}`}
                >
                  Next
                </Link>
              </div>
            </nav>
          )}
        </section>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </span>
              <h2 className="font-display text-base font-semibold text-ink-900 dark:text-white">Quick Actions</h2>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              {canAddAccount && (
                <Link href="/banking/new" className="rounded-xl border border-ledger-100 p-3 hover:border-blue-200 hover:bg-blue-50/50 dark:border-ledger-700 dark:hover:border-blue-900 dark:hover:bg-blue-500/5">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"><Plus className="h-4 w-4" /></span>
                  <span className="mt-2 block text-xs font-semibold text-ink-900 dark:text-white">Add Bank Account</span>
                  <span className="mt-0.5 block text-[10px] text-ledger-500 dark:text-ledger-400">Add an account or wallet</span>
                </Link>
              )}
              <button
                type="button"
                onClick={() => { setTransferMessage(null); setTransferOpen(true); }}
                disabled={!canTransfer || accounts.length < 2}
                title={!canTransfer ? "You don't have permission to transfer funds" : accounts.length < 2 ? "Add another account before making a transfer" : undefined}
                className="rounded-xl border border-ledger-100 p-3 text-left hover:border-blue-200 hover:bg-blue-50/50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-ledger-700 dark:hover:border-blue-900 dark:hover:bg-blue-500/5"
              >
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"><ArrowLeftRight className="h-4 w-4" /></span>
                <span className="mt-2 block text-xs font-semibold text-ink-900 dark:text-white">Transfer Money</span>
                <span className="mt-0.5 block text-[10px] text-ledger-500 dark:text-ledger-400">Move between accounts</span>
              </button>
              <Link href={firstStatementHref} className="rounded-xl border border-ledger-100 p-3 hover:border-blue-200 hover:bg-blue-50/50 dark:border-ledger-700 dark:hover:border-blue-900 dark:hover:bg-blue-500/5">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"><FileText className="h-4 w-4" /></span>
                <span className="mt-2 block text-xs font-semibold text-ink-900 dark:text-white">View Statements</span>
                <span className="mt-0.5 block text-[10px] text-ledger-500 dark:text-ledger-400">Open account transactions</span>
              </Link>
              <a href="#accounts" className="rounded-xl border border-ledger-100 p-3 hover:border-blue-200 hover:bg-blue-50/50 dark:border-ledger-700 dark:hover:border-blue-900 dark:hover:bg-blue-500/5">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"><Settings2 className="h-4 w-4" /></span>
                <span className="mt-2 block text-xs font-semibold text-ink-900 dark:text-white">Manage Accounts</span>
                <span className="mt-0.5 block text-[10px] text-ledger-500 dark:text-ledger-400">View account cards</span>
              </a>
            </div>
          </section>

          <section className="rounded-2xl border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                  <Landmark className="h-4 w-4" aria-hidden="true" />
                </span>
                <h2 className="font-display text-base font-semibold text-ink-900 dark:text-white">Account Summary</h2>
              </div>
              <a href="#accounts" className="text-xs font-semibold text-blue-700 hover:underline dark:text-blue-300">View all</a>
            </div>
            <div className="mt-4">
              <p className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Total balance</p>
              <p className="figure mt-1 text-2xl font-semibold text-ink-900 dark:text-white">{formatCurrency(totalBalance, currency)}</p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-ledger-100 pt-4 dark:border-ledger-700">
              <div className="flex items-center gap-2">
                <Landmark className="h-4 w-4 text-ledger-400" aria-hidden="true" />
                <div><p className="text-[10px] text-ledger-500 dark:text-ledger-400">Bank accounts</p><p className="text-sm font-semibold text-ink-900 dark:text-white">{bankAccountsCount}</p></div>
              </div>
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-ledger-400" aria-hidden="true" />
                <div><p className="text-[10px] text-ledger-500 dark:text-ledger-400">Mobile money</p><p className="text-sm font-semibold text-ink-900 dark:text-white">{mobileMoneyCount}</p></div>
              </div>
            </div>
          </section>
        </aside>
      </div>

      {transferOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink-950/55 p-4" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !isPending) closeTransfer();
        }} onKeyDown={(event) => {
          if (event.key === "Escape" && !isPending) closeTransfer();
        }}>
          <section role="dialog" aria-modal="true" aria-labelledby="transfer-dialog-title" className="w-full max-w-lg rounded-2xl border border-ledger-100 bg-white p-6 shadow-2xl dark:border-ledger-700 dark:bg-ink-900">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="transfer-dialog-title" className="font-display text-lg font-semibold text-ink-900 dark:text-white">Transfer Money</h2>
                <p className="mt-1 text-sm text-ledger-500 dark:text-ledger-400">Move funds between your organization’s accounts.</p>
              </div>
              <button type="button" onClick={closeTransfer} disabled={isPending} aria-label="Close transfer dialog" className="rounded-lg p-2 text-ledger-500 hover:bg-ledger-50 dark:hover:bg-white/[0.06]"><X className="h-4 w-4" /></button>
            </div>
            {transferMessage && (
              <p role={transferMessage.kind === "error" ? "alert" : "status"} className={`mt-4 rounded-xl px-3 py-2 text-sm ${transferMessage.kind === "error" ? "bg-alert-soft text-alert" : "bg-signal-soft text-signal"}`}>
                {transferMessage.text}
              </p>
            )}
            <form action={submitTransfer} className="mt-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm font-medium text-ledger-700 dark:text-ledger-200">
                  From account
                  <select name="source_account_id" required className="h-10 w-full rounded-lg border border-ledger-200 bg-white px-3 text-sm dark:border-ledger-700 dark:bg-ink-950 dark:text-white">
                    {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                  </select>
                </label>
                <label className="space-y-1.5 text-sm font-medium text-ledger-700 dark:text-ledger-200">
                  To account
                  <select name="destination_account_id" required defaultValue={accounts[1]?.id} className="h-10 w-full rounded-lg border border-ledger-200 bg-white px-3 text-sm dark:border-ledger-700 dark:bg-ink-950 dark:text-white">
                    {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                  </select>
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm font-medium text-ledger-700 dark:text-ledger-200">
                  Amount ({currency})
                  <input name="amount" type="number" min="0.01" step="0.01" required className="h-10 w-full rounded-lg border border-ledger-200 bg-white px-3 text-sm dark:border-ledger-700 dark:bg-ink-950 dark:text-white" />
                </label>
                <label className="space-y-1.5 text-sm font-medium text-ledger-700 dark:text-ledger-200">
                  Transfer date
                  <input name="transaction_date" type="date" defaultValue={today} required className="h-10 w-full rounded-lg border border-ledger-200 bg-white px-3 text-sm dark:border-ledger-700 dark:bg-ink-950 dark:text-white" />
                </label>
              </div>
              <label className="block space-y-1.5 text-sm font-medium text-ledger-700 dark:text-ledger-200">
                Note <span className="font-normal text-ledger-400">(optional)</span>
                <input name="description" maxLength={120} className="h-10 w-full rounded-lg border border-ledger-200 bg-white px-3 text-sm dark:border-ledger-700 dark:bg-ink-950 dark:text-white" placeholder="Transfer purpose" />
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" onClick={closeTransfer} disabled={isPending}>Cancel</Button>
                <Button type="submit" disabled={isPending}>{isPending ? "Transferring…" : "Confirm transfer"}</Button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
