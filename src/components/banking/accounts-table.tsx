"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Banknote, Ellipsis, Landmark, Pencil, Trash2, Wallet, X } from "lucide-react";
import { deleteAccount, updateAccount } from "@/app/(dashboard)/banking/actions";
import { formatCurrency } from "@/lib/sales/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface AccountRow {
  id: string;
  name: string;
  accountType: string;
  currentBalance: number;
  accountNumber: string | null;
  logoUrl: string | null;
  monthChange: number;
  yearChange: number;
}

const TYPE_LABELS: Record<string, string> = {
  cash: "Cash account",
  checking: "Current account",
  savings: "Savings account",
  mobile_money: "Mobile money",
  card: "Card settlement account",
  other: "Other account",
};

function AccountIcon({ type, logoUrl, name }: { type: string; logoUrl: string | null; name: string }) {
  const Icon = type === "mobile_money" ? Wallet : type === "cash" ? Banknote : Landmark;
  if (logoUrl) {
    return (
      <span
        role="img"
        aria-label={`${name} logo`}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-ledger-100 bg-white bg-contain bg-center bg-no-repeat dark:border-slate-500 dark:bg-ink-950"
        style={{ backgroundImage: `url("${logoUrl}")` }}
      />
    );
  }
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
      <Icon className="h-4 w-4" aria-hidden="true" />
    </span>
  );
}

