import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Landmark } from "lucide-react";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { canTabPermission } from "@/lib/rbac/permissions";
import { formatCurrency } from "@/lib/sales/format";
import { normalizeBankTransactionSearch } from "@/lib/banking/transaction-search";
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
    tab?: string;
    transactionsPage?: string;
    transactionsPageSize?: string;
    transfer?: string;
    accountCreated?: string;
    accountId?: string;
    location_id?: string;
    type?: string;
    from?: string;
    to?: string;
    description?: string;
  }>;
}) {
  const query = await searchParams;
  const requestedTab = ["accounts", "transactions", "reconciliation"].includes(query.tab ?? "")
    ? query.tab as "accounts" | "transactions" | "reconciliation"
    : null;
  const parsedPage = Number.parseInt(query.transactionsPage ?? "1", 10);
  const transactionPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const transactionPageSize = ["10", "50", "100", "all"].includes(query.transactionsPageSize ?? "")
    ? query.transactionsPageSize ?? "10"
    : "10";
  const pageSize = transactionPageSize === "all" ? null : Number(transactionPageSize);
  const from = pageSize === null ? 0 : (transactionPage - 1) * pageSize;
  const transactionType = ["income", "debt_pay", "expense", "transfer", "deposit"].includes(query.type ?? "")
    ? query.type ?? ""
    : "";
  const dateFrom = validISODate(query.from);
  const dateToValue = validISODate(query.to);
  const dateTo = dateFrom && dateToValue && dateToValue < dateFrom ? "" : dateToValue;
  const description = (query.description ?? "").trim().slice(0, 100);
  const searchText = normalizeBankTransactionSearch(description);
  const activeOrgId = await (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  if (!can(context.role, "banking.view")) {
    return (
      <div className="mx-auto max-w-2xl rounded-card border border-dashed border-ledger-200 bg-white p-10 text-center dark:border-slate-700/80 dark:bg-ink-900">
        <p className="text-sm text-ledger-500 dark:text-ledger-400">Banking is restricted to managers and above.</p>
      </div>
    );
  }
  const bankingTabs = [
    { key: "accounts", label: "Accounts" },
    { key: "transactions", label: "Transactions" },
    { key: "reconciliation", label: "Reconciliation" },
  ] as const;
  const visibleTabs = (await Promise.all(bankingTabs.map(async (tab) => ({
    ...tab,
    visible: await canTabPermission("banking", "banking", tab.key, "view"),
  })))).filter((tab) => tab.visible);
  const activeTab = requestedTab ?? visibleTabs[0]?.key;
  if (!activeTab || (requestedTab && !visibleTabs.some((tab) => tab.key === requestedTab))) {
    return (
      <div role="alert" className="mx-auto max-w-2xl rounded-card border border-dashed border-ledger-200 bg-white p-10 text-center dark:border-slate-700/80 dark:bg-ink-900">
        <p className="text-sm text-ledger-500 dark:text-ledger-400">You don’t have access to this Banking tab.</p>
      </div>
    );
  }

  const supabase = await createClient();
  const [accountsResult, settingsResult, locationsResult] = await Promise.all([
    supabase
      .from("bank_accounts")
      .select("id, name, account_type, account_number, logo_url, current_balance")
      .eq("org_id", context.orgId)
      .order("name"),
    supabase.from("org_general_settings").select("timezone").eq("org_id", context.orgId).maybeSingle(),
    supabase.from("business_locations").select("id, name").eq("org_id", context.orgId).order("name"),
  ]);
  if (accountsResult.error) throw new Error(`Bank accounts could not be loaded: ${accountsResult.error.message}`);
  if (settingsResult.error) throw new Error(`Organization timezone could not be loaded: ${settingsResult.error.message}`);
  if (locationsResult.error) throw new Error(`Branches could not be loaded: ${locationsResult.error.message}`);
  const organizationTimeZone = settingsResult.data?.timezone || "UTC";
  const branchOptions = (locationsResult.data ?? []).filter((location) =>
    !context.isBranchScoped || context.allowedLocationIds.includes(location.id)
  );
  const branchNames = new Map(branchOptions.map((location) => [location.id, location.name]));
  const requestedLocationId = query.location_id ?? "";
  const selectedLocationId = requestedLocationId === "unassigned" && !context.isBranchScoped
    ? requestedLocationId
    : branchOptions.some((location) => location.id === requestedLocationId) ? requestedLocationId : "";

  const trendAsOf = new Date();
  const trendAsOfDate = trendAsOf.toISOString().slice(0, 10);
  const monthStartDate = new Date(Date.UTC(trendAsOf.getUTCFullYear(), trendAsOf.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const yearStartDate = new Date(trendAsOf);
  yearStartDate.setUTCFullYear(yearStartDate.getUTCFullYear() - 1);
  const trendYearStartDate = yearStartDate.toISOString().slice(0, 10);
  const trendsResult = await supabase.rpc("get_bank_account_trend_changes", {
    p_org_id: context.orgId,
    p_month_start: monthStartDate,
    p_year_start: trendYearStartDate,
    p_as_of: trendAsOfDate,
  });
  if (trendsResult.error) throw new Error(`Bank account trends could not be loaded: ${trendsResult.error.message}`);
  const accountTrends = new Map((trendsResult.data ?? []).map((trend) => [
    trend.account_id,
    { monthChange: Number(trend.month_change ?? 0), yearChange: Number(trend.year_change ?? 0) },
  ]));

  const accounts: AccountRow[] = (accountsResult.data ?? []).map((account) => ({
    id: account.id,
    name: account.name,
    accountType: account.account_type,
    accountNumber: account.account_number ?? null,
    logoUrl: account.logo_url ?? null,
    currentBalance: Number(account.current_balance ?? 0),
    monthChange: accountTrends.get(account.id)?.monthChange ?? 0,
    yearChange: accountTrends.get(account.id)?.yearChange ?? 0,
  }));
  const accountNames = new Map(accounts.map((account) => [account.id, account.name]));
  const selectedAccountId = query.accountId && accountNames.has(query.accountId) ? query.accountId : "";
  const createTransactionsQuery = () => {
    let transactionsQuery = supabase
      .from("bank_transactions")
      .select("id, account_id, type, amount, description, counterparty_name, transaction_category, transaction_date, created_at, recorded_by, location_id", { count: "exact" })
      .eq("org_id", context.orgId)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    if (context.isBranchScoped) {
      transactionsQuery = context.allowedLocationIds.length
        ? transactionsQuery.in("location_id", context.allowedLocationIds)
        : transactionsQuery.eq("location_id", "00000000-0000-0000-0000-000000000000");
    }
    if (selectedLocationId === "unassigned") transactionsQuery = transactionsQuery.is("location_id", null);
    else if (selectedLocationId) transactionsQuery = transactionsQuery.eq("location_id", selectedLocationId);
    if (selectedAccountId) transactionsQuery = transactionsQuery.eq("account_id", selectedAccountId);
    if (transactionType === "income") transactionsQuery = transactionsQuery.eq("transaction_category", "income");
    else if (transactionType === "debt_pay") transactionsQuery = transactionsQuery.eq("transaction_category", "debt_payment");
    else if (transactionType === "expense") transactionsQuery = transactionsQuery.eq("transaction_category", "expense");
    else if (transactionType === "transfer") transactionsQuery = transactionsQuery.or("transaction_category.eq.transfer,description.ilike.Transfer %");
    else if (transactionType === "deposit") {
      transactionsQuery = transactionsQuery.eq("type", "deposit").is("transaction_category", null);
    }
    if (dateFrom) transactionsQuery = transactionsQuery.gte("transaction_date", dateFrom);
    if (dateTo) transactionsQuery = transactionsQuery.lte("transaction_date", dateTo);
    if (description && !searchText) {
      transactionsQuery = transactionsQuery.eq("id", "00000000-0000-0000-0000-000000000000");
    } else if (searchText) {
      transactionsQuery = transactionsQuery.or(`description.ilike.%${searchText}%,counterparty_name.ilike.%${searchText}%`);
    }
    return transactionsQuery;
  };
  const batchSize = 500;
  const transactionsResult = await createTransactionsQuery().range(
    pageSize === null ? 0 : from,
    pageSize === null ? batchSize - 1 : from + pageSize - 1
  );
  if (transactionsResult.error) throw new Error(`Bank transactions could not be loaded: ${transactionsResult.error.message}`);
  const transactionCount = transactionsResult.count ?? 0;
  const transactionData = transactionsResult.data ?? [];
  if (pageSize === null) {
    for (let offset = batchSize; offset < transactionCount; offset += batchSize) {
      const batch = await createTransactionsQuery().range(offset, offset + batchSize - 1);
      if (batch.error) throw new Error(`Bank transactions could not be loaded: ${batch.error.message}`);
      transactionData.push(...(batch.data ?? []));
    }
  }

  const recorderIds = [...new Set(transactionData.map((transaction) => transaction.recorded_by).filter(Boolean))];
  const { data: members, error: membersError } = recorderIds.length
    ? await supabase
      .from("organization_members")
      .select("user_id, username, contact_email")
      .eq("org_id", context.orgId)
      .in("user_id", recorderIds)
    : { data: [], error: null };
  if (membersError) throw new Error(`Transaction users could not be loaded: ${membersError.message}`);
  const { data: profiles, error: profilesError } = recorderIds.length
    ? await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", recorderIds)
    : { data: [], error: null };
  if (profilesError) throw new Error(`Transaction user names could not be loaded: ${profilesError.message}`);
  const profileNames = new Map<string, string>();
  for (const profile of profiles ?? []) {
    const fullName = profile.full_name?.trim();
    if (fullName) profileNames.set(profile.id, fullName);
  }
  const recorderNames = new Map((members ?? [])
    .map((member) => [
      member.user_id,
      profileNames.get(member.user_id ?? "")
        || member.username?.trim()
        || member.contact_email?.trim()
        || "Unknown user",
    ] as const)
    .filter((entry): entry is readonly [string, string] => Boolean(entry[0])));

  const transactions: BankingTransactionRow[] = transactionData
    .filter((transaction) => accountNames.has(transaction.account_id))
    .map((transaction) => ({
      id: transaction.id,
      type: transaction.type,
      amount: transaction.amount,
      formattedAmount: formatCurrency(transaction.amount, context.currency),
      description: transaction.description,
      counterpartyName: transaction.counterparty_name,
      recordedBy: recorderNames.get(transaction.recorded_by) ?? "Unknown user",
      category: transaction.transaction_category,
      transactionDate: transaction.transaction_date,
      createdAt: transaction.created_at,
      accountName: accountNames.get(transaction.account_id)!,
      locationId: transaction.location_id,
      locationName: transaction.location_id ? branchNames.get(transaction.location_id) ?? null : null,
    }));
  const transactionPages = pageSize === null ? 1 : Math.max(1, Math.ceil(transactionCount / pageSize));
  const transactionFilters: BankingTransactionFilters = {
    accountId: selectedAccountId,
    locationId: selectedLocationId,
    type: transactionType,
    from: dateFrom,
    to: dateTo,
    description,
  };
  if (transactionPage > transactionPages) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(transactionFilters)) {
      if (key === "locationId") continue;
      if (value) params.set(key, value);
    }
    if (transactionFilters.locationId) params.set("location_id", transactionFilters.locationId);
    params.set("tab", activeTab);
    params.set("transactionsPage", String(transactionPages));
    params.set("transactionsPageSize", transactionPageSize);
    redirect(`/banking?${params.toString()}#recent-transactions`);
  }

  const [canManage, canAddAccount, canDeleteAccount, canTransfer, canViewTransactions] = await Promise.all([
    canTabPermission("banking", "banking", "accounts", "edit"),
    canTabPermission("banking", "banking", "accounts", "create"),
    canTabPermission("banking", "banking", "accounts", "delete"),
    canTabPermission("banking", "banking", "transactions", "create"),
    canTabPermission("banking", "banking", "transactions", "view"),
  ]);
  const totalBalance = accounts.reduce((sum, account) => sum + account.currentBalance, 0);

  return (
    <main className="banking-page w-full min-w-0 space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
              <Landmark className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight text-ink-900 dark:text-white">
                {activeTab === "accounts" ? "Bank Accounts" : activeTab === "transactions" ? "Bank Transactions" : "Bank Reconciliation"}
              </h1>
              <p className="mt-1 text-sm text-ledger-500 dark:text-ledger-400">
                {activeTab === "accounts"
                  ? "Manage your bank accounts and track balances."
                  : activeTab === "transactions"
                    ? "Review and filter transactions across your bank accounts."
                    : "Choose an account to review its statement and transaction balance."}
              </p>
            </div>
          </div>
        </div>
        {activeTab === "accounts" && canAddAccount && <AddAccountDialog />}
      </header>

      <nav aria-label="Banking sections" className="flex flex-wrap gap-2 border-b border-ledger-100 pb-3 dark:border-slate-700">
        {visibleTabs.map((tab) => (
          <Link
            key={tab.key}
            href={`/banking?tab=${tab.key}`}
            aria-current={activeTab === tab.key ? "page" : undefined}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${activeTab === tab.key
              ? "bg-blue-600 text-white"
              : "text-ledger-600 hover:bg-ledger-50 dark:text-ledger-300 dark:hover:bg-white/[0.06]"}`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {query.accountCreated === "1" && (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
          Bank account added successfully.
        </p>
      )}

      {(activeTab === "accounts" || activeTab === "reconciliation") && (
        <AccountsTable
          accounts={accounts}
          canEdit={activeTab === "accounts" && canManage}
          canDelete={activeTab === "accounts" && canDeleteAccount}
          canTransact={canTransfer && canViewTransactions}
          canViewStatements={visibleTabs.some((tab) => tab.key === "reconciliation")}
          currency={context.currency}
        />
      )}

      {activeTab === "transactions" && (
        <BankingOverview
          accounts={accounts}
          branches={branchOptions}
          canFilterUnassigned={!context.isBranchScoped}
          transactions={transactions}
          currency={context.currency}
          timeZone={organizationTimeZone}
          canAddAccount={false}
          canTransfer={canTransfer}
          canViewStatements={visibleTabs.some((tab) => tab.key === "reconciliation")}
          canManageAccounts={visibleTabs.some((tab) => tab.key === "accounts")}
          totalBalance={totalBalance}
          today={new Date().toISOString().slice(0, 10)}
          transactionPage={Math.min(transactionPage, transactionPages)}
          transactionPages={transactionPages}
          transactionFilters={transactionFilters}
          transactionPageSize={transactionPageSize}
          transactionTotal={transactionCount}
          initialTransferOpen={query.transfer === "1"}
          showAccountSummary={false}
        />
      )}
    </main>
  );
}
