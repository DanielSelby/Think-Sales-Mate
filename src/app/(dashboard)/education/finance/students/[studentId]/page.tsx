import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import PrintReceiptButton from "../../print-receipt-button";

const PAGE_SIZE = 50;

type PaymentRecord = {
  id: string;
  charge_id: string;
  amount: number;
  payment_method: string;
  reference: string | null;
  created_at: string;
};

export default async function EducationStudentFeeStatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");

  const [canViewCharges, canViewPayments, canViewStudents, canViewAcademicYears, canPrint, canPrintReceipts] = await Promise.all([
    canTabPermission("education_finance", "finance", "charges", "view"),
    canTabPermission("education_finance", "finance", "payments", "view"),
    canTabPermission("education_students", "students", "list", "view"),
    canTabPermission("education_academics", "academics", "calendar", "view"),
    canTabPermission("education_finance", "finance", "charges", "print"),
    canTabPermission("education_finance", "finance", "payments", "print"),
  ]);
  if (!canViewCharges || !canViewPayments || !canViewStudents || !canViewAcademicYears) {
    redirect("/dashboard?accessDenied=think-education.finance.statement");
  }

  const [{ studentId }, queryParams] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(studentId)) {
    notFound();
  }
  const requestedYear = typeof queryParams.year === "string" ? queryParams.year : "";
  const currentPage = Math.min(1_000_000, Math.max(1, Number.parseInt(
    typeof queryParams.page === "string" ? queryParams.page : "1", 10
  ) || 1));
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const campusIds = campuses.map((campus) => campus.id);
  if (!campusIds.length) notFound();

  const supabase = await createClient();
  const [
    { data: student, error: studentError },
    { data: academicYears, error: yearsError },
    { data: organization, error: organizationError },
  ] = await Promise.all([
    supabase.from("education_students")
      .select("id, branch_id, student_number, first_name, last_name, status")
      .eq("org_id", context.orgId)
      .in("branch_id", campusIds)
      .eq("id", studentId)
      .maybeSingle(),
    supabase.from("education_academic_years")
      .select("id, name")
      .eq("org_id", context.orgId)
      .order("starts_on", { ascending: false }),
    supabase.from("organizations")
      .select("name, currency")
      .eq("id", context.orgId)
      .single(),
  ]);
  if (studentError) throw new Error(`Could not load student details for the fee statement: ${studentError.message}`);
  if (yearsError) throw new Error(`Could not load academic years for the fee statement: ${yearsError.message}`);
  if (organizationError) throw new Error(`Could not load organization details for the fee statement: ${organizationError.message}`);
  if (!student) notFound();

  const yearIdSet = new Set((academicYears ?? []).map((year) => year.id));
  const selectedYear = yearIdSet.has(requestedYear) ? requestedYear : "";
  let chargesQuery = supabase.from("education_fee_charges")
    .select("id, academic_year_id, description, amount, due_on, status, created_at", { count: "exact" })
    .eq("org_id", context.orgId)
    .eq("branch_id", student.branch_id)
    .eq("student_id", student.id)
    .order("created_at", { ascending: false })
    .range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1);
  if (selectedYear) chargesQuery = chargesQuery.eq("academic_year_id", selectedYear);
  const { data: charges, count, error: chargesError } = await chargesQuery;
  if (chargesError) throw new Error(`Could not load the student's fee statement: ${chargesError.message}`);

  const rows = charges ?? [];
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const pageUrl = (page: number) => {
    const next = new URLSearchParams();
    if (selectedYear) next.set("year", selectedYear);
    if (page > 1) next.set("page", String(page));
    const query = next.toString();
    return `${getProductAppPath("think-education", `/finance/students/${student.id}`)}${query ? `?${query}` : ""}`;
  };
  if (currentPage > totalPages) redirect(pageUrl(totalPages));

  const chargeIds = rows.map((charge) => charge.id);
  let payments: PaymentRecord[] = [];
  if (chargeIds.length) {
    const { data, error } = await supabase.from("education_fee_payments")
      .select("id, charge_id, amount, payment_method, reference, created_at")
      .eq("org_id", context.orgId)
      .in("charge_id", chargeIds)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`Could not load payments for the fee statement: ${error.message}`);
    payments = (data ?? []) as PaymentRecord[];
  }

  const paidByCharge = new Map<string, number>();
  const paymentsByCharge = new Map<string, PaymentRecord[]>();
  for (const payment of payments) {
    paidByCharge.set(payment.charge_id, (paidByCharge.get(payment.charge_id) ?? 0) + payment.amount);
    paymentsByCharge.set(payment.charge_id, [...(paymentsByCharge.get(payment.charge_id) ?? []), payment]);
  }
  const yearNameById = new Map((academicYears ?? []).map((year) => [year.id, year.name]));
  const campus = campuses.find((item) => item.id === student.branch_id);
  const totalBilled = rows.filter((charge) => charge.status === "open").reduce((sum, charge) => sum + charge.amount, 0);
  const totalPaid = rows.filter((charge) => charge.status === "open")
    .reduce((sum, charge) => sum + (paidByCharge.get(charge.id) ?? 0), 0);
  const balance = Math.max(0, totalBilled - totalPaid);
  const formatMoney = (amount: number) => `${organization.currency} ${amount.toFixed(2)}`;

  return <main className="mx-auto max-w-5xl space-y-5 p-4 md:p-8 print:max-w-none print:p-0">
    <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
      <Link href={getProductAppPath("think-education", "/finance")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
        <ArrowLeft className="h-4 w-4" /> Fees & Finance
      </Link>
      {canPrint && <PrintReceiptButton label="Print statement" />}
    </div>

    <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm print:border-0 print:p-0 print:shadow-none">
      <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">{organization.name} · Student fee statement</p>
      <h1 className="mt-2 text-2xl font-bold text-slate-950">{student.first_name} {student.last_name}</h1>
      <p className="mt-1 text-sm text-slate-600">Student number: {student.student_number} · {campus?.name ?? "Campus"} · {student.status.replace(/_/g, " ")}</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {[
          ["Charges on this page", formatMoney(totalBilled)],
          ["Payments on this page", formatMoney(totalPaid)],
          ["Outstanding on this page", formatMoney(balance)],
        ].map(([label, amount]) => <div key={label} className="rounded-lg bg-slate-50 p-3 print:border print:border-slate-200">
          <p className="text-xs text-slate-500">{label}</p>
          <p className="mt-1 text-lg font-bold text-slate-950">{amount}</p>
        </div>)}
      </div>
      {totalPages > 1 && <p className="mt-3 text-xs text-slate-500">Balances above cover this page only. Use the page controls to review other charges.</p>}
    </header>

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm print:border-0 print:shadow-none">
      <form method="get" action={getProductAppPath("think-education", `/finance/students/${student.id}`)} className="flex flex-wrap items-end gap-3 border-b border-slate-200 p-4 print:hidden">
        <label className="text-sm font-medium text-slate-700">Academic year
          <select name="year" defaultValue={selectedYear} className="mt-1 block min-w-48 rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">All academic years</option>
            {(academicYears ?? []).map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}
          </select>
        </label>
        <button type="submit" className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100">Apply filter</button>
      </form>

      {rows.length ? <div className="divide-y divide-slate-100">
        {rows.map((charge) => {
          const paid = paidByCharge.get(charge.id) ?? 0;
          const due = charge.status === "open" ? Math.max(0, charge.amount - paid) : 0;
          const chargePayments = paymentsByCharge.get(charge.id) ?? [];
          return <article key={charge.id} className="space-y-3 p-4 md:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-950">{charge.description}</h2>
                <p className="mt-1 text-sm text-slate-600">{yearNameById.get(charge.academic_year_id) ?? "Academic year"} · {new Date(charge.created_at).toLocaleDateString()}</p>
                {charge.due_on && <p className="mt-1 text-xs text-slate-500">Due {charge.due_on}</p>}
              </div>
              <div className="text-right text-sm">
                <p className="font-semibold text-slate-950">{formatMoney(charge.amount)}</p>
                <p className="mt-1 text-slate-600">Paid {formatMoney(paid)} · Balance {formatMoney(due)}</p>
                {charge.status === "void" && <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">Voided</span>}
              </div>
            </div>
            {chargePayments.length > 0 && <ul className="space-y-2 border-t border-slate-100 pt-3 text-sm">
              {chargePayments.map((payment) => <li key={payment.id} className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-slate-600">
                <span>{new Date(payment.created_at).toLocaleString()} · {payment.payment_method.replace(/_/g, " ")}{payment.reference ? ` · ${payment.reference}` : ""}</span>
                <span className="flex items-center gap-3">
                  <span className="font-medium text-slate-800">{formatMoney(payment.amount)}</span>
                  {canPrintReceipts && <Link href={getProductAppPath("think-education", `/finance/receipts/${payment.id}`)} className="font-semibold text-blue-700 hover:text-blue-900 print:hidden">Receipt</Link>}
                </span>
              </li>)}
            </ul>}
          </article>;
        })}
      </div> : <p className="p-8 text-center text-sm text-slate-500">No fee charges found for this student and academic year.</p>}

      {totalCount > 0 && <nav aria-label="Statement pages" className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm print:hidden">
        <p className="text-slate-500">Showing {Math.min(totalCount, (currentPage - 1) * PAGE_SIZE + 1)}–{Math.min(totalCount, currentPage * PAGE_SIZE)} of {totalCount} charges</p>
        <div className="flex gap-2">
          {currentPage > 1 && <Link href={pageUrl(currentPage - 1)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"><ChevronLeft className="h-4 w-4" /> Previous</Link>}
          {currentPage < totalPages && <Link href={pageUrl(currentPage + 1)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">Next <ChevronRight className="h-4 w-4" /></Link>}
        </div>
      </nav>}
    </section>
  </main>;
}
