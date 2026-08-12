import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { ArrowLeft } from "lucide-react";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { recordTransaction } from "@/app/(dashboard)/banking/actions";

function formatMoney(value: number) {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

const TYPE_LABELS: Record<string, string> = {
  cash: "Cash",
  checking: "Checking",
  savings: "Savings",
  mobile_money: "Mobile money",
  other: "Other"
};

export default async function AccountDetailPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context || !can(context.role, "banking.view")) return null;

  const supabase = await createClient();
  const { data: account } = await supabase
    .from("bank_accounts")
    .select("id, name, account_type, current_balance")
    .eq("id", params.id)
    .eq("org_id", context.orgId)
    .single();

  if (!account) notFound();

  const { data: transactions } = await supabase
    .from("bank_transactions")
    .select("id, type, amount, description, transaction_date")
    .eq("account_id", account.id)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false });

  const canManage = can(context.role, "banking.manage");
  const boundRecord = recordTransaction.bind(null, account.id);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/banking" className="inline-flex items-center gap-1 text-sm text-ledger-500 hover:text-ink-900 dark:hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to banking
        </Link>
        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-ledger-400">
          {TYPE_LABELS[account.account_type] ?? account.account_type}
        </p>
        <h1 className="font-display text-2xl font-semibold text-ink-900 dark:text-white">{account.name}</h1>
        <p className="figure mt-1 text-3xl font-semibold text-ink-900 dark:text-white">
          ${formatMoney(account.current_balance)}
        </p>
      </div>

      {canManage && (
        <form
          action={boundRecord}
          className="flex flex-wrap items-end gap-3 rounded-card border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900"
        >
          {searchParams.error && (
            <p className="w-full rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">{searchParams.error}</p>
          )}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-ledger-700 dark:text-ledger-200">Type</label>
            <select
              name="type"
              defaultValue="deposit"
              className="h-10 rounded-md border border-ledger-200 bg-white px-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
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

      {!transactions || transactions.length === 0 ? (
        <div className="rounded-card border border-dashed border-ledger-200 bg-white p-10 text-center dark:border-ledger-700 dark:bg-ink-900">
          <p className="text-sm text-ledger-500 dark:text-ledger-400">No transactions yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-ledger-100 bg-white shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <table className="w-full text-sm">
            <thead className="border-b border-ledger-100 text-left text-xs font-medium uppercase tracking-wide text-ledger-400 dark:border-ledger-700">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Note</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id} className="border-b border-ledger-50 last:border-0 dark:border-ledger-700/50">
                  <td className="px-4 py-3 text-ledger-500 dark:text-ledger-400">
                    {new Date(tx.transaction_date).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-ink-900 dark:text-white">{tx.description ?? "—"}</td>
                  <td className="px-4 py-3 capitalize text-ledger-500 dark:text-ledger-400">{tx.type}</td>
                  <td className={`px-4 py-3 text-right figure ${tx.type === "deposit" ? "text-signal" : "text-alert"}`}>
                    {tx.type === "deposit" ? "+" : "−"}${formatMoney(tx.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
