import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpRight } from "lucide-react";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { formatCurrency } from "@/lib/sales/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { recordTransaction } from "@/app/(dashboard)/banking/actions";

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
  searchParams: Promise<{ error?: string; view?: string; type?: string; from?: string; to?: string; description?: string; page?: string }>;
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
  const pageValue = Number.parseInt(resolvedSearchParams.page ?? "1", 10);
  const statementPage = Number.isFinite(pageValue) && pageValue > 0 ? pageValue : 1;
  const pageSize = 20;
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context || !can(context.role, "banking.view")) return null;

  const supabase = await createClient();
  const { data: account } = await supabase
    .from("bank_accounts")
    .select("id, name, account_type, account_number, current_balance")
    .eq("id", id)
    .eq("org_id", context.orgId)
    .single();

  if (!account) notFound();

  let transactionsQuery = supabase
    .from("bank_transactions")
    .select("id, type, amount, description, counterparty_name, transaction_category, transaction_date", { count: "exact" })
    .eq("account_id", account.id)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (transactionType === "income") transactionsQuery = transactionsQuery.eq("transaction_category", "income");
  else if (transactionType === "debt_pay") transactionsQuery = transactionsQuery.eq("transaction_category", "debt_payment");
  else if (transactionType === "expense") transactionsQuery = transactionsQuery.eq("transaction_category", "expense");
  else if (transactionType === "transfer") transactionsQuery = transactionsQuery.ilike("description", "Transfer %");
  else if (transactionType === "deposit") transactionsQuery = transactionsQuery.eq("type", "deposit").is("transaction_category", null);
  if (dateFrom) transactionsQuery = transactionsQuery.gte("transaction_date", dateFrom);
  if (dateTo) transactionsQuery = transactionsQuery.lte("transaction_date", dateTo);
  if (description) {
    const safeSearch = description.replace(/[^a-zA-Z0-9\s-]/g, " ");
    transactionsQuery = transactionsQuery.or(`description.ilike.%${safeSearch}%,counterparty_name.ilike.%${safeSearch}%`);
  }
  if (isStatementView) transactionsQuery = transactionsQuery.range((statementPage - 1) * pageSize, statementPage * pageSize - 1);
  const { data: transactionRows, count: transactionCount, error: transactionsError } = await transactionsQuery;
  if (transactionsError) throw new Error(`Bank account transactions could not be loaded: ${transactionsError.message}`);
  const transactions = transactionRows ?? [];
  const statementPages = Math.max(1, Math.ceil((transactionCount ?? 0) / pageSize));
  const makeStatementHref = (page: number) => {
    const query = new URLSearchParams({ view: "statement", page: String(page) });
    if (transactionType) query.set("type", transactionType);
    if (dateFrom) query.set("from", dateFrom);
    if (dateTo) query.set("to", dateTo);
    if (description) query.set("description", description);
    return `/banking/${account.id}?${query.toString()}`;
  };

  const canManage = can(context.role, "banking.manage");
  const boundRecord = recordTransaction.bind(null, account.id);
  const today = new Date().toISOString().slice(0, 10);

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
                        {tx.counterparty_name && <span className="mt-0.5 block truncate text-xs text-ledger-500 dark:text-ledger-400">From {tx.counterparty_name}</span>}
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
