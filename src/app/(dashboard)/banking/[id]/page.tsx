import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { ArrowDown, ArrowLeft, ArrowLeftRight, ArrowUp, ArrowUpRight, BarChart3, CheckCircle2, Clock3, FileText, Landmark, Wallet } from "lucide-react";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { formatCurrency } from "@/lib/sales/format";
import { normalizeBankTransactionSearch } from "@/lib/banking/transaction-search";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { recordTransaction } from "@/app/(dashboard)/banking/actions";
import { canPermission } from "@/lib/rbac/permissions";
import { AddAccountDialog } from "@/components/banking/add-account-dialog";
import { AutoSubmitFilterForm } from "@/components/banking/auto-submit-filter-form";
import { buildAccountStatement, type BankStatementTransaction } from "./statement-ledger";
import { CopyAccountNumberButton, StatementActions, type StatementDownloadRow } from "./statement-actions";

const TYPE_LABELS: Record<string, string> = {
  cash: "Cash",
  checking: "Checking",
  savings: "Savings",
  mobile_money: "Mobile money",
  card: "Card settlement account",
  other: "Other"
};

export default async function AccountDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; view?: string; type?: string; from?: string; to?: string; description?: string; location_id?: string; page?: string }>;
}) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const isStatementView = resolvedSearchParams.view === "statement";
  const allowedTypes = ["income", "debt_pay", "expense", "transfer", "deposit"];
  const transactionType = allowedTypes.includes(resolvedSearchParams.type ?? "") ? resolvedSearchParams.type ?? "" : "";
  const validDate = (value: string | undefined) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : "";
  };
  const dateFrom = validDate(resolvedSearchParams.from);
  const requestedTo = validDate(resolvedSearchParams.to);
  const dateTo = dateFrom && requestedTo && requestedTo < dateFrom ? "" : requestedTo;
  const description = (resolvedSearchParams.description ?? "").trim().slice(0, 100);
  const searchText = normalizeBankTransactionSearch(description);
  const requestedLocationId = resolvedSearchParams.location_id ?? "";
  const pageValue = Number.parseInt(resolvedSearchParams.page ?? "1", 10);
  const statementPage = Number.isFinite(pageValue) && pageValue > 0 ? pageValue : 1;
  const pageSize = 20;
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context || !can(context.role, "banking.view")) return null;

  const supabase = await createClient();
  const { data: locations, error: locationsError } = await supabase
    .from("business_locations")
    .select("id, name")
    .eq("org_id", context.orgId)
    .order("name");
  if (locationsError) throw new Error(`Branches could not be loaded: ${locationsError.message}`);
  const branchOptions = (locations ?? []).filter((location) =>
    !context.isBranchScoped || context.allowedLocationIds.includes(location.id)
  );
  const locationNames = new Map((locations ?? []).map((location) => [location.id, location.name]));
  const selectedLocationId = requestedLocationId === "unassigned" && !context.isBranchScoped
    ? requestedLocationId
    : branchOptions.some((location) => location.id === requestedLocationId) ? requestedLocationId : "";
  const { data: account } = await supabase
    .from("bank_accounts")
    .select("id, name, account_type, account_number, current_balance, opening_balance, logo_url")
    .eq("id", id)
    .eq("org_id", context.orgId)
    .single();

  if (!account) notFound();

  let transactionsQuery = supabase
    .from("bank_transactions")
    .select("id, type, amount, description, counterparty_name, transaction_category, transaction_date, created_at, location_id", { count: "exact" })
    .eq("account_id", account.id)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (transactionType === "income") transactionsQuery = transactionsQuery.eq("transaction_category", "income");
  else if (transactionType === "debt_pay") transactionsQuery = transactionsQuery.eq("transaction_category", "debt_payment");
  else if (transactionType === "expense") transactionsQuery = transactionsQuery.eq("transaction_category", "expense");
  else if (transactionType === "transfer") transactionsQuery = transactionsQuery.or("transaction_category.eq.transfer,description.ilike.Transfer %");
  else if (transactionType === "deposit") transactionsQuery = transactionsQuery.eq("type", "deposit").is("transaction_category", null);
  if (dateFrom) transactionsQuery = transactionsQuery.gte("transaction_date", dateFrom);
  if (dateTo) transactionsQuery = transactionsQuery.lte("transaction_date", dateTo);
  if (context.isBranchScoped) {
    transactionsQuery = context.allowedLocationIds.length
      ? transactionsQuery.in("location_id", context.allowedLocationIds)
      : transactionsQuery.eq("location_id", "00000000-0000-0000-0000-000000000000");
  }
  if (selectedLocationId === "unassigned") transactionsQuery = transactionsQuery.is("location_id", null);
  else if (selectedLocationId) transactionsQuery = transactionsQuery.eq("location_id", selectedLocationId);
  if (description && !searchText) {
    transactionsQuery = transactionsQuery.eq("id", "00000000-0000-0000-0000-000000000000");
  } else if (searchText) {
    transactionsQuery = transactionsQuery.or(`description.ilike.%${searchText}%,counterparty_name.ilike.%${searchText}%`);
  }
  let transactions: BankStatementTransaction[] = [];
  let transactionCount = 0;
  let transactionsErrorMessage: string | null = null;
  if (isStatementView) {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase
        .from("bank_transactions")
        .select("id, type, amount, description, counterparty_name, transaction_category, transaction_date, created_at, location_id")
        .eq("account_id", account.id)
        .order("transaction_date", { ascending: true })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + 999);
      if (error) {
        transactionsErrorMessage = `Bank account transactions could not be loaded: ${error.message}`;
        break;
      }
      transactions.push(...(data ?? []));
      if ((data ?? []).length < 1000) break;
    }
    transactionCount = transactions.length;
  } else {
    const { data, count, error } = await transactionsQuery;
    if (error) throw new Error(`Bank account transactions could not be loaded: ${error.message}`);
    transactions = data ?? [];
    transactionCount = count ?? transactions.length;
  }
  const statement = isStatementView && !transactionsErrorMessage
    ? buildAccountStatement(Number(account.opening_balance ?? 0), transactions, dateFrom, dateTo)
    : null;
  const statementMatches = statement?.transactions.filter((transaction) => {
    if (context.isBranchScoped
      && (!transaction.location_id || !context.allowedLocationIds.includes(transaction.location_id))) return false;
    if (transactionType === "income" && transaction.transaction_category !== "income") return false;
    if (transactionType === "debt_pay" && transaction.transaction_category !== "debt_payment") return false;
    if (transactionType === "expense" && transaction.transaction_category !== "expense") return false;
    if (transactionType === "transfer" && transaction.transaction_category !== "transfer" && !transaction.description?.startsWith("Transfer ")) return false;
    if (transactionType === "deposit" && (transaction.type !== "deposit" || transaction.transaction_category)) return false;
    if (selectedLocationId === "unassigned" && transaction.location_id) return false;
    if (selectedLocationId && selectedLocationId !== "unassigned" && transaction.location_id !== selectedLocationId) return false;
    if (description && !searchText) return false;
    if (searchText) {
      const needle = searchText.toLocaleLowerCase();
      if (!`${transaction.description ?? ""} ${transaction.counterparty_name ?? ""}`.toLocaleLowerCase().includes(needle)) return false;
    }
    return true;
  }).sort((left, right) =>
    right.transaction_date.localeCompare(left.transaction_date)
      || right.created_at.localeCompare(left.created_at)
      || right.id.localeCompare(left.id),
  ) ?? [];
  const statementPages = Math.max(1, Math.ceil(statementMatches.length / pageSize));
  const currentStatementPage = Math.min(statementPage, statementPages);
  const visibleStatementRows = statementMatches.slice((currentStatementPage - 1) * pageSize, currentStatementPage * pageSize);
  const makeStatementHref = (page: number) => {
    const query = new URLSearchParams({ view: "statement", page: String(page) });
    if (transactionType) query.set("type", transactionType);
    if (selectedLocationId) query.set("location_id", selectedLocationId);
    if (dateFrom) query.set("from", dateFrom);
    if (dateTo) query.set("to", dateTo);
    if (description) query.set("description", description);
    return `/banking/${account.id}?${query.toString()}`;
  };
  const makeStatementDatesClearHref = () => {
    const query = new URLSearchParams({ view: "statement" });
    if (transactionType) query.set("type", transactionType);
    if (selectedLocationId) query.set("location_id", selectedLocationId);
    if (description) query.set("description", description);
    return `/banking/${account.id}?${query.toString()}`;
  };

  const canManage = can(context.role, "banking.manage");
  const boundRecord = recordTransaction.bind(null, account.id);
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: organizationSettings, error: organizationSettingsError }, { data: organizationAccounts, error: organizationAccountsError }] = isStatementView
    ? await Promise.all([
      supabase.from("org_general_settings").select("timezone").eq("org_id", context.orgId).maybeSingle(),
      supabase.from("bank_accounts").select("id, account_type, current_balance").eq("org_id", context.orgId),
    ])
    : [{ data: null, error: null }, { data: null, error: null }];
  const statementTimeZone = organizationSettings?.timezone || "UTC";
  const [canAddAccount, canTransfer] = isStatementView
    ? await Promise.all([canPermission("banking", "create"), canPermission("banking", "edit")])
    : [false, false];
  const statementPeriod = dateFrom || dateTo
    ? `${dateFrom || "Beginning"} – ${dateTo || "Present"}`
    : "All transactions";
  const statementDownloadRows: StatementDownloadRow[] = (statement?.transactions ?? [])
    .filter((transaction) => !context.isBranchScoped
      || Boolean(transaction.location_id && context.allowedLocationIds.includes(transaction.location_id)))
    .map((transaction) => {
    const isTransfer = transaction.transaction_category === "transfer" || transaction.description?.startsWith("Transfer ");
    const type = isTransfer ? "Transfer"
      : transaction.transaction_category === "income" ? "Income"
        : transaction.transaction_category === "debt_payment" ? "Debt payment"
          : transaction.transaction_category === "expense" ? "Expense"
            : transaction.type === "deposit" ? "Deposit" : "Withdrawal";
    return {
      date: transaction.transaction_date,
      description: transaction.description || type,
      counterparty: transaction.counterparty_name ?? "",
      branch: transaction.location_id ? locationNames.get(transaction.location_id) ?? "Unassigned" : "Unassigned",
      type,
      amount: transaction.type === "deposit" ? Number(transaction.amount) : -Number(transaction.amount),
      runningBalance: transaction.runningBalance,
    };
    });

  if (isStatementView) {
    const statementError = transactionsErrorMessage
      ?? (organizationSettingsError ? `Organization settings could not be loaded: ${organizationSettingsError.message}` : null);
    const accountCountError = organizationAccountsError?.message ?? null;
    const transferHref = `/banking?transfer=1`;
    const viewTransactionsHref = `/banking?accountId=${encodeURIComponent(account.id)}#recent-transactions`;

    return (
      <main className="account-statement-print w-full min-w-0 space-y-5 text-ink-900 dark:text-white">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <Link href="/banking" className="account-statement-no-print inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-900 dark:text-blue-300">
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back to Banking
            </Link>
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">{context.orgName}</p>
            <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-[#12345a] dark:text-white">Account Statement</h1>
            <p className="mt-1 text-sm text-ledger-500 dark:text-ledger-400">View your account details and transaction history.</p>
          </div>
          <div className="account-statement-no-print flex flex-col gap-2 sm:flex-row sm:items-end">
            <AutoSubmitFilterForm action={`/banking/${account.id}`} className="flex flex-wrap items-end gap-2 rounded-xl border border-[#d5e2ef] bg-white p-2 shadow-sm dark:border-slate-500 dark:bg-ink-900">
              <input type="hidden" name="view" value="statement" />
              {transactionType && <input type="hidden" name="type" value={transactionType} />}
              {description && <input type="hidden" name="description" value={description} />}
              {selectedLocationId && <input type="hidden" name="location_id" value={selectedLocationId} />}
              <label className="text-[10px] font-medium text-ledger-500">From
                <input name="from" type="date" defaultValue={dateFrom} className="mt-1 block h-8 rounded-md border border-ledger-200 px-2 text-xs dark:border-slate-500 dark:bg-ink-950" />
              </label>
              <label className="text-[10px] font-medium text-ledger-500">To
                <input name="to" type="date" min={dateFrom || undefined} defaultValue={dateTo} className="mt-1 block h-8 rounded-md border border-ledger-200 px-2 text-xs dark:border-slate-500 dark:bg-ink-950" />
              </label>
              <Button type="submit" className="h-8 px-3 text-xs">Apply dates</Button>
              {(dateFrom || dateTo) && <Link href={makeStatementDatesClearHref()} className="px-1 text-[10px] font-semibold text-blue-700 hover:underline dark:text-blue-300">Clear dates</Link>}
            </AutoSubmitFilterForm>
            <StatementActions
              accountName={account.name}
              accountNumber={account.account_number}
              organizationName={context.orgName}
              currency={context.currency}
              period={statementPeriod}
              openingBalance={statement?.openingBalance ?? Number(account.opening_balance ?? 0)}
              closingBalance={statement?.closingBalance ?? Number(account.current_balance ?? 0)}
              transactions={statementDownloadRows}
            />
          </div>
        </header>

        <section className="account-statement-card overflow-hidden rounded-2xl border border-[#dce8f2] bg-gradient-to-r from-[#eff7ff] via-white to-[#f5faff] p-5 shadow-sm dark:border-slate-500 dark:from-blue-950/40 dark:via-ink-900 dark:to-ink-900 sm:p-6">
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.8fr_1fr] lg:items-center">
            <div className="flex min-w-0 items-center gap-4">
              {account.logo_url ? (
                <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl border border-blue-100 bg-white p-1.5 dark:border-slate-600 dark:bg-ink-950">
                  <Image src={account.logo_url} alt={`${account.name} provider logo`} width={56} height={56} unoptimized className="max-h-full max-w-full object-contain" />
                </span>
              ) : (
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                  {account.account_type === "mobile_money" ? <Wallet className="h-7 w-7" aria-hidden="true" /> : <Landmark className="h-7 w-7" aria-hidden="true" />}
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-lg font-bold text-[#17385d] dark:text-white">{account.name}</p>
                <p className="mt-0.5 text-xs text-ledger-500 dark:text-ledger-400">{TYPE_LABELS[account.account_type] ?? account.account_type}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm text-[#31577c] dark:text-slate-200">{account.account_number || "Account number not provided"}</span>
                  {account.account_number && <CopyAccountNumberButton accountNumber={account.account_number} />}
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
                    <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Available
                  </span>
                </div>
              </div>
            </div>
            <div className="border-y border-blue-100 py-4 lg:border-y-0 lg:border-x lg:px-6 lg:py-1 dark:border-slate-700">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ledger-500 dark:text-ledger-400">Current balance</p>
              <p className="figure mt-1 text-3xl font-bold tracking-tight text-[#12345a] dark:text-white">{formatCurrency(Number(account.current_balance), context.currency)}</p>
              <p className="mt-1 text-[10px] text-ledger-500 dark:text-ledger-400">Selected account · {context.currency}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <div><p className="text-[10px] font-medium uppercase tracking-wide text-ledger-500 dark:text-ledger-400">Account type</p><p className="mt-1 text-sm font-semibold text-[#17385d] dark:text-white">{TYPE_LABELS[account.account_type] ?? account.account_type}</p></div>
              {account.account_type === "mobile_money" && <div><p className="text-[10px] font-medium uppercase tracking-wide text-ledger-500 dark:text-ledger-400">Provider</p><p className="mt-1 text-sm font-semibold text-[#17385d] dark:text-white">{account.name}</p></div>}
              <p className="rounded-xl bg-blue-50/80 p-3 text-xs leading-5 text-[#31577c] dark:bg-blue-500/10 dark:text-blue-200">Deposits, withdrawals and transfers are shown from this account’s recorded ledger.</p>
            </div>
          </div>
        </section>

        {statementError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{statementError}</div>}

        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2.4fr)_minmax(230px,0.65fr)]">
          <section className="account-statement-card min-w-0 rounded-2xl border border-[#dce8f2] bg-white shadow-sm dark:border-slate-500 dark:bg-ink-900">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5edf5] p-4 sm:p-5 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"><BarChart3 className="h-4 w-4" /></span>
                <div><h2 className="font-display text-base font-semibold text-[#17385d] dark:text-white">Transaction History</h2><p className="mt-0.5 text-[11px] text-ledger-500 dark:text-ledger-400">{statementPeriod} · {statementMatches.length} transaction(s)</p></div>
              </div>
              <AutoSubmitFilterForm action={`/banking/${account.id}`} className="account-statement-no-print flex flex-wrap gap-2">
                <input type="hidden" name="view" value="statement" />
                {dateFrom && <input type="hidden" name="from" value={dateFrom} />}
                {dateTo && <input type="hidden" name="to" value={dateTo} />}
                <label className="sr-only" htmlFor="statement-type-filter">Filter statement by transaction type</label>
                <select id="statement-type-filter" name="type" defaultValue={transactionType} className="h-9 rounded-lg border border-ledger-200 bg-white px-2 text-xs dark:border-slate-500 dark:bg-ink-950">
                  <option value="">All types</option><option value="income">Income</option><option value="debt_pay">Debt payment</option><option value="expense">Expense</option><option value="transfer">Transfer</option><option value="deposit">Other deposits</option>
                </select>
                <label className="sr-only" htmlFor="statement-branch-filter">Filter statement by branch</label>
                <select id="statement-branch-filter" name="location_id" defaultValue={selectedLocationId} className="h-9 rounded-lg border border-ledger-200 bg-white px-2 text-xs dark:border-slate-500 dark:bg-ink-950">
                  <option value="">All branches</option>
                  {branchOptions.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                  {!context.isBranchScoped && <option value="unassigned">Unassigned</option>}
                </select>
                <label className="sr-only" htmlFor="statement-description-filter">Search description or depositor</label>
                <input id="statement-description-filter" name="description" type="search" maxLength={100} defaultValue={description} placeholder="Search transactions" className="h-9 min-w-0 rounded-lg border border-ledger-200 px-3 text-xs dark:border-slate-500 dark:bg-ink-950 sm:w-40" />
                <Button type="submit" variant="outline" className="h-9 px-3 text-xs">Filter</Button>
              </AutoSubmitFilterForm>
            </div>
            <div className="grid gap-2 border-b border-[#e5edf5] bg-[#f6faff] p-3 sm:grid-cols-4 dark:border-slate-700 dark:bg-white/[0.02]">
              {[
                ["Opening balance", statement?.openingBalance ?? Number(account.opening_balance ?? 0)],
                ["Deposits", statement?.deposits ?? 0],
                ["Withdrawals", statement?.withdrawals ?? 0],
                ["Closing balance", statement?.closingBalance ?? Number(account.current_balance ?? 0)],
              ].map(([label, amount]) => <div key={String(label)} className="rounded-lg bg-white px-3 py-2 dark:bg-ink-900">
                <p className="text-[10px] text-ledger-500 dark:text-ledger-400">{label}</p><p className="mt-1 text-sm font-bold tabular-nums text-[#17385d] dark:text-white">{formatCurrency(Number(amount), context.currency)}</p>
              </div>)}
            </div>
            <p className="account-statement-no-print border-b border-[#e5edf5] px-4 py-2 text-[10px] text-ledger-500 dark:border-slate-700 dark:text-ledger-400">Branch, type and search filters narrow the on-screen list. Balances remain account-wide for reconciliation; print and downloads include transactions available to your branch access for the selected date range.</p>
            {!statementError && statementMatches.length === 0 ? (
              <div className="px-6 py-14 text-center">
                <span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"><FileText className="h-5 w-5" /></span>
                <h3 className="mt-3 text-sm font-semibold text-[#17385d] dark:text-white">No transactions in this statement</h3>
                <p className="mt-1 text-xs text-ledger-500 dark:text-ledger-400">{dateFrom || dateTo || transactionType || description || selectedLocationId ? "Try a wider date range or clear the additional filters." : "Transactions recorded for this account will appear here."}</p>
              </div>
            ) : !statementError ? (
              <>
                <div className="account-statement-no-print account-statement-table-wrap max-h-[min(70vh,48rem)] overflow-auto">
                  <table className="w-full min-w-[860px] text-left text-xs">
                    <thead className="sticky top-0 z-10 bg-[#f9fbfe] text-[10px] font-semibold uppercase tracking-wide text-ledger-500 shadow-sm dark:bg-ink-900 dark:text-ledger-400">
                      <tr><th className="px-4 py-3">Date and time</th><th className="px-4 py-3">Description</th><th className="px-4 py-3">Branch</th><th className="px-4 py-3">Type</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3 text-right">Balance</th></tr>
                    </thead>
                    <tbody className="divide-y divide-[#edf2f7] dark:divide-slate-700">
                      {visibleStatementRows.map((transaction) => {
                        const isTransfer = transaction.transaction_category === "transfer" || transaction.description?.startsWith("Transfer ");
                        const typeLabel = isTransfer ? "Transfer"
                          : transaction.transaction_category === "income" ? "Income"
                            : transaction.transaction_category === "debt_payment" ? "Debt payment"
                              : transaction.transaction_category === "expense" ? "Expense"
                                : transaction.type === "deposit" ? "Deposit" : "Withdrawal";
                        const dateTime = new Date(transaction.created_at);
                        const formattedTime = Number.isNaN(dateTime.getTime())
                          ? ""
                          : new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: statementTimeZone }).format(dateTime);
                        return <tr key={transaction.id} className="transition hover:bg-blue-50/40 dark:hover:bg-blue-500/[0.035]">
                          <td className="whitespace-nowrap px-4 py-3.5">
                            <span className="block font-medium text-[#17385d] dark:text-slate-200">{new Date(`${transaction.transaction_date}T00:00:00.000Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}</span>
                            <span className="mt-0.5 flex items-center gap-1 text-[10px] text-ledger-500 dark:text-ledger-400"><Clock3 className="h-3 w-3" />{formattedTime || "Time unavailable"}</span>
                          </td>
                          <td className="max-w-[280px] px-4 py-3.5">
                            <span className="block truncate font-medium text-[#17385d] dark:text-white">{transaction.description || typeLabel}</span>
                            {transaction.counterparty_name && <span className="mt-0.5 block truncate text-[10px] text-ledger-500 dark:text-ledger-400">{transaction.type === "deposit" ? "From" : "To"} {transaction.counterparty_name}</span>}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3.5 text-ledger-600 dark:text-ledger-300">
                            {transaction.location_id ? locationNames.get(transaction.location_id) ?? "Unassigned" : "Unassigned"}
                          </td>
                          <td className="px-4 py-3.5"><span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${isTransfer ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300" : transaction.type === "deposit" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"}`}>{typeLabel}</span></td>
                          <td className={`whitespace-nowrap px-4 py-3.5 text-right font-semibold tabular-nums ${isTransfer ? "text-blue-700 dark:text-blue-300" : transaction.type === "deposit" ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>
                            {transaction.type === "deposit" ? "+" : "−"}{formatCurrency(Number(transaction.amount), context.currency)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3.5 text-right font-medium tabular-nums text-[#17385d] dark:text-slate-200">{formatCurrency(transaction.runningBalance, context.currency)}</td>
                        </tr>;
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e5edf5] px-4 py-3 dark:border-slate-700">
                  <p className="text-[11px] text-ledger-500 dark:text-ledger-400">Showing {statementMatches.length ? (currentStatementPage - 1) * pageSize + 1 : 0}–{Math.min(currentStatementPage * pageSize, statementMatches.length)} of {statementMatches.length} transactions</p>
                          {statementPages > 1 && <nav aria-label="Statement pages" className="account-statement-no-print flex items-center gap-2">
                            <Link href={makeStatementHref(Math.max(1, currentStatementPage - 1))} aria-disabled={currentStatementPage <= 1} className={`rounded-lg border border-ledger-200 px-3 py-1.5 text-xs font-semibold dark:border-slate-500 ${currentStatementPage <= 1 ? "pointer-events-none opacity-40" : "hover:bg-ledger-50 dark:hover:bg-white/[0.06]"}`}>Previous</Link>
                            <span className="text-xs text-ledger-500 dark:text-ledger-400">{currentStatementPage} / {statementPages}</span>
                            <Link href={makeStatementHref(Math.min(statementPages, currentStatementPage + 1))} aria-disabled={currentStatementPage >= statementPages} className={`rounded-lg border border-ledger-200 px-3 py-1.5 text-xs font-semibold dark:border-slate-500 ${currentStatementPage >= statementPages ? "pointer-events-none opacity-40" : "hover:bg-ledger-50 dark:hover:bg-white/[0.06]"}`}>Next</Link>
                  </nav>}
                </div>
              </>
            ) : null}
            {!statementError && <div className="account-statement-print-only hidden">
              <h2 className="mb-1 text-lg font-bold">{context.orgName} · Account Statement</h2>
              <p className="mb-3 text-xs">{account.name} · {account.account_number || "Account number not provided"} · {statementPeriod}</p>
              <table className="w-full border-collapse text-[10px]">
                <thead><tr className="border-b border-slate-300 text-left"><th className="px-2 py-2">Date</th><th className="px-2 py-2">Description</th><th className="px-2 py-2">Counterparty</th><th className="px-2 py-2">Branch</th><th className="px-2 py-2">Type</th><th className="px-2 py-2 text-right">Amount</th><th className="px-2 py-2 text-right">Running balance</th></tr></thead>
                <tbody>{statementDownloadRows.map((transaction, index) => <tr key={`${transaction.date}-${index}`} className="border-b border-slate-100">
                  <td className="px-2 py-2">{transaction.date}</td><td className="px-2 py-2">{transaction.description}</td><td className="px-2 py-2">{transaction.counterparty}</td><td className="px-2 py-2">{transaction.branch}</td><td className="px-2 py-2">{transaction.type}</td>
                  <td className="px-2 py-2 text-right">{transaction.amount > 0 ? "+" : ""}{formatCurrency(transaction.amount, context.currency)}</td><td className="px-2 py-2 text-right">{formatCurrency(transaction.runningBalance, context.currency)}</td>
                </tr>)}</tbody>
              </table>
            </div>}
          </section>

          <aside className="account-statement-no-print space-y-3">
            <section className="account-statement-card rounded-xl border border-[#dce8f2] bg-white p-3 shadow-sm dark:border-slate-500 dark:bg-ink-900">
              <div className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"><ArrowUpRight className="h-3.5 w-3.5" /></span><h2 className="font-display text-sm font-semibold text-[#17385d] dark:text-white">Quick Actions</h2></div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {canAddAccount && <AddAccountDialog trigger="quick-action" />}
                {canTransfer && <Link href={transferHref} className="rounded-lg border border-ledger-100 p-2 transition hover:border-blue-200 hover:bg-blue-50/50 dark:border-slate-500 dark:hover:bg-blue-500/5">
                  <span className="grid h-7 w-7 place-items-center rounded-md bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"><ArrowLeftRight className="h-3.5 w-3.5" /></span>
                  <span className="mt-1.5 block text-[11px] font-semibold text-[#17385d] dark:text-white">Transfer Money</span><span className="mt-0.5 block text-[9px] text-ledger-500 dark:text-ledger-400">Move between accounts</span>
                </Link>}
                <Link href={viewTransactionsHref} className="rounded-lg border border-ledger-100 p-2 transition hover:border-blue-200 hover:bg-blue-50/50 dark:border-slate-500 dark:hover:bg-blue-500/5">
                  <span className="grid h-7 w-7 place-items-center rounded-md bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"><FileText className="h-3.5 w-3.5" /></span>
                  <span className="mt-1.5 block text-[11px] font-semibold text-[#17385d] dark:text-white">View Statements</span><span className="mt-0.5 block text-[9px] text-ledger-500 dark:text-ledger-400">Browse account transactions</span>
                </Link>
                <Link href="/banking#accounts" className="rounded-lg border border-ledger-100 p-2 transition hover:border-blue-200 hover:bg-blue-50/50 dark:border-slate-500 dark:hover:bg-blue-500/5">
                  <span className="grid h-7 w-7 place-items-center rounded-md bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"><Landmark className="h-3.5 w-3.5" /></span>
                  <span className="mt-1.5 block text-[11px] font-semibold text-[#17385d] dark:text-white">Manage Accounts</span><span className="mt-0.5 block text-[9px] text-ledger-500 dark:text-ledger-400">{canManage ? "Edit and review accounts" : "View all accounts"}</span>
                </Link>
              </div>
            </section>
            <section className="account-statement-card rounded-xl border border-[#dce8f2] bg-white p-3 shadow-sm dark:border-slate-500 dark:bg-ink-900">
              <div className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"><BarChart3 className="h-3.5 w-3.5" /></span><h2 className="font-display text-sm font-semibold text-[#17385d] dark:text-white">Account Summary</h2></div>
              {accountCountError ? <p role="alert" className="mt-3 text-xs text-red-700">Account totals could not be loaded: {accountCountError}</p> : <>
                <div className="mt-4 rounded-xl bg-[#f1f7fd] p-3 dark:bg-white/[0.03]"><p className="text-[10px] text-ledger-500 dark:text-ledger-400">Total organization balance</p><p className="mt-1 text-xl font-bold text-[#17385d] dark:text-white">{formatCurrency((organizationAccounts ?? []).reduce((sum, row) => sum + Number(row.current_balance ?? 0), 0), context.currency)}</p></div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-ledger-100 p-3 dark:border-slate-700"><p className="text-[10px] text-ledger-500 dark:text-ledger-400">Bank accounts</p><p className="mt-1 text-lg font-bold text-[#17385d] dark:text-white">{(organizationAccounts ?? []).filter((row) => row.account_type !== "mobile_money").length}</p></div>
                  <div className="rounded-xl border border-ledger-100 p-3 dark:border-slate-700"><p className="text-[10px] text-ledger-500 dark:text-ledger-400">Mobile money</p><p className="mt-1 text-lg font-bold text-[#17385d] dark:text-white">{(organizationAccounts ?? []).filter((row) => row.account_type === "mobile_money").length}</p></div>
                </div>
                <p className="mt-3 text-[10px] leading-4 text-ledger-500 dark:text-ledger-400">Selected account balance: <strong className="text-[#17385d] dark:text-white">{formatCurrency(Number(account.current_balance), context.currency)}</strong></p>
              </>}
            </section>
            {canManage && <Link href={`/banking/${account.id}`} className="account-statement-no-print inline-flex items-center gap-2 rounded-lg border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 dark:border-blue-900 dark:text-blue-300"><ArrowUpRight className="h-3.5 w-3.5" />Record deposit / withdrawal</Link>}
          </aside>
        </div>
      </main>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-6">
      <div>
        <Link href="/banking" className="inline-flex items-center gap-1 text-sm text-ledger-500 hover:text-ink-900 dark:hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to banking
        </Link>
        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-ledger-400">
          {TYPE_LABELS[account.account_type] ?? account.account_type}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-semibold text-ink-900 dark:text-white">
            {isStatementView ? `${account.name} Statement` : account.name}
          </h1>
          {isStatementView && canManage && (
            <Link href={`/banking/${account.id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              Record deposit / withdrawal
            </Link>
          )}
        </div>
        {account.account_number && <p className="mt-1 font-mono text-sm text-ledger-500 dark:text-ledger-400">{account.account_number}</p>}
        <p className="figure mt-1 text-3xl font-semibold text-ink-900 dark:text-white">
          {formatCurrency(account.current_balance, context.currency)}
        </p>
      </div>

      {canManage && !isStatementView && (
        <form
          action={boundRecord}
          className="flex flex-wrap items-end gap-3 rounded-card border border-ledger-100 bg-white p-4 shadow-card dark:border-slate-500 dark:bg-ink-900"
        >
          {resolvedSearchParams.error && (
            <p className="w-full rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">{resolvedSearchParams.error}</p>
          )}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-ledger-700 dark:text-ledger-200">Type</label>
            <select
              name="type"
              defaultValue="deposit"
              className="h-10 rounded-md border border-ledger-200 bg-white px-3 text-sm dark:border-slate-500 dark:bg-ink-900 dark:text-white"
            >
              <option value="deposit">Deposit</option>
              <option value="withdrawal">Withdrawal</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-ledger-700 dark:text-ledger-200">Amount</label>
            <Input name="amount" type="number" step="0.01" min="0.01" required className="w-32" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-ledger-700 dark:text-ledger-200">Date</label>
            <Input name="transaction_date" type="date" defaultValue={today} required />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="transaction-branch" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">Branch</label>
            <select
              id="transaction-branch"
              name="location_id"
              defaultValue={context.locationId ?? ""}
              required={context.isBranchScoped}
              className="h-10 rounded-md border border-ledger-200 bg-white px-3 text-sm dark:border-slate-500 dark:bg-ink-900 dark:text-white"
            >
              <option value="">Unassigned</option>
              {branchOptions.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
          </div>
          <div className="flex-1 space-y-1.5">
            <label className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
              Note <span className="font-normal text-ledger-400">(optional)</span>
            </label>
            <Input name="description" placeholder="What was this for?" />
          </div>
          <Button type="submit">Record</Button>
        </form>
      )}

      {isStatementView && (
        <form action={`/banking/${account.id}`} method="get" className="grid gap-3 rounded-card border border-ledger-100 bg-white p-4 shadow-card sm:grid-cols-2 lg:grid-cols-5 dark:border-slate-500 dark:bg-ink-900">
          <input type="hidden" name="view" value="statement" />
          <label className="sr-only" htmlFor="statement-type-filter">Filter statement by transaction type</label>
          <select id="statement-type-filter" name="type" defaultValue={transactionType} className="h-10 rounded-md border border-ledger-200 bg-white px-3 text-sm dark:border-slate-500 dark:bg-ink-900 dark:text-white">
            <option value="">All transaction types</option>
            <option value="income">Income</option>
            <option value="debt_pay">Debt Pay</option>
            <option value="expense">Expense</option>
            <option value="transfer">Transfer</option>
            <option value="deposit">Other deposits</option>
          </select>
          <label className="flex items-center gap-2 text-xs text-ledger-500 dark:text-ledger-400">
            From
            <input name="from" type="date" defaultValue={dateFrom} className="h-10 min-w-0 flex-1 rounded-md border border-ledger-200 bg-white px-2 text-sm dark:border-slate-500 dark:bg-ink-900 dark:text-white" />
          </label>
          <label className="flex items-center gap-2 text-xs text-ledger-500 dark:text-ledger-400">
            To
            <input name="to" type="date" min={dateFrom || undefined} defaultValue={dateTo} className="h-10 min-w-0 flex-1 rounded-md border border-ledger-200 bg-white px-2 text-sm dark:border-slate-500 dark:bg-ink-900 dark:text-white" />
          </label>
          <label className="sr-only" htmlFor="statement-description-filter">Search description or depositor</label>
          <input id="statement-description-filter" name="description" type="search" maxLength={100} defaultValue={description} placeholder="Description or depositor" className="h-10 min-w-0 rounded-md border border-ledger-200 bg-white px-3 text-sm dark:border-slate-500 dark:bg-ink-900 dark:text-white" />
          <div className="flex items-center justify-between gap-2">
            <Button type="submit">Filter</Button>
            <Link href={`/banking/${account.id}?view=statement`} className="text-xs font-semibold text-blue-700 hover:underline dark:text-blue-300">Clear</Link>
          </div>
        </form>
      )}

      {!transactions || transactions.length === 0 ? (
        <div className="rounded-card border border-dashed border-ledger-200 bg-white p-10 text-center dark:border-slate-500 dark:bg-ink-900">
          <p className="text-sm text-ledger-500 dark:text-ledger-400">{isStatementView && (transactionType || dateFrom || dateTo || description) ? "No transactions match these filters." : "No transactions yet."}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-ledger-100 bg-white shadow-card dark:border-slate-500 dark:bg-ink-900">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-ledger-100 text-left text-xs font-medium uppercase tracking-wide text-ledger-400 dark:border-slate-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Description / Deposited by</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id} className="border-b border-ledger-50 last:border-0 dark:border-slate-600">
                  <td className="px-4 py-3 text-ledger-500 dark:text-ledger-400">
                    {new Date(tx.transaction_date).toLocaleDateString()}
                  </td>
                  <td className="max-w-[360px] px-4 py-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${tx.type === "deposit" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300"}`}>
                        {tx.type === "deposit" ? <ArrowUp className="h-4 w-4" aria-hidden="true" /> : <ArrowDown className="h-4 w-4" aria-hidden="true" />}
                      </span>
                      <div className="min-w-0">
                        <span className="block truncate font-medium text-ink-900 dark:text-white">{tx.description ?? (tx.type === "deposit" ? "Deposit" : "Withdrawal")}</span>
                        {tx.counterparty_name && <span className="mt-0.5 block truncate text-xs text-ledger-500 dark:text-ledger-400">{tx.type === "deposit" ? "From" : "To"} {tx.counterparty_name}</span>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      tx.transaction_category === "income"
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                        : tx.transaction_category === "debt_payment"
                          ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"
                          : tx.transaction_category === "expense"
                            ? "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
                            : (tx.transaction_category === "transfer" || tx.description?.startsWith("Transfer "))
                              ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"
                              : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    }`}>
                      {tx.transaction_category === "income" ? "Income"
                        : tx.transaction_category === "debt_payment" ? "Debt Pay"
                          : tx.transaction_category === "expense" ? "Expense"
                            : (tx.transaction_category === "transfer" || tx.description?.startsWith("Transfer ")) ? "Transfer"
                              : tx.type === "deposit" ? "Deposit" : "Withdrawal"}
                    </span>
                  </td>
                  <td className={`px-4 py-3 text-right figure ${tx.type === "deposit" ? "text-signal" : "text-alert"}`}>
                    {tx.type === "deposit" ? "+" : "−"}{formatCurrency(tx.amount, context.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
      {isStatementView && statementPages > 1 && (
        <nav aria-label="Statement pages" className="flex items-center justify-between">
          <span className="text-xs text-ledger-500 dark:text-ledger-400">Page {statementPage} of {statementPages}</span>
          <div className="flex gap-2">
            <Link href={makeStatementHref(Math.max(1, statementPage - 1))} aria-disabled={statementPage <= 1} className={`rounded-lg border border-ledger-200 px-3 py-1.5 text-xs font-semibold dark:border-slate-500 ${statementPage <= 1 ? "pointer-events-none opacity-40" : "hover:bg-ledger-50 dark:hover:bg-white/[0.06]"}`}>Previous</Link>
            <Link href={makeStatementHref(Math.min(statementPages, statementPage + 1))} aria-disabled={statementPage >= statementPages} className={`rounded-lg border border-ledger-200 px-3 py-1.5 text-xs font-semibold dark:border-slate-500 ${statementPage >= statementPages ? "pointer-events-none opacity-40" : "hover:bg-ledger-50 dark:hover:bg-white/[0.06]"}`}>Next</Link>
          </div>
        </nav>
      )}
    </div>
  );
}