export function AccountsTable({ accounts, canEdit, canDelete, currency }: { accounts: AccountRow[]; canEdit: boolean; canDelete: boolean; currency: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<AccountRow | null>(null);
  const [accountSearch, setAccountSearch] = useState("");
  const [accountTypeFilter, setAccountTypeFilter] = useState("all");
  const router = useRouter();
  const filteredAccounts = accounts.filter((account) =>
    account.name.toLowerCase().includes(accountSearch.trim().toLowerCase())
      && (accountTypeFilter === "all" || account.accountType === accountTypeFilter)
  );

  function handleDelete(id: string, name: string) {
    if (!confirm(`Remove "${name}"? Accounts with transaction history cannot be removed.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteAccount(id);
      if (result?.error) setError(result.error);
      else router.refresh();
    });
    setOpenMenu(null);
  }

  function saveAccount(formData: FormData) {
    if (!editTarget) return;
    setError(null);
    startTransition(async () => {
      const result = await updateAccount(editTarget.id, formData);
      if (result?.error) setError(result.error);
      else {
        setEditTarget(null);
        router.refresh();
      }
    });
  }

  if (accounts.length === 0) {
    return (
      <div id="accounts" className="rounded-2xl border border-dashed border-ledger-200 bg-white px-6 py-12 text-center dark:border-slate-500 dark:bg-ink-900">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
          <Landmark className="h-6 w-6" aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-base font-semibold text-ink-900 dark:text-white">No bank accounts yet</h2>
        <p className="mt-1 text-sm text-ledger-500 dark:text-ledger-400">Add a bank account or mobile money wallet to start managing balances.</p>
      </div>
    );
  }

  return (
    <div id="accounts" className="space-y-3">
      {error && <p role="alert" className="rounded-xl bg-alert-soft px-4 py-3 text-sm text-alert">{error}</p>}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-display text-base font-semibold text-ink-900 dark:text-white">Your Accounts</h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor="account-search">Search accounts</label>
          <input
            id="account-search"
            type="search"
            value={accountSearch}
            onChange={(event) => setAccountSearch(event.target.value)}
            placeholder="Search accounts"
            className="h-9 min-w-0 rounded-lg border border-ledger-200 bg-white px-3 text-sm text-ink-900 placeholder:text-ledger-400 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:w-48 dark:border-slate-500 dark:bg-ink-900 dark:text-white"
          />
          <label className="sr-only" htmlFor="account-type-filter">Filter accounts by type</label>
          <select
            id="account-type-filter"
            value={accountTypeFilter}
            onChange={(event) => setAccountTypeFilter(event.target.value)}
            className="h-9 rounded-lg border border-ledger-200 bg-white px-3 text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-500 dark:bg-ink-900 dark:text-white"
          >
            <option value="all">All account types</option>
            <option value="checking">Current accounts</option>
            <option value="savings">Savings accounts</option>
            <option value="mobile_money">Mobile money</option>
            <option value="card">Card settlement accounts</option>
            <option value="cash">Cash accounts</option>
            <option value="other">Other accounts</option>
          </select>
        </div>
      </div>
      {filteredAccounts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ledger-200 bg-white px-6 py-10 text-center dark:border-slate-500 dark:bg-ink-900">
          <p className="text-sm text-ledger-500 dark:text-ledger-400">No accounts match these filters.</p>
        </div>
      ) : (
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {filteredAccounts.map((account) => (
          <article
            key={account.id}
            className="relative min-w-0 rounded-xl border border-ledger-100 bg-white p-2.5 shadow-card dark:border-2 dark:border-slate-500 dark:bg-ink-900"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <AccountIcon type={account.accountType} logoUrl={account.logoUrl} name={account.name} />
                <div className="min-w-0">
                  <h2 className="truncate font-display text-sm font-semibold text-ink-900 dark:text-white">{account.name}</h2>
                  <p className="mt-0.5 truncate text-[11px] text-ledger-500 dark:text-ledger-400">
                    {TYPE_LABELS[account.accountType] ?? account.accountType}
                  </p>
                </div>
              </div>
              {(canEdit || canDelete) && (
                <div className="relative">
                  <button
                    type="button"
                    aria-label={`More actions for ${account.name}`}
                    aria-expanded={openMenu === account.id}
                    onClick={() => setOpenMenu(openMenu === account.id ? null : account.id)}
                    className="grid h-8 w-8 place-items-center rounded-lg text-ledger-500 hover:bg-ledger-50 hover:text-ink-900 dark:hover:bg-white/[0.06] dark:hover:text-white"
                  >
                    <Ellipsis className="h-5 w-5" />
                  </button>
                  {openMenu === account.id && (
                    <div className="absolute right-0 top-10 z-20 w-44 rounded-xl border border-ledger-100 bg-white p-1.5 shadow-lg dark:border-slate-500 dark:bg-ink-900">
                      <Link
                        href={`/banking/${account.id}?view=statement`}
                        className="block rounded-lg px-3 py-2 text-left text-sm text-ink-900 hover:bg-ledger-50 dark:text-white dark:hover:bg-white/[0.06]"
                        onClick={() => setOpenMenu(null)}
                      >
                        View statement
                      </Link>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => { setError(null); setEditTarget(account); setOpenMenu(null); }}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink-900 hover:bg-ledger-50 dark:text-white dark:hover:bg-white/[0.06]"
                        >
                          <Pencil className="h-4 w-4" />
                          Edit account
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => handleDelete(account.id, account.name)}
                          disabled={isPending}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-alert hover:bg-alert-soft disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" />
                          Remove account
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <p className="mt-2 truncate font-mono text-[10px] text-ledger-500 dark:text-ledger-400" title={account.accountNumber ?? "No account number added"}>
              {account.accountNumber || "No account number added"}
            </p>

            <div className="mt-2">
              <p className="text-[11px] font-medium text-ledger-500 dark:text-ledger-400">Current balance</p>
              <p className="figure mt-0.5 truncate text-lg font-semibold tracking-tight text-ink-900 dark:text-white">
                {formatCurrency(account.currentBalance, currency)}
              </p>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-ledger-100 pt-2 dark:border-slate-600">
              {[
                { label: "MoM", value: account.monthChange, title: "Net balance change this month" },
                { label: "YoY", value: account.yearChange, title: "Net balance change over the past year" },
              ].map(({ label, value, title }) => (
                <div key={label} className="min-w-0" title={title}>
                  <p className="text-[10px] font-medium text-ledger-500 dark:text-ledger-400">{label}</p>
                  <p className={`truncate text-[11px] font-semibold tabular-nums ${value > 0 ? "text-emerald-700 dark:text-emerald-300" : value < 0 ? "text-rose-700 dark:text-rose-300" : "text-ledger-500 dark:text-ledger-400"}`}>
                    {value > 0 ? "+" : ""}{formatCurrency(value, currency)}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-2 flex items-center justify-between border-t border-ledger-100 pt-1.5 dark:border-slate-600">
              <Link
                href={`/banking/${account.id}`}
                className="inline-flex min-h-7 items-center rounded-lg px-1.5 text-[10px] font-semibold text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-500/10"
              >
                Deposit / Withdraw
              </Link>
              <Link
                href={`/banking/${account.id}?view=statement`}
                className="inline-flex min-h-7 items-center rounded-lg px-1.5 text-[10px] font-semibold text-ledger-600 hover:bg-ledger-50 dark:text-ledger-300 dark:hover:bg-white/[0.06]"
              >
                View statement
              </Link>
            </div>
          </article>
        ))}
      </div>
      )}
      {editTarget && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink-950/55 p-4" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !isPending) setEditTarget(null);
        }} onKeyDown={(event) => {
          if (event.key === "Escape" && !isPending) setEditTarget(null);
        }}>
          <section role="dialog" aria-modal="true" aria-labelledby="edit-account-title" className="w-full max-w-md rounded-2xl border border-ledger-100 bg-white p-6 shadow-2xl dark:border-2 dark:border-slate-500 dark:bg-ink-900">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="edit-account-title" className="font-display text-lg font-semibold text-ink-900 dark:text-white">Edit account</h2>
                <p className="mt-1 text-sm text-ledger-500 dark:text-ledger-400">Update the account details used in your records.</p>
              </div>
              <button type="button" onClick={() => setEditTarget(null)} disabled={isPending} aria-label="Close edit account dialog" className="rounded-lg p-2 text-ledger-500 hover:bg-ledger-50 dark:hover:bg-white/[0.06]"><X className="h-4 w-4" /></button>
            </div>
            {error && <p role="alert" className="mt-4 rounded-xl bg-alert-soft px-3 py-2 text-sm text-alert">{error}</p>}
            <form action={saveAccount} encType="multipart/form-data" className="mt-5 space-y-4">
              <label className="block space-y-1.5 text-sm font-medium text-ledger-700 dark:text-ledger-200">
                Account name
                <Input name="name" defaultValue={editTarget.name} required maxLength={120} className="dark:border-slate-600 dark:bg-ink-950" />
              </label>
              <label className="block space-y-1.5 text-sm font-medium text-ledger-700 dark:text-ledger-200">
                Account or wallet number
                <Input name="account_number" defaultValue={editTarget.accountNumber ?? ""} maxLength={80} className="dark:border-slate-600 dark:bg-ink-950" />
              </label>
              <label className="block space-y-1.5 text-sm font-medium text-ledger-700 dark:text-ledger-200">
                Bank or wallet logo
                <Input name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="h-auto py-2 dark:border-slate-600 dark:bg-ink-950 file:mr-3 file:rounded-lg file:border-0 file:bg-ledger-100 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-ink-900 dark:file:bg-white/[0.08] dark:file:text-white" />
                <span className="block text-xs font-normal text-ledger-400">PNG, JPG, or WebP; up to 2 MB. Leave empty to keep the current logo.</span>
              </label>
              <label className="block space-y-1.5 text-sm font-medium text-ledger-700 dark:text-ledger-200">
                Account type
                <select name="account_type" defaultValue={editTarget.accountType} className="h-10 w-full rounded-lg border border-ledger-200 bg-white px-3 text-sm text-ink-900 dark:border-slate-600 dark:bg-ink-950 dark:text-white">
                  <option value="cash">Cash</option>
                  <option value="checking">Current account</option>
                  <option value="savings">Savings account</option>
                  <option value="mobile_money">Mobile money</option>
                  <option value="card">Card settlement account</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" onClick={() => setEditTarget(null)} disabled={isPending}>Cancel</Button>
                <Button type="submit" disabled={isPending}>{isPending ? "Saving…" : "Save changes"}</Button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
