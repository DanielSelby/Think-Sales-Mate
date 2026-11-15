import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Settings2 } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import {
  backfillEducationAccountingJournals,
  saveEducationAccountingSourceMapping,
} from "../actions";

const paymentMethods = [
  ["cash", "Cash"],
  ["mobile_money", "Mobile money"],
  ["bank_transfer", "Bank transfer"],
  ["card", "Card"],
  ["cheque", "Cheque"],
  ["other", "Other"],
] as const;
const fieldClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";

type MappingRow = {
  branch_id: string;
  source_type: string;
  source_key: string;
  account_id: string;
};

function MappingForm({
  branchId,
  sourceType,
  sourceKey = "",
  editableKey = false,
  title,
  description,
  accountType,
  cashOnly = false,
  accounts,
  selectedAccountId,
  canEdit,
}: {
  branchId: string;
  sourceType: string;
  sourceKey?: string;
  editableKey?: boolean;
  title: string;
  description: string;
  accountType: string;
  cashOnly?: boolean;
  accounts: Array<{ id: string; branch_id: string | null; code: string; name: string; account_type: string; is_active: boolean }>;
  selectedAccountId?: string;
  canEdit: boolean;
}) {
  const options = accounts.filter((account) =>
    account.is_active
    && account.account_type === accountType
    && (!cashOnly || account.is_cash_account)
    && (account.branch_id === null || account.branch_id === branchId)
  );
  return (
    <form action={saveEducationAccountingSourceMapping} className="grid gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end">
      <input type="hidden" name="branchId" value={branchId} />
      <input type="hidden" name="sourceType" value={sourceType} />
      {editableKey ? (
        <label className="text-xs font-medium text-slate-600">
          Expense category
          <input required name="sourceKey" maxLength={100} placeholder="Category name" className={fieldClass} />
        </label>
      ) : <input type="hidden" name="sourceKey" value={sourceKey} />}
      <div>
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="mt-0.5 text-xs text-slate-500">{description}</p>
      </div>
      <label className="text-xs font-medium text-slate-600">
        {accountType.charAt(0).toUpperCase() + accountType.slice(1)} account
        <select name="accountId" defaultValue={selectedAccountId ?? ""} disabled={!canEdit} className={fieldClass}>
          <option value="">Not configured</option>
          {options.map((account) => (
            <option key={account.id} value={account.id}>{account.code} · {account.name}</option>
          ))}
        </select>
      </label>
      {canEdit && <button type="submit" className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800">Save mapping</button>}
    </form>
  );
}

export default async function EducationAccountingSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string; backfilled?: string }>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_finance", "finance", "accounting_settings", "view")) {
    redirect("/dashboard?accessDenied=think-education.accounting");
  }

  const [{ campuses }, params, supabase, canEdit, canBackfill] = await Promise.all([
    getAccessibleEducationCampuses(context.orgId, context.userId),
    searchParams,
    createClient(),
    canTabPermission("education_finance", "finance", "accounting_settings", "edit"),
    canTabPermission("education_finance", "finance", "accounting_settings", "approve"),
  ]);
  const [accountsResult, mappingsResult, yearsResult] = await Promise.all([
    supabase.from("education_accounting_accounts")
      .select("id, branch_id, code, name, account_type, is_active, is_cash_account")
      .eq("org_id", context.orgId)
      .order("code"),
    supabase.from("education_accounting_source_mappings")
      .select("branch_id, source_type, source_key, account_id")
      .eq("org_id", context.orgId),
    supabase.from("education_accounting_fiscal_years")
      .select("starts_on, ends_on")
      .eq("org_id", context.orgId)
      .order("starts_on", { ascending: false }),
  ]);
  if (accountsResult.error) throw new Error(`Could not load accounts for automated posting: ${accountsResult.error.message}`);
  if (mappingsResult.error) throw new Error(`Could not load Education accounting mappings: ${mappingsResult.error.message}`);
  if (yearsResult.error) throw new Error(`Could not load fiscal years for accounting setup: ${yearsResult.error.message}`);

  const expenseCategoriesByBranch = new Map<string, Set<string>>();
  for (const campus of campuses) {
    const { data, error } = await supabase.from("education_expenses")
      .select("category")
      .eq("org_id", context.orgId)
      .eq("branch_id", campus.id)
      .limit(5000);
    if (error) throw new Error(`Could not load expense categories for ${campus.name}: ${error.message}`);
    expenseCategoriesByBranch.set(campus.id, new Set(
      (data ?? []).map((row) => row.category.trim().toLowerCase()).filter(Boolean),
    ));
  }
  const accounts = accountsResult.data ?? [];
  const mappings = (mappingsResult.data ?? []) as MappingRow[];
  const mappingByKey = new Map(mappings.map((mapping) => [
    `${mapping.branch_id}:${mapping.source_type}:${mapping.source_key}`,
    mapping.account_id,
  ]));
  const fiscalStart = (yearsResult.data ?? []).find((year) => year.starts_on <= new Date().toISOString().slice(0, 10))?.starts_on
    ?? yearsResult.data?.[0]?.starts_on
    ?? `${new Date().getUTCFullYear()}-01-01`;
  const today = new Date().toISOString().slice(0, 10);
  const errorMessage = params.error === "permission"
    ? "You are not authorized to change accounting settings."
    : params.error === "mapping"
      ? "The mapping is invalid. Check that the selected account is active and has the required type."
      : params.error === "backfill"
        ? "Backfill failed. Check mappings, date range, campus access, and open accounting periods."
        : null;

  return (
    <main className="mx-auto w-full max-w-[1300px] space-y-6 p-4 md:p-6">
      <header>
        <Link href={getProductAppPath("think-education", "/accounting")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
          <ArrowLeft className="h-4 w-4" /> Accounting
        </Link>
        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-blue-700">Think Education · Accounting setup</p>
        <h1 className="mt-1 flex items-center gap-2 text-3xl font-semibold tracking-tight text-slate-950">
          <Settings2 className="h-7 w-7 text-blue-700" /> Automated Posting Settings
        </h1>
        <p className="mt-1 text-sm text-slate-600">Map finalized fee and expense events to active accounts at each campus.</p>
      </header>

      {params.saved === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Accounting mapping saved.</p>}
      {params.backfilled !== undefined && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{params.backfilled} source transaction journal(s) created.</p>}
      {errorMessage && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{errorMessage}</p>}

      <p className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-950">
        Accrual posting is automatic: fee charges recognize receivables and income, receipts settle receivables, approved expenses recognize expense and payable, and paid expenses settle payables. Missing mappings or closed periods stop the source action so it cannot silently miss the ledger.
      </p>

      {campuses.length === 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
          No campus accounting scope is assigned to your account.
        </section>
      ) : campuses.map((campus) => {
        const categories = Array.from(expenseCategoriesByBranch.get(campus.id) ?? []).sort();
        return (
          <section key={campus.id} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <header>
              <h2 className="text-lg font-semibold text-slate-950">{campus.name}</h2>
              <p className="text-sm text-slate-500">Accounts may be shared organization-wide or belong to this campus.</p>
            </header>
            <div className="grid gap-3 lg:grid-cols-2">
              <MappingForm branchId={campus.id} sourceType="fee_receivable" title="Student receivables" description="Debit when fee charges are issued; credit when receipts are recorded." accountType="asset" accounts={accounts} selectedAccountId={mappingByKey.get(`${campus.id}:fee_receivable:`)} canEdit={canEdit} />
              <MappingForm branchId={campus.id} sourceType="fee_income" title="Fee income" description="Credit when a fee charge is issued; reversed when an unpaid charge is voided." accountType="income" accounts={accounts} selectedAccountId={mappingByKey.get(`${campus.id}:fee_income:`)} canEdit={canEdit} />
              <MappingForm branchId={campus.id} sourceType="expense_payable" title="Expense payable" description="Credit when an expense is approved; debit when it is marked paid." accountType="liability" accounts={accounts} selectedAccountId={mappingByKey.get(`${campus.id}:expense_payable:`)} canEdit={canEdit} />
              {paymentMethods.map(([method, label]) => (
                <MappingForm key={method} branchId={campus.id} sourceType="payment_account" sourceKey={method} title={`${label} clearing account`} description="Used for fee receipts and expense payments recorded using this method." accountType="asset" accounts={accounts} selectedAccountId={mappingByKey.get(`${campus.id}:payment_account:${method}`)} cashOnly canEdit={canEdit} />
              ))}
              {categories.map((category) => (
                <MappingForm key={category} branchId={campus.id} sourceType="expense_category" sourceKey={category} title={`Expense: ${category}`} description="Debit account when an expense in this category is approved." accountType="expense" accounts={accounts} selectedAccountId={mappingByKey.get(`${campus.id}:expense_category:${category}`)} canEdit={canEdit} />
              ))}
              {canEdit && (
                <MappingForm branchId={campus.id} sourceType="expense_category" editableKey title="Add or update an expense category mapping" description="Category text is matched case-insensitively to the expense record." accountType="expense" accounts={accounts} canEdit />
              )}
            </div>
            {canBackfill && (
              <form action={backfillEducationAccountingJournals} className="grid gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:grid-cols-[1fr_1fr_1.5fr_auto] sm:items-end">
                <input type="hidden" name="branchId" value={campus.id} />
                <label className="text-xs font-medium text-amber-950">Backfill from
                  <input required name="startsOn" type="date" defaultValue={fiscalStart} className={fieldClass} />
                </label>
                <label className="text-xs font-medium text-amber-950">Through
                  <input required name="endsOn" type="date" defaultValue={today} max={today} className={fieldClass} />
                </label>
                <p className="text-xs text-amber-950">Create missing journals for existing finalized transactions. Configure all applicable accounts and open periods first.</p>
                <button type="submit" className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-100">Backfill journals</button>
              </form>
            )}
          </section>
        );
      })}

      <p className="text-xs text-slate-500">
        A new expense category must be mapped before its approval can post. Backfill processes existing records in date order and rolls back if any row cannot be posted.
      </p>
    </main>
  );
}
