import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Banknote, ClipboardCheck, Receipt, Wallet } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import {
  EDUCATION_EXPENSE_CATEGORIES,
  EDUCATION_EXPENSE_PAYMENT_METHODS,
  type EducationExpensePaymentStatus,
  type EducationExpenseStatus,
  isValidEducationExpenseDate,
} from "@/lib/education/expenses";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import { createEducationExpense, markEducationExpensePaid, reviewEducationExpense } from "../actions";

const PAGE_SIZE = 30;

const STATUS_LABELS: Record<EducationExpenseStatus, string> = {
  pending_approval: "Pending approval",
  approved: "Approved",
  rejected: "Rejected",
};

const PAYMENT_STATUS_LABELS: Record<EducationExpensePaymentStatus, string> = {
  unpaid: "Unpaid",
  paid: "Paid",
};

export default async function EducationExpensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_expenses", "expenses", "records", "view")) {
    redirect("/dashboard?accessDenied=think-education.expenses");
  }

  const params = await searchParams;
  const requestedBranch = typeof params.branch === "string" ? params.branch : "";
  const requestedStatus = typeof params.status === "string" ? params.status : "";
  const requestedCategory = typeof params.category === "string" ? params.category : "";
  const requestedFrom = typeof params.from === "string" ? params.from : "";
  const requestedTo = typeof params.to === "string" ? params.to : "";
  const currentPage = Math.min(1_000_000, Math.max(1, Number.parseInt(
    typeof params.page === "string" ? params.page : "1", 10
  ) || 1));
  const [canCreate, canApprove, canEdit, { campuses }] = await Promise.all([
    canTabPermission("education_expenses", "expenses", "records", "create"),
    canTabPermission("education_expenses", "expenses", "records", "approve"),
    canTabPermission("education_expenses", "expenses", "records", "edit"),
    getAccessibleEducationCampuses(context.orgId, context.userId),
  ]);
  const campusIds = campuses.map((campus) => campus.id);
  const selectedBranch = campusIds.includes(requestedBranch) ? requestedBranch : "";
  const branchIds = selectedBranch ? [selectedBranch] : campusIds;
  const statusFilter = (["pending_approval", "approved", "rejected"].includes(requestedStatus)
    ? requestedStatus
    : "") as EducationExpenseStatus | "";
  const categoryFilter = EDUCATION_EXPENSE_CATEGORIES.includes(
    requestedCategory as typeof EDUCATION_EXPENSE_CATEGORIES[number]
  ) ? requestedCategory : "";
  const fromDate = isValidEducationExpenseDate(requestedFrom) ? requestedFrom : "";
  const toDate = isValidEducationExpenseDate(requestedTo) ? requestedTo : "";
  const supabase = await createClient();
  const [{ data: organization, error: organizationError }, result] = await Promise.all([
    supabase.from("organizations").select("currency").eq("id", context.orgId).single(),
    (async () => {
      if (!branchIds.length) return { data: [], count: 0, error: null };
      let query = supabase.from("education_expenses")
        .select("id, branch_id, expense_number, category, vendor, description, amount, expense_date, reference, status, payment_status, payment_method, paid_on, rejection_reason, created_at", { count: "exact" })
        .eq("org_id", context.orgId)
        .in("branch_id", branchIds)
        .order("expense_date", { ascending: false })
        .order("created_at", { ascending: false })
        .range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1);
      if (statusFilter) query = query.eq("status", statusFilter);
      if (categoryFilter) query = query.eq("category", categoryFilter);
      if (fromDate) query = query.gte("expense_date", fromDate);
      if (toDate) query = query.lte("expense_date", toDate);
      return query;
    })(),
  ]);
  if (organizationError) throw new Error(`Could not load organization currency: ${organizationError.message}`);
  if (result.error) throw new Error(`Could not load Think Education expenses: ${result.error.message}`);

  const expenses = result.data ?? [];
  const totalCount = result.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const queryForPage = (page: number) => {
    const query = new URLSearchParams();
    if (selectedBranch) query.set("branch", selectedBranch);
    if (statusFilter) query.set("status", statusFilter);
    if (categoryFilter) query.set("category", categoryFilter);
    if (fromDate) query.set("from", fromDate);
    if (toDate) query.set("to", toDate);
    if (page > 1) query.set("page", String(page));
    const suffix = query.toString();
    return `${getProductAppPath("think-education", "/expenses")}${suffix ? `?${suffix}` : ""}`;
  };
  if (currentPage > totalPages) redirect(queryForPage(totalPages));

  const errorMessage = params.error === "invalid"
    ? "Enter a valid campus, category, description, amount, and date."
    : params.error === "transition"
      ? "This expense has already been reviewed or paid, or the requested transition is not allowed."
      : params.error === "not-found"
        ? "The expense record could not be found."
        : params.error === "save"
          ? "The expense could not be saved. Please try again."
          : null;

  return <main className="mx-auto max-w-[1400px] space-y-5 p-4 md:p-6">
    <header>
      <Link href={getProductAppPath("think-education", "/dashboard")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-950">Expenses</h1>
      <p className="mt-1 text-sm text-slate-600">Record campus operating expenses, route them for approval, and track payment status.</p>
    </header>

    {params.created === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Expense recorded and submitted for approval.</p>}
    {params.reviewed === "approved" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Expense approved.</p>}
    {params.reviewed === "rejected" && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Expense rejected with a recorded reason.</p>}
    {params.paid === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Expense payment recorded.</p>}
    {params.error && errorMessage && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{errorMessage}</p>}

    {canCreate && <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-slate-950">Record an expense</h2>
      <p className="mt-1 text-sm text-slate-500">New expenses are pending until an authorized reviewer approves them.</p>
      {!campuses.length ? <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">You need an assigned Think Education campus before recording expenses.</p> : <form action={createEducationExpense} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm font-medium text-slate-700">Campus
          <select required name="branch_id" defaultValue={selectedBranch || campuses[0]?.id || ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Category
          <select required name="category" defaultValue="" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="" disabled>Select category</option>
            {EDUCATION_EXPENSE_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Amount ({organization.currency})
          <input required name="amount" type="number" min="0.01" max="9999999999.99" step="0.01" inputMode="decimal" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Expense date
          <input required name="expense_date" type="date" max={new Date().toISOString().slice(0, 10)} defaultValue={new Date().toISOString().slice(0, 10)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Vendor
          <input name="vendor" maxLength={160} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Reference
          <input name="reference" maxLength={120} placeholder="Invoice or receipt number" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700 sm:col-span-2">Description
          <input required name="description" maxLength={500} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <div className="lg:col-span-4">
          <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Submit for approval</button>
        </div>
      </form>}
    </section>}

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <form method="get" action={getProductAppPath("think-education", "/expenses")} className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-sm font-medium text-slate-700">Campus
          <select name="branch" defaultValue={selectedBranch} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">All assigned campuses</option>
            {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Approval status
          <select name="status" defaultValue={statusFilter} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">All statuses</option>
            {(Object.keys(STATUS_LABELS) as EducationExpenseStatus[]).map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Category
          <select name="category" defaultValue={categoryFilter} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">All categories</option>
            {EDUCATION_EXPENSE_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">From
          <input name="from" type="date" defaultValue={fromDate} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">To
          <input name="to" type="date" defaultValue={toDate} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <div className="lg:col-span-5">
          <button type="submit" className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100">Apply filters</button>
        </div>
      </form>

      {expenses.length ? <div className="divide-y divide-slate-100">
        {expenses.map((expense) => <article key={expense.id} className="space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-700"><Receipt className="h-5 w-5" /></span>
              <div>
                <p className="font-semibold text-slate-950">Expense #{expense.expense_number} · {expense.category}</p>
                <p className="mt-1 text-sm text-slate-600">{expense.description}</p>
                <p className="mt-1 text-xs text-slate-500">{campusNameById.get(expense.branch_id) ?? "Campus"} · {expense.expense_date}{expense.vendor ? ` · ${expense.vendor}` : ""}{expense.reference ? ` · Ref ${expense.reference}` : ""}</p>
                {expense.rejection_reason && <p className="mt-2 text-sm text-red-700">Rejection reason: {expense.rejection_reason}</p>}
              </div>
            </div>
            <div className="text-right">
              <p className="text-lg font-semibold text-slate-950">{organization.currency} {Number(expense.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <div className="mt-1 flex flex-wrap justify-end gap-2 text-xs">
                <span className={`rounded-full px-2.5 py-1 font-medium ${
                  expense.status === "approved" ? "bg-emerald-50 text-emerald-700" : expense.status === "pending_approval" ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-700"
                }`}>{STATUS_LABELS[expense.status as EducationExpenseStatus]}</span>
                <span className={`rounded-full px-2.5 py-1 font-medium ${expense.payment_status === "paid" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"}`}>
                  {PAYMENT_STATUS_LABELS[expense.payment_status as EducationExpensePaymentStatus]}{expense.paid_on ? ` · ${expense.paid_on}` : ""}
                </span>
              </div>
            </div>
          </div>

          {expense.status === "pending_approval" && canApprove && <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3">
            <form action={reviewEducationExpense}>
              <input type="hidden" name="expense_id" value={expense.id} />
              <input type="hidden" name="decision" value="approved" />
              <button type="submit" className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800"><ClipboardCheck className="h-4 w-4" /> Approve</button>
            </form>
            <form action={reviewEducationExpense} className="flex flex-1 flex-wrap items-end gap-2">
              <input type="hidden" name="expense_id" value={expense.id} />
              <input type="hidden" name="decision" value="rejected" />
              <label className="min-w-60 flex-1 text-xs font-medium text-slate-600">Rejection reason
                <input required name="reason" minLength={3} maxLength={500} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
              </label>
              <button type="submit" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100">Reject</button>
            </form>
          </div>}

          {expense.status === "approved" && expense.payment_status === "unpaid" && canEdit && <form action={markEducationExpensePaid} className="flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3">
            <input type="hidden" name="expense_id" value={expense.id} />
            <label className="text-sm font-medium text-slate-700">Payment method
              <select required name="payment_method" defaultValue="" className="mt-1 rounded-lg border border-slate-300 px-3 py-2 font-normal">
                <option value="" disabled>Select method</option>
                {EDUCATION_EXPENSE_PAYMENT_METHODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">Paid on
              <input required name="paid_on" type="date" max={new Date().toISOString().slice(0, 10)} defaultValue={new Date().toISOString().slice(0, 10)} className="mt-1 rounded-lg border border-slate-300 px-3 py-2 font-normal" />
            </label>
            <button type="submit" className="inline-flex items-center gap-1 rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800"><Banknote className="h-4 w-4" /> Record payment</button>
          </form>}
        </article>)}
      </div> : <div className="p-8 text-center">
        <Wallet className="mx-auto h-10 w-10 text-slate-300" />
        <p className="mt-3 font-medium text-slate-800">No expenses found</p>
        <p className="mt-1 text-sm text-slate-500">Record an expense or adjust the campus, status, category, or date filters.</p>
      </div>}

      {totalCount > PAGE_SIZE && <nav aria-label="Expense pages" className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
        <p className="text-slate-500">Showing {Math.min(totalCount, (currentPage - 1) * PAGE_SIZE + 1)}–{Math.min(totalCount, currentPage * PAGE_SIZE)} of {totalCount} expenses</p>
        <div className="flex gap-2">
          {currentPage > 1 && <Link href={queryForPage(currentPage - 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">Previous</Link>}
          {currentPage < totalPages && <Link href={queryForPage(currentPage + 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">Next</Link>}
        </div>
      </nav>}
    </section>
  </main>;
}
