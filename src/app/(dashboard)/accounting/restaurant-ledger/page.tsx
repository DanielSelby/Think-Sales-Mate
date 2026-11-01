import Link from "next/link";
import { redirect } from "next/navigation";
import { RestaurantAccountMappingPanel, type RestaurantAccountMapping } from "@/components/restaurant/restaurant-account-mapping";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canPermission, canTabPermission } from "@/lib/rbac/permissions";
import { getEnabledOrganizationModules } from "@/lib/supabase/platform-admin";
import { createClient } from "@/lib/supabase/server";
import type { AccountingAccount, BankAccountItem } from "@/types/accounting";

export const metadata = {
  title: "Restaurant General Ledger",
  description: "Configure Restaurant payment, revenue, inventory, and bank account mappings.",
};

export default async function RestaurantLedgerPage() {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!(await getEnabledOrganizationModules(context.orgId)).includes("Restaurant")) {
    redirect("/dashboard?moduleDisabled=Restaurant");
  }
  if (!(await canTabPermission("accounting", "accounting", "settings", "view"))) {
    redirect("/dashboard?accessDenied=accounting");
  }

  const db = await createClient();
  const accountingDb = db as any;
  const [
    { data: accountRows, error: accountsError },
    { data: bankRows, error: bankAccountsError },
    { data: mapping, error: mappingError },
    { data: locationRows, error: locationsError },
  ] = await Promise.all([
    accountingDb.from("accounting_accounts")
      .select("id, code, name, type, sub_type, parent_id, location_id, currency, current_balance, is_active, description")
      .eq("org_id", context.orgId).order("code"),
    accountingDb.from("bank_accounts")
      .select("id, name, account_type, account_number, logo_url, current_balance")
      .eq("org_id", context.orgId).order("name"),
    accountingDb.from("restaurant_account_mappings")
      .select("cash_account_id, card_account_id, mobile_money_account_id, other_account_id, sales_revenue_account_id, refunds_account_id, tips_liability_account_id, ingredient_inventory_account_id, ingredient_payable_account_id, ingredient_payment_account_id, cash_bank_account_id, card_bank_account_id, mobile_money_bank_account_id, other_bank_account_id")
      .eq("org_id", context.orgId).maybeSingle(),
    accountingDb.from("business_locations").select("id, name").eq("org_id", context.orgId),
  ]);
  const queryError = accountsError ?? bankAccountsError ?? mappingError ?? locationsError;
  if (queryError) throw new Error(`Could not load Restaurant General Ledger mappings: ${queryError.message}`);

  const locationNames = new Map<string, string>((locationRows ?? []).map((location: any) => [location.id, location.name]));
  const accounts: AccountingAccount[] = (accountRows ?? []).map((account: any) => ({
    id: account.id,
    code: account.code,
    name: account.name,
    type: account.type,
    subType: account.sub_type ?? undefined,
    parentId: account.parent_id,
    branch: account.location_id ? locationNames.get(account.location_id) ?? "Branch" : "All Locations",
    currency: account.currency ?? context.currency,
    balance: Number(account.current_balance ?? 0),
    status: account.is_active ? "active" : "inactive",
    description: account.description ?? undefined,
  }));
  const bankAccounts: BankAccountItem[] = (bankRows ?? []).map((bank: any) => ({
    id: bank.id,
    name: bank.name,
    accountNumber: bank.account_number ?? undefined,
    logoUrl: bank.logo_url ?? undefined,
    bankName: bank.name,
    type: bank.account_type,
    bookBalance: Number(bank.current_balance ?? 0),
    statementBalance: Number(bank.current_balance ?? 0),
    difference: 0,
    status: "unreconciled",
  }));
  const canEdit = await canPermission("accounting", "edit")
    && await canTabPermission("accounting", "accounting", "settings", "edit");
  const canEditBankMappings = await canPermission("banking", "edit")
    && await canTabPermission("banking", "banking", "accounts", "edit");

  return <main className="mx-auto w-full max-w-6xl space-y-5 p-4 sm:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">Accounting</p>
        <h1 className="text-2xl font-bold text-slate-950 dark:text-white">Restaurant General Ledger</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-ledger-300">
          Map Restaurant payment methods, revenue, refunds, tips, ingredient inventory, and bank balances.
        </p>
      </div>
      <Link href="/accounting" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-ledger-700 dark:text-ledger-200">
        Back to Accounting
      </Link>
    </header>
    <RestaurantAccountMappingPanel
      accounts={accounts}
      mapping={mapping as RestaurantAccountMapping | null}
      canEdit={canEdit}
      bankAccounts={bankAccounts}
      canEditBankMappings={canEditBankMappings}
    />
  </main>;
}
