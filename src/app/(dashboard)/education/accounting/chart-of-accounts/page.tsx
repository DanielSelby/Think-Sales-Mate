import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BookOpen, Plus } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import { deactivateEducationAccountingAccount, saveEducationAccountingAccount } from "../actions";
import { DeleteAccountButton } from "./delete-account-button";

const accountTypes = [
  { value: "asset", label: "Asset", normalBalance: "Debit" },
  { value: "liability", label: "Liability", normalBalance: "Credit" },
  { value: "equity", label: "Equity", normalBalance: "Credit" },
  { value: "income", label: "Income", normalBalance: "Credit" },
  { value: "expense", label: "Expense", normalBalance: "Debit" },
] as const;

const fieldClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";

export default async function EducationChartOfAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_finance", "finance", "chart_of_accounts", "view")) {
    redirect("/dashboard?accessDenied=think-education.accounting");
  }

  const [{ campuses, hasOrganizationScope }, params, supabase] = await Promise.all([
    getAccessibleEducationCampuses(context.orgId, context.userId),
    searchParams,
    createClient(),
  ]);
  const [accountsResult, createAllowed, editAllowed] = await Promise.all([
    supabase.from("education_accounting_accounts")
      .select("id, branch_id, code, name, account_type, normal_balance, parent_account_id, description, is_active, is_cash_account, cash_flow_activity, created_at")
      .eq("org_id", context.orgId)
      .order("code"),
    canTabPermission("education_finance", "finance", "chart_of_accounts", "create"),
    canTabPermission("education_finance", "finance", "chart_of_accounts", "edit"),
  ]);
  if (accountsResult.error) {
    throw new Error(`Could not load the Education chart of accounts: ${accountsResult.error.message}`);
  }

  const accounts = accountsResult.data ?? [];
  const campusesById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const errorMessage = params.error === "account-save"
    ? "The account could not be saved. Check that the code is unique and the parent account has the same type and campus scope."
    : params.error === "account-mapped"
      ? "Remove this account from automated posting mappings before deactivating it."
      : params.error === "account-in-use"
        ? "This account is used by a journal, mapping, reconciliation, or child account. Deactivate it instead."
        : params.error === "account-delete"
          ? "The account could not be deleted. Refresh the page and try again."
          : null;

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-6 p-4 md:p-6">
      <header>
        <Link
          href={getProductAppPath("think-education", "/accounting")}
          className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900"
        >
          <ArrowLeft className="h-4 w-4" /> Accounting
        </Link>
        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-blue-700">Think Education · Accounting setup</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Chart of Accounts</h1>
        <p className="mt-1 text-sm text-slate-600">Define institution and campus accounts for manual journals, automated fee and expense posting, and financial reports.</p>
      </header>

      {errorMessage && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{errorMessage}</p>}
      {params.saved === "account-deleted" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Account deleted.</p>}

      {createAllowed && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
            <Plus className="h-5 w-5 text-blue-700" /> Add account
          </h2>
          <form action={saveEducationAccountingAccount} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm font-medium text-slate-700">
              Account code
              <input required name="code" minLength={2} maxLength={20} pattern="[A-Za-z0-9][A-Za-z0-9._/-]{1,19}" className={fieldClass} />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Account name
              <input required name="name" maxLength={120} className={fieldClass} />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Account type
              <select required name="accountType" defaultValue="asset" className={fieldClass}>
                {accountTypes.map((type) => <option key={type.value} value={type.value}>{type.label} · {type.normalBalance} balance</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Campus scope
              <select name="branchId" defaultValue="" className={fieldClass}>
                {hasOrganizationScope && <option value="">All campuses</option>}
                {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Parent account
              <select name="parentAccountId" defaultValue="" className={fieldClass}>
                <option value="">No parent</option>
                {accounts.filter((account) => account.is_active).map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.code} · {account.name} ({account.account_type})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Description
              <input name="description" maxLength={500} className={fieldClass} />
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input type="checkbox" name="isCashAccount" className="h-4 w-4 rounded border-slate-300" />
              Cash or bank account
            </label>
            <label className="text-sm font-medium text-slate-700">
              Cash flow activity
              <select name="cashFlowActivity" defaultValue="" className={fieldClass}>
                <option value="">Unclassified</option>
                <option value="operating">Operating</option>
                <option value="investing">Investing</option>
                <option value="financing">Financing</option>
              </select>
            </label>
            <div className="sm:col-span-2 lg:col-span-3">
              <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">
                Create account
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4">
          <BookOpen className="h-5 w-5 text-blue-700" />
          <div>
            <h2 className="font-semibold text-slate-950">Accounts</h2>
            <p className="text-sm text-slate-500">{accounts.length} accounts · balances come from posted journals in the General Ledger</p>
          </div>
        </div>
        {accounts.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-600">No accounts have been configured yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Code / name</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Normal balance</th>
                  <th className="px-4 py-3">Cash flow</th>
                  <th className="px-4 py-3">Campus</th>
                  <th className="px-4 py-3">Parent</th>
                  <th className="px-4 py-3">Status</th>
                  {editAllowed && <th className="px-4 py-3">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {accounts.map((account) => {
                  const parent = accounts.find((candidate) => candidate.id === account.parent_account_id);
                  return (
                    <tr key={account.id} className="align-top text-slate-700">
                      <td className="px-4 py-3">
                        <p className="font-mono font-semibold text-slate-900">{account.code}</p>
                        <p>{account.name}</p>
                        {account.description && <p className="mt-1 max-w-xs text-xs text-slate-500">{account.description}</p>}
                      </td>
                      <td className="px-4 py-3 capitalize">{account.account_type}</td>
                      <td className="px-4 py-3">{account.normal_balance}</td>
                      <td className="px-4 py-3 text-xs">
                        {account.is_cash_account ? "Cash / bank" : account.cash_flow_activity ?? "Unclassified"}
                      </td>
                      <td className="px-4 py-3">{account.branch_id ? campusesById.get(account.branch_id) ?? "Assigned campus" : "All campuses"}</td>
                      <td className="px-4 py-3">{parent ? `${parent.code} · ${parent.name}` : "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${account.is_active ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                          {account.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      {editAllowed && (
                        <td className="px-4 py-3">
                          <div className="flex flex-col items-start gap-2">
                            <details>
                              <summary className="cursor-pointer text-xs font-semibold text-blue-700 hover:underline">Edit</summary>
                              <form action={saveEducationAccountingAccount} className="mt-2 min-w-64 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                                <input type="hidden" name="accountId" value={account.id} />
                                <label className="block text-xs font-medium text-slate-700">Account code
                                  <input required name="code" defaultValue={account.code} maxLength={20} pattern="[A-Za-z0-9][A-Za-z0-9._/-]{1,19}" className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono" />
                                </label>
                                <label className="block text-xs font-medium text-slate-700">Account name
                                  <input required name="name" defaultValue={account.name} maxLength={120} className="mt-1 w-full rounded border border-slate-300 px-2 py-1" />
                                </label>
                                <label className="block text-xs font-medium text-slate-700">Description
                                  <input name="description" defaultValue={account.description ?? ""} maxLength={500} className="mt-1 w-full rounded border border-slate-300 px-2 py-1" />
                                </label>
                                <label className="block text-xs font-medium text-slate-700">Parent account
                                  <select name="parentAccountId" defaultValue={account.parent_account_id ?? ""} className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1">
                                    <option value="">No parent</option>
                                    {accounts.filter((candidate) =>
                                      candidate.is_active
                                      && candidate.id !== account.id
                                      && candidate.account_type === account.account_type
                                      && (candidate.branch_id === null || candidate.branch_id === account.branch_id)
                                    ).map((candidate) => (
                                      <option key={candidate.id} value={candidate.id}>{candidate.code} · {candidate.name}</option>
                                    ))}
                                  </select>
                                </label>
                                <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                                  <input type="checkbox" name="isCashAccount" defaultChecked={account.is_cash_account} className="h-4 w-4 rounded border-slate-300" />
                                  Cash/bank
                                </label>
                                <label className="block text-xs font-medium text-slate-700">Cash flow activity
                                  <select name="cashFlowActivity" defaultValue={account.cash_flow_activity ?? ""} className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1">
                                    <option value="">Unclassified cash flow</option>
                                    <option value="operating">Operating</option>
                                    <option value="investing">Investing</option>
                                    <option value="financing">Financing</option>
                                  </select>
                                </label>
                                <button type="submit" className="rounded bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">Save changes</button>
                              </form>
                            </details>
                            {account.is_active && (
                              <form action={deactivateEducationAccountingAccount}>
                                <input type="hidden" name="accountId" value={account.id} />
                                <button type="submit" className="text-xs font-semibold text-amber-700 hover:underline">Deactivate</button>
                              </form>
                            )}
                            <DeleteAccountButton accountId={account.id} accountName={`${account.code} · ${account.name}`} />
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        Mark cash and bank accounts for payment mappings and reconciliation. Classify other accounts by cash-flow activity to group movements in financial reports.
      </p>
    </main>
  );
}
