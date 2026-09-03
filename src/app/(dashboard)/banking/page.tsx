import Link from "next/link";
import { cookies } from "next/headers";
import { Plus } from "lucide-react";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { AccountsTable, type AccountRow } from "@/components/banking/accounts-table";

export default async function BankingPage() {
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
  const { data: rows } = await supabase
    .from("bank_accounts")
    .select("id, name, account_type, current_balance")
    .eq("org_id", context.orgId)
    .order("name");

  const accounts: AccountRow[] = (rows ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    accountType: a.account_type,
    currentBalance: a.current_balance
  }));

  const canManage = can(context.role, "banking.manage");
  const totalBalance = accounts.reduce((sum, a) => sum + a.currentBalance, 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900 dark:text-white">Banking</h1>
          <p className="text-sm text-ledger-500 dark:text-ledger-400">
            {accounts.length} account{accounts.length === 1 ? "" : "s"} · ${totalBalance.toFixed(2)} total
          </p>
        </div>
        {canManage && (
          <Link href="/banking/new">
            <Button>
              <Plus className="h-4 w-4" />
              Add account
            </Button>
          </Link>
        )}
      </div>

      <AccountsTable accounts={accounts} canManage={canManage} currency={context.currency} />
    </div>
  );
}