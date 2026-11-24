import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Banknote, CreditCard, Wallet } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { formatCurrencyAmount } from "@/lib/currency";
import { getOrganizationCurrencyConfig } from "@/lib/currency/settings";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";

const PAGE_SIZE = 50;
const MAX_REPORT_PAYMENTS = 50_000;
const PAYMENT_METHODS = [
  ["cash", "Cash"],
  ["mobile_money", "Mobile money"],
  ["bank_transfer", "Bank transfer"],
  ["card", "Card"],
  ["paystack", "Paystack"],
  ["cheque", "Cheque"],
  ["other", "Other"],
] as const;
type PaymentMethod = typeof PAYMENT_METHODS[number][0];

type CollectionRecord = {
  id: string;
  charge_id: string;
  amount: number;
  payment_method: string;
  reference: string | null;
  created_at: string;
  branch_id: string;
  student_id: string | null;
  academic_year_id: string | null;
  description: string;
  student_number: string | null;
  first_name: string | null;
  last_name: string | null;
};

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export default async function EducationCollectionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");

  const [canViewPayments, canViewStudents, canViewAcademicYears, canPrintReceipts, canExportPayments] = await Promise.all([
    canTabPermission("education_finance", "finance", "payments", "view"),
    canTabPermission("education_students", "students", "list", "view"),
    canTabPermission("education_academics", "academics", "calendar", "view"),
    canTabPermission("education_finance", "finance", "payments", "print"),
    canTabPermission("education_finance", "finance", "payments", "export"),
  ]);
  if (!canViewPayments || !canViewStudents || !canViewAcademicYears) {
    redirect("/dashboard?accessDenied=think-education.finance.collections");
  }

  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const defaultFrom = shiftDate(today, -29);
  const requestedFrom = typeof params.from === "string" ? params.from : "";
  const requestedTo = typeof params.to === "string" ? params.to : "";
  const from = isValidDate(requestedFrom) ? requestedFrom : defaultFrom;
  const to = isValidDate(requestedTo) ? requestedTo : today;
  const invalidRange = from > to;
  const rangeTooLong = !invalidRange
    && (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 > 366;
  const requestedBranch = typeof params.branch === "string" ? params.branch : "";
  const currentPage = Math.min(1_000_000, Math.max(1, Number.parseInt(
    typeof params.page === "string" ? params.page : "1", 10
  ) || 1));
  const selectedMethod = PAYMENT_METHODS.some(([value]) => value === params.method)
    ? params.method as PaymentMethod
    : "";
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const campusIds = campuses.map((campus) => campus.id);
  const selectedBranch = campusIds.includes(requestedBranch) ? requestedBranch : "";
  const branchIds = selectedBranch ? [selectedBranch] : campusIds;
  const supabase = await createClient();
  const [
    currencyConfig,
    { data: academicYears, error: yearsError },
  ] = await Promise.all([
    getOrganizationCurrencyConfig(),
    supabase.from("education_academic_years")
      .select("id, name")
      .eq("org_id", context.orgId),
  ]);
  if (yearsError) throw new Error(`Could not load academic years for collections: ${yearsError.message}`);

  const { data: collectionRows, error: collectionsError } = !invalidRange && !rangeTooLong && branchIds.length
    ? await supabase.rpc("education_get_fee_collections_page", {
      p_org_id: context.orgId,
      p_branch_ids: branchIds,
      p_from: `${from}T00:00:00.000Z`,
      p_to_exclusive: `${shiftDate(to, 1)}T00:00:00.000Z`,
      p_payment_method: selectedMethod || null,
      p_limit: PAGE_SIZE,
      p_offset: (currentPage - 1) * PAGE_SIZE,
    })
    : { data: [], error: null };
  if (collectionsError) throw new Error(`Could not aggregate fee collections: ${collectionsError.message}`);

  const summary = collectionRows?.[0];
  const paymentCount = Number(summary?.total_count ?? 0);
  const tooManyPayments = paymentCount > MAX_REPORT_PAYMENTS;
  const totalCollected = Number(summary?.total_collected ?? 0);
  const methodTotals = summary?.totals_by_method;
  const totalsByMethodObject = methodTotals && typeof methodTotals === "object" && !Array.isArray(methodTotals)
    ? methodTotals
    : {};
  const totalsByMethod = new Map<PaymentMethod, number>(PAYMENT_METHODS.map(([method]) => [
    method,
    Number(totalsByMethodObject[method] ?? 0),
  ]));
  const visiblePayments: CollectionRecord[] = (collectionRows ?? []).flatMap((row) =>
    row.payment_id && row.charge_id && row.branch_id
      ? [{
        id: row.payment_id,
        charge_id: row.charge_id,
        amount: Number(row.amount ?? 0),
        payment_method: row.payment_method ?? "other",
        reference: row.reference,
        created_at: row.created_at ?? "",
        branch_id: row.branch_id,
        student_id: row.student_id,
        academic_year_id: row.academic_year_id,
        description: row.description ?? "",
        student_number: row.student_number,
        first_name: row.first_name,
        last_name: row.last_name,
      }]
      : []
  );
  const totalPages = Math.max(1, Math.ceil(paymentCount / PAGE_SIZE));
  const queryForPage = (page: number) => {
    const next = new URLSearchParams();
    next.set("from", from);
    next.set("to", to);
    if (selectedBranch) next.set("branch", selectedBranch);
    if (selectedMethod) next.set("method", selectedMethod);
    if (page > 1) next.set("page", String(page));
    return `${getProductAppPath("think-education", "/finance/collections")}?${next.toString()}`;
  };
  if (currentPage > totalPages) redirect(queryForPage(totalPages));
  const visibleRows = visiblePayments;
  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const yearNameById = new Map((academicYears ?? []).map((year) => [year.id, year.name]));
  const formatMoney = (amount: number) => formatCurrencyAmount(amount, currencyConfig);
  const exportParams = new URLSearchParams({ from, to });
  if (selectedBranch) exportParams.set("branch", selectedBranch);
  if (selectedMethod) exportParams.set("method", selectedMethod);
  const exportHref = `${getProductAppPath("think-education", "/finance/collections/export")}?${exportParams.toString()}`;

  return <main className="mx-auto max-w-[1500px] space-y-5 p-4 md:p-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
      <Link href={getProductAppPath("think-education", "/finance")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
        <ArrowLeft className="h-4 w-4" /> Fees & Finance
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-950">Payment collections</h1>
      <p className="mt-1 text-sm text-slate-600">Review fee receipts collected during a selected period.</p>
      </div>
      {canExportPayments && <a href={exportHref} className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-800 hover:bg-blue-100">
        Export collections CSV
      </a>}
    </header>

    <form method="get" action={getProductAppPath("think-education", "/finance/collections")} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto]">
      <label className="text-sm font-medium text-slate-700">From
        <input required type="date" name="from" defaultValue={from} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
      </label>
      <label className="text-sm font-medium text-slate-700">To
        <input required type="date" name="to" defaultValue={to} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
      </label>
      <label className="text-sm font-medium text-slate-700">Campus
        <select name="branch" defaultValue={selectedBranch} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
          <option value="">All assigned campuses</option>
          {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium text-slate-700">Payment method
        <select name="method" defaultValue={selectedMethod} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
          <option value="">All methods</option>
          {PAYMENT_METHODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <button type="submit" className="self-end rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100">Apply filters</button>
    </form>

    {invalidRange && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">The start date must be on or before the end date.</p>}
    {rangeTooLong && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Choose a date range of 367 days or less.</p>}

    {!invalidRange && !rangeTooLong && !tooManyPayments && <>
      <section className="grid gap-3 sm:grid-cols-2">
        <article className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div><p className="text-sm text-slate-500">Payments received</p><p className="mt-1 text-2xl font-bold text-slate-950">{paymentCount.toLocaleString()}</p></div>
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><CreditCard className="h-5 w-5" /></span>
        </article>
        <article className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div><p className="text-sm text-slate-500">Total collected</p><p className="mt-1 text-2xl font-bold text-slate-950">{formatMoney(totalCollected)}</p></div>
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Wallet className="h-5 w-5" /></span>
        </article>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4">
          <h2 className="font-semibold text-slate-950">Collections by payment method</h2>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {PAYMENT_METHODS.filter(([method]) => (totalsByMethod.get(method) ?? 0) > 0).map(([method, label]) => <div key={method} className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
            <span className="flex items-center gap-2 text-sm text-slate-600"><Banknote className="h-4 w-4" />{label}</span>
            <span className="font-semibold text-slate-900">{formatMoney(totalsByMethod.get(method) ?? 0)}</span>
          </div>)}
          {visiblePayments.length === 0 && <p className="text-sm text-slate-500">No payments match these filters.</p>}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {visibleRows.length ? <div className="divide-y divide-slate-100">
          {visibleRows.map((payment) => {
            const studentName = [payment.first_name, payment.last_name].filter(Boolean).join(" ");
            return <article key={payment.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-semibold text-slate-900">{studentName || "Student"}{payment.student_number ? ` · ${payment.student_number}` : ""}</p>
                <p className="mt-1 text-sm text-slate-600">{payment.description} · {payment.academic_year_id ? yearNameById.get(payment.academic_year_id) ?? "Academic year" : "Academic year"}</p>
                <p className="mt-1 text-xs text-slate-500">{campusNameById.get(payment.branch_id) ?? "Campus"} · {new Date(payment.created_at).toLocaleString()}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-slate-950">{formatMoney(payment.amount)}</p>
                <p className="mt-1 text-sm capitalize text-slate-500">{payment.payment_method.replace(/_/g, " ")}{payment.reference ? ` · ${payment.reference}` : ""}</p>
                {canPrintReceipts && <Link href={getProductAppPath("think-education", `/finance/receipts/${payment.id}`)} className="mt-1 inline-block text-sm font-semibold text-blue-700 hover:text-blue-900">View receipt</Link>}
              </div>
            </article>;
          })}
        </div> : <p className="p-8 text-center text-sm text-slate-500">No collections found for the selected period and filters.</p>}

        {paymentCount > PAGE_SIZE && <nav aria-label="Collections pages" className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
          <p className="text-slate-500">Showing {Math.min(paymentCount, (currentPage - 1) * PAGE_SIZE + 1)}–{Math.min(paymentCount, currentPage * PAGE_SIZE)} of {paymentCount} payments</p>
          <div className="flex gap-2">
            {currentPage > 1 && <Link href={queryForPage(currentPage - 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">Previous</Link>}
            {currentPage < totalPages && <Link href={queryForPage(currentPage + 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">Next</Link>}
          </div>
        </nav>}
      </section>
    </>}

    {tooManyPayments && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      {paymentCount.toLocaleString()} payments match these dates, above the {MAX_REPORT_PAYMENTS.toLocaleString()} payment report limit. Narrow the date range, campus, or payment method.
    </p>}
  </main>;
}
