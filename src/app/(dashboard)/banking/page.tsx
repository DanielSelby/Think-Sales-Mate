import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Landmark } from "lucide-react";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { canPermission } from "@/lib/rbac/permissions";
import { formatCurrency } from "@/lib/sales/format";
import { AddAccountDialog } from "@/components/banking/add-account-dialog";
import { AccountsTable, type AccountRow } from "@/components/banking/accounts-table";
import { BankingOverview, type BankingTransactionFilters, type BankingTransactionRow } from "@/components/banking/banking-overview";

function validISODate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : "";
}

export default async function BankingPage({
  searchParams,
}: {
  searchParams: Promise<{
    transactionsPage?: string;
    transfer?: string;
    accountCreated?: string;
    accountId?: string;
    type?: string;
    from?: string;
    to?: string;
    description?: string;
  }>;
}) {
  const query = await searchParams;
  const parsedPage = Number.parseInt(query.transactionsPage ?? "1", 10);
  const transactionPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const pageSize = 8;
  const from = (transactionPage - 1) * pageSize;
  const transactionType = query.type === "deposit" || query.type === "withdrawal" || query.type === "transfer"
    ? query.type
    : "";
  const dateFrom = validISODate(query.from);
  const dateToValue = validISODate(query.to);
  const dateTo = dateFrom && dateToValue && dateToValue < dateFrom ? "" : dateToValue;
  const description = (query.description ?? "").trim().slice(0, 100);
  const activeOrgId = await (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  if (!can(context.role, "banking.view")) {
    return (
      <div className="mx-auto max-w-2xl rounded-card border border-dashed border-ledger-200 bg-white p-10 text-center dark:border-ledger-700 dark:bg-ink-900">
        <p className="text-sm text-ledger-500 dark:text-ledger-400">Banking is restricted to managers and above.</p>
      </div>
    );
  }

  const supabase = await createClient();
  const accountsResult = await supabase
    .from("bank_accounts")
    .select("id, name, account_type, account_number, logo_url, current_balance")
    .eq("org_id", context.orgId)
    .order("name");
  if (accountsResult.error) throw new Error(`Bank accounts could not be loaded: ${accountsResult.error.message}`);

  const accounts: AccountRow[] = (accountsResult.data ?? []).map((account) => ({
    id: account.id,
    name: account.name,
    accountType: account.account_type,
    accountNumber: account.account_number ?? null,
    logoUrl: account.logo_url ?? null,
    currentBalance: Number(account.current_balance ?? 0),
  }));
  const accountNames = new Map(accounts.map((account) => [account.id, account.name]));
  const selectedAccountId = query.accountId && accountNames.has(query.accountId) ? query.accountId : "";
  let transactionsQuery = supabase
    .from("bank_transactions")
    .select("id, account_id, type, amount, description, transaction_date", { count: "exact" })
    .eq("org_id", context.orgId)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (selectedAccountId) transactionsQuery = transactionsQuery.eq("account_id", selectedAccountId);
  if (transactionType === "transfer") transactionsQuery = transactionsQuery.ilike("description", "Transfer %");
  else if (transactionType) transactionsQuery = transactionsQuery.eq("type", transactionType);
  if (dateFrom) transactionsQuery = transactionsQuery.gte("transaction_date", dateFrom);
  if (dateTo) transactionsQuery = transactionsQuery.lte("transaction_date", dateTo);
  if (description) transactionsQuery = transactionsQuery.ilike("description", `%${description}%`);
  const transactionsResult = await transactionsQuery.range(from, from + pageSize - 1);
  if (transactionsResult.error) throw new Error(`Bank transactions could not be loaded: ${transactionsResult.error.message}`);

  const transactions: BankingTransactionRow[] = (transactionsResult.data ?? [])
    .filter((transaction) => accountNames.has(transaction.account_id))
    .map((transaction) => ({
      id: transaction.id,
      type: transaction.type,
      amount: transaction.amount,
      formattedAmount: formatCurrency(transaction.amount, context.currency),
      description: transaction.description,
      transactionDate: transaction.transaction_date,
      accountName: accountNames.get(transaction.account_id)!,
    }));
  const transactionPages = Math.max(1, Math.ceil((transactionsResult.count ?? 0) / pageSize));
  const transactionFilters: BankingTransactionFilters = {
    accountId: selectedAccountId,
    type: transactionType,
    from: dateFrom,
    to: dateTo,
    description,
  };
  if (transactionPage > transactionPages) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(transactionFilters)) {
      if (value) params.set(key, value);
    }
    params.set("transactionsPage", String(transactionPages));
    redirect(`/banking?${params.toString()}#recent-transactions`);
  }

  const hasManageRole = can(context.role, "banking.manage");
  const [canManage, canAddAccount] = hasManageRole
    ? await Promise.all([
      canPermission("banking", "edit"),
      canPermission("banking", "create"),
    ])
    : [false, false];
  const canDeleteAccount = hasManageRole && await canPermission("banking", "delete");
  const totalBalance = accounts.reduce((sum, account) => sum + account.currentBalance, 0);

  return (
    <main className="mx-auto max-w-7xl space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
              <Landmark className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight text-ink-900 dark:text-white">Bank Accounts</h1>
              <p className="mt-1 text-sm text-ledger-500 dark:text-ledger-400">
                Manage your bank accounts, track balances and view your transaction history.
              </p>
            </div>
          </div>
        </div>
        {canAddAccount && <AddAccountDialog />}
      </header>

      {query.accountCreated === "1" && (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
          Bank account added successfully.
        </p>
      )}

      <AccountsTable accounts={accounts} canEdit={canManage} canDelete={canDeleteAccount} currency={context.currency} />

      <BankingOverview
        accounts={accounts}
        transactions={transactions}
        currency={context.currency}
        canAddAccount={canAddAccount}
        canTransfer={canManage}
        totalBalance={totalBalance}
        today={new Date().toISOString().slice(0, 10)}
        transactionPage={Math.min(transactionPage, transactionPages)}
        transactionPages={transactionPages}
        transactionFilters={transactionFilters}
        initialTransferOpen={query.transfer === "1"}
      />
    </main>
  );
}
