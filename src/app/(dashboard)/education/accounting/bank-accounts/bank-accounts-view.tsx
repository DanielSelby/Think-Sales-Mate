"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowLeft, ArrowRightLeft, Ellipsis, Landmark, Pencil, Plus, Search, Trash2, Wallet, X } from "lucide-react";
import { formatCurrency } from "@/lib/sales/format";
import { getProductAppPath } from "@/lib/product-app-routes";
import {
  deleteEducationBankAccount,
  saveEducationBankAccount,
  setEducationBankAccountActive,
} from "./actions";

const ACCOUNT_TYPES = [
  { value: "cash", label: "Cash" },
  { value: "checking", label: "Current account" },
  { value: "savings", label: "Savings account" },
  { value: "mobile_money", label: "Mobile money" },
  { value: "card", label: "Card settlement" },
  { value: "other", label: "Other" },
] as const;

type EducationBankAccount = {
  id: string;
  branchId: string | null;
  code: string;
  name: string;
  isActive: boolean;
  accountType: (typeof ACCOUNT_TYPES)[number]["value"];
  accountNumber: string | null;
  accountNumberDisplay: string;
  logoUrl: string | null;
  balance: number | null;
};

export function EducationBankAccountsView({
  accounts,
  campuses,
  currency,
  hasOrganizationScope,
  canCreate,
  canEdit,
}: {
  accounts: EducationBankAccount[];
  campuses: Array<{ id: string; name: string }>;
  currency: string;
  hasOrganizationScope: boolean;
  canCreate: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [campusFilter, setCampusFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [formTarget, setFormTarget] = useState<EducationBankAccount | null | undefined>(undefined);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const campusNames = useMemo(() => new Map(campuses.map((campus) => [campus.id, campus.name])), [campuses]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredAccounts = accounts.filter((account) => {
    const campusName = account.branchId ? campusNames.get(account.branchId) ?? "" : "all campuses";
    const searchText = `${account.code} ${account.name} ${account.accountNumberDisplay} ${campusName}`.toLocaleLowerCase();
    return (!normalizedQuery || searchText.includes(normalizedQuery))
      && (typeFilter === "all" || account.accountType === typeFilter)
      && (campusFilter === "all" || (campusFilter === "organization" ? !account.branchId : account.branchId === campusFilter))
      && (statusFilter === "all" || (statusFilter === "active" ? account.isActive : !account.isActive));
  });
  const activeCount = accounts.filter((account) => account.isActive).length;
  const balanceTotal = accounts.reduce((total, account) => total + (account.balance ?? 0), 0);

  function submitAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError("");
    startTransition(async () => {
      const result = await saveEducationBankAccount(formData);
      if (result.error) {
        setError(result.error);
        if (result.refresh) router.refresh();
        return;
      }
      setFormTarget(undefined);
      router.refresh();
    });
  }

  function updateActive(account: EducationBankAccount, isActive: boolean) {
    setError("");
    startTransition(async () => {
      const result = await setEducationBankAccountActive(account.id, isActive);
      if (result.error) setError(result.error);
      else router.refresh();
    });
    setActiveMenu(null);
  }

  function removeAccount(account: EducationBankAccount) {
    if (!window.confirm(`Permanently delete "${account.code} · ${account.name}"? This is only allowed when the account has no accounting history.`)) {
      return;
    }
    setError("");
    startTransition(async () => {
      const result = await deleteEducationBankAccount(account.id);
      if (result.error) {
        setError(result.error);
        if (result.refresh) router.refresh();
      }
      else router.refresh();
    });
    setActiveMenu(null);
  }

  const cashbookHref = getProductAppPath("think-education", "/accounting/cashbook");
  const reconciliationHref = getProductAppPath("think-education", "/accounting/bank-reconciliation");
  const chartHref = getProductAppPath("think-education", "/accounting/chart-of-accounts");

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href={getProductAppPath("think-education", "/accounting")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
            <ArrowLeft className="h-4 w-4" /> Accounting
          </Link>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-blue-700">Think Education · Cash &amp; Banking</p>
          <h1 className="mt-1 flex items-center gap-2 text-3xl font-semibold tracking-tight text-slate-950">
            <Landmark className="h-7 w-7 text-blue-700" /> Bank Accounts
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">Manage cash and bank ledger accounts. Account balances come from posted journals, keeping fees and expenses linked to the chart of accounts.</p>
        </div>
        {canCreate && (
          <button type="button" onClick={() => { setError(""); setFormTarget(null); }} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">
            <Plus className="h-4 w-4" /> Add bank account
          </button>
        )}
      </header>

      <nav aria-label="Cash and banking pages" className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        <Link href={getProductAppPath("think-education", "/accounting/bank-accounts")} aria-current="page" className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white">Accounts</Link>
        <Link href={cashbookHref} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">Transactions / Cashbook</Link>
        <Link href={reconciliationHref} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">Reconciliation</Link>
      </nav>

      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</p>}

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Cash and bank accounts", value: accounts.length.toLocaleString(), icon: Landmark },
          { label: "Active accounts", value: activeCount.toLocaleString(), icon: Wallet },
          { label: "Posted ledger balance", value: formatCurrency(balanceTotal, currency), icon: ArrowDownLeft },
        ].map(({ label, value, icon: Icon }) => (
          <article key={label} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-xl font-bold text-slate-950">{value}</p></div>
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><Icon className="h-5 w-5" /></span>
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
          <div>
            <h2 className="font-semibold text-slate-950">Registered accounts</h2>
            <p className="text-sm text-slate-500">{filteredAccounts.length} shown · {accounts.length} total</p>
          </div>
          <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-2 lg:grid-cols-4">
            <label className="relative">
              <span className="sr-only">Search bank accounts</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="Search account or campus" className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:w-56" />
            </label>
            <label>
              <span className="sr-only">Filter by account type</span>
              <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
                <option value="all">All account types</option>
                {ACCOUNT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
            </label>
            <label>
              <span className="sr-only">Filter by campus</span>
              <select value={campusFilter} onChange={(event) => setCampusFilter(event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
                <option value="all">All campuses</option>
                {hasOrganizationScope && <option value="organization">Organization-wide</option>}
                {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
              </select>
            </label>
            <label>
              <span className="sr-only">Filter by account status</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
                <option value="active">Active accounts</option>
                <option value="inactive">Inactive accounts</option>
                <option value="all">All statuses</option>
              </select>
            </label>
          </div>
        </div>

        {filteredAccounts.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <Landmark className="mx-auto h-10 w-10 text-slate-300" />
            <h3 className="mt-3 font-semibold text-slate-900">{accounts.length ? "No accounts match these filters" : "No bank accounts yet"}</h3>
            <p className="mt-1 text-sm text-slate-500">{accounts.length ? "Try changing the search or filters." : "Create a cash/bank asset account to use it for fees, expenses, and reconciliation."}</p>
            {!accounts.length && <Link href={chartHref} className="mt-3 inline-flex text-sm font-semibold text-blue-700 hover:underline">Open Chart of Accounts</Link>}
          </div>
        ) : (
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredAccounts.map((account) => {
              const accountTypeLabel = ACCOUNT_TYPES.find((type) => type.value === account.accountType)?.label ?? "Other";
              const campusName = account.branchId ? campusNames.get(account.branchId) ?? "Assigned campus" : "All campuses";
              return (
                <article key={account.id} className="relative rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      {account.logoUrl
                        ? <span role="img" aria-label={`${account.name} logo`} className="h-11 w-11 shrink-0 rounded-xl border border-slate-200 bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url("${account.logoUrl}")` }} />
                        : <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><Landmark className="h-5 w-5" /></span>}
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold text-slate-950">{account.name}</h3>
                        <p className="truncate font-mono text-xs text-slate-500">{account.code} · {accountTypeLabel}</p>
                      </div>
                    </div>
                    {canEdit && (
                      <div className="relative">
                        <button type="button" aria-label={`More actions for ${account.name}`} aria-expanded={activeMenu === account.id} onClick={() => setActiveMenu(activeMenu === account.id ? null : account.id)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100">
                          <Ellipsis className="h-5 w-5" />
                        </button>
                        {activeMenu === account.id && (
                          <div className="absolute right-0 top-9 z-10 w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                            <button type="button" onClick={() => { setError(""); setFormTarget(account); setActiveMenu(null); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50"><Pencil className="h-4 w-4" /> Edit account</button>
                            <button type="button" disabled={isPending} onClick={() => updateActive(account, !account.isActive)} className="w-full rounded-lg px-3 py-2 text-left text-sm text-amber-800 hover:bg-amber-50">{account.isActive ? "Deactivate" : "Activate"}</button>
                            <button type="button" disabled={isPending} onClick={() => removeAccount(account)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50"><Trash2 className="h-4 w-4" /> Delete account</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-slate-600">{account.accountNumberDisplay}</p>
                      <p className="mt-1 truncate text-xs text-slate-500">{campusName}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${account.isActive ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{account.isActive ? "Active" : "Inactive"}</span>
                  </div>
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <p className="text-xs text-slate-500">Posted ledger balance</p>
                    <p className="mt-0.5 truncate text-xl font-semibold tabular-nums text-slate-950">{account.balance === null ? "Not available" : formatCurrency(account.balance, currency)}</p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 border-t border-slate-100 pt-3 text-sm font-semibold">
                    <Link href={`${cashbookHref}?account=${encodeURIComponent(account.id)}`} className="inline-flex items-center gap-1 text-blue-700 hover:underline"><ArrowRightLeft className="h-4 w-4" /> Transactions</Link>
                    <Link href={reconciliationHref} className="text-blue-700 hover:underline">Reconciliation</Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {formTarget !== undefined && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/55 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isPending) setFormTarget(undefined); }} onKeyDown={(event) => { if (event.key === "Escape" && !isPending) setFormTarget(undefined); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="education-bank-account-form-title" className="my-auto max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="education-bank-account-form-title" className="text-lg font-semibold text-slate-950">{formTarget ? "Edit bank account" : "Add bank account"}</h2>
                <p className="mt-1 text-sm text-slate-500">This account is also a cash/bank ledger account in the Chart of Accounts.</p>
              </div>
              <button type="button" onClick={() => setFormTarget(undefined)} disabled={isPending} aria-label="Close bank account form" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"><X className="h-4 w-4" /></button>
            </div>
            {error && <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">{error}</p>}
            <form onSubmit={submitAccount} encType="multipart/form-data" className="mt-5 grid gap-4 sm:grid-cols-2">
              {formTarget && <input type="hidden" name="accountId" value={formTarget.id} />}
              <label className="text-sm font-medium text-slate-700">Account code
                <input required name="code" defaultValue={formTarget?.code ?? ""} minLength={2} maxLength={20} pattern="[A-Za-z0-9][A-Za-z0-9._/-]{1,19}" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
              </label>
              <label className="text-sm font-medium text-slate-700">Account name
                <input required name="name" defaultValue={formTarget?.name ?? ""} maxLength={120} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
              </label>
              {!formTarget && (
                <label className="text-sm font-medium text-slate-700">Campus scope
                  <select required={!hasOrganizationScope} name="branchId" defaultValue={hasOrganizationScope ? "" : campuses[0]?.id ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                    {hasOrganizationScope && <option value="">All campuses</option>}
                    {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
                  </select>
                </label>
              )}
              <label className="text-sm font-medium text-slate-700">Bank account type
                <select required name="bankAccountType" defaultValue={formTarget?.accountType ?? "checking"} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                  {ACCOUNT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">Account or wallet number
                <input name="accountNumber" defaultValue={formTarget?.accountNumber ?? ""} maxLength={80} autoComplete="off" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
              </label>
              <label className="text-sm font-medium text-slate-700 sm:col-span-2">Bank or wallet logo <span className="font-normal text-slate-500">(optional, PNG/JPG/WebP up to 2 MB)</span>
                <input name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold" />
              </label>
              {formTarget?.logoUrl && (
                <label className="flex items-center gap-2 text-sm text-slate-600 sm:col-span-2">
                  <input type="checkbox" name="removeLogo" className="h-4 w-4 rounded border-slate-300" /> Remove the current logo
                </label>
              )}
              <p className="text-xs text-slate-500 sm:col-span-2">For security, only the last four account-number digits appear on the account card. Record opening balances with an opening-balance journal entry.</p>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <button type="button" onClick={() => setFormTarget(undefined)} disabled={isPending} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={isPending} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60">{isPending ? "Saving…" : formTarget ? "Save changes" : "Add account"}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
