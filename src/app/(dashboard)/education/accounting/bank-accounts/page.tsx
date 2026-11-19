import { redirect } from "next/navigation";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { EducationBankAccountsView } from "./bank-accounts-view";

export default async function EducationBankAccountsPage() {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_finance", "finance", "chart_of_accounts", "view")) {
    redirect("/dashboard?accessDenied=think-education.accounting");
  }

  const [{ campuses, hasOrganizationScope }, supabase, canCreate, canEdit] = await Promise.all([
    getAccessibleEducationCampuses(context.orgId, context.userId),
    createClient(),
    canTabPermission("education_finance", "finance", "chart_of_accounts", "create"),
    canTabPermission("education_finance", "finance", "chart_of_accounts", "edit"),
  ]);
  let accountsQuery = supabase.from("education_accounting_accounts")
    .select("id, branch_id, code, name, is_active, bank_account_type, bank_account_number, bank_logo_path")
    .eq("org_id", context.orgId)
    .eq("is_cash_account", true)
    .order("code");
  if (!hasOrganizationScope) {
    const campusIds = campuses.map((campus) => campus.id);
    if (campusIds.length) accountsQuery = accountsQuery.in("branch_id", campusIds);
    else accountsQuery = accountsQuery.eq("branch_id", "00000000-0000-0000-0000-000000000000");
  }
  const { data: accounts, error } = await accountsQuery;
  if (error) throw new Error(`Could not load Education cash and bank accounts: ${error.message}`);

  const bankAccounts = accounts ?? [];
  const balancesResult = bankAccounts.length
    ? await supabase.rpc("education_get_cash_account_balances", {
      p_org_id: context.orgId,
      p_account_ids: bankAccounts.map((account) => account.id),
    })
    : { data: [], error: null };
  if (balancesResult.error) throw new Error(`Could not load Education cash and bank balances: ${balancesResult.error.message}`);
  const balances = new Map((balancesResult.data ?? []).map((row) => [row.account_id, Number(row.balance)]));
  const maskAccountNumber = (value: string | null) => value
    ? `${"•".repeat(Math.max(4, value.length - 4))}${value.slice(-4)}`
    : "No account number";

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-6 p-4 md:p-6">
      <EducationBankAccountsView
        accounts={bankAccounts.map((account) => ({
          id: account.id,
          branchId: account.branch_id,
          code: account.code,
          name: account.name,
          isActive: account.is_active,
          accountType: account.bank_account_type,
          accountNumber: canEdit ? account.bank_account_number : null,
          accountNumberDisplay: maskAccountNumber(account.bank_account_number),
          logoUrl: account.bank_logo_path
            ? supabase.storage.from("education-bank-account-logos").getPublicUrl(account.bank_logo_path).data.publicUrl
            : null,
          balance: balances.get(account.id) ?? null,
        }))}
        campuses={campuses.map((campus) => ({ id: campus.id, name: campus.name }))}
        currency={context.currency}
        hasOrganizationScope={hasOrganizationScope}
        canCreate={canCreate && (hasOrganizationScope || campuses.length > 0)}
        canEdit={canEdit}
      />
    </main>
  );
}
