import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Landmark } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";

export default async function EducationBankAccountsPage() {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_finance", "finance", "chart_of_accounts", "view")) {
    redirect("/dashboard?accessDenied=think-education.accounting");
  }

  const [{ campuses }, supabase, canViewLedger, canReconcile] = await Promise.all([
    getAccessibleEducationCampuses(context.orgId, context.userId),
    createClient(),
    canTabPermission("education_finance", "finance", "general_ledger", "view"),
    canTabPermission("education_finance", "finance", "bank_reconciliation", "view"),
  ]);
  const { data: accounts, error } = await supabase.from("education_accounting_accounts")
    .select("id, branch_id, code, name, is_active")
    .eq("org_id", context.orgId)
    .eq("is_cash_account", true)
    .order("code");
  if (error) throw new Error(`Could not load Education cash and bank accounts: ${error.message}`);

  const campusNames = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const chartHref = getProductAppPath("think-education", "/accounting/chart-of-accounts");
  return (
    <main className="mx-auto w-full max-w-[1300px] space-y-6 p-4 md:p-6">
      <header>
        <Link href={getProductAppPath("think-education", "/accounting")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
          <ArrowLeft className="h-4 w-4" /> Accounting
        </Link>
        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-blue-700">Think Education · Cash &amp; Banking</p>
        <h1 className="mt-1 flex items-center gap-2 text-3xl font-semibold tracking-tight text-slate-950">
          <Landmark className="h-7 w-7 text-blue-700" /> Bank Accounts
        </h1>
        <p className="mt-1 text-sm text-slate-600">Manage the cash and bank ledger accounts used for payments and reconciliation.</p>
      </header>

      <section className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-950">
        Accounts are maintained in the Chart of Accounts. Mark an active asset account as Cash/Bank to use it here; bank account numbers and online credentials are not stored.
        <div className="mt-3">
          <Link href={chartHref} className="inline-flex min-h-10 items-center rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800">
            Open Chart of Accounts
          </Link>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold text-slate-950">Registered cash and bank accounts</h2>
          <p className="text-sm text-slate-500">{accounts?.length ?? 0} accounts</p>
        </div>
        {!accounts?.length ? (
          <p className="px-5 py-10 text-center text-sm text-slate-600">No cash or bank accounts are registered. Create an asset account and mark it Cash/Bank in the Chart of Accounts.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Account</th>
                  <th className="px-4 py-3">Campus scope</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Workflows</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {accounts.map((account) => (
                  <tr key={account.id}>
                    <td className="px-4 py-3">
                      <p className="font-mono font-semibold text-slate-950">{account.code}</p>
                      <p>{account.name}</p>
                    </td>
                    <td className="px-4 py-3">{account.branch_id ? campusNames.get(account.branch_id) ?? "Assigned campus" : "All campuses"}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${account.is_active ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                        {account.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {canViewLedger && <Link href={getProductAppPath("think-education", `/accounting/cashbook?account=${account.id}`)} className="font-semibold text-blue-700 hover:underline">Cashbook</Link>}
                        {canReconcile && <Link href={getProductAppPath("think-education", "/accounting/bank-reconciliation")} className="font-semibold text-blue-700 hover:underline">Reconciliation</Link>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
