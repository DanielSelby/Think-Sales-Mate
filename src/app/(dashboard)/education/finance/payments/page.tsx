import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, CreditCard, Receipt } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { formatCurrencyAmount } from "@/lib/currency";
import { getOrganizationCurrencyConfig } from "@/lib/currency/settings";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import { FeePaymentDialog } from "../../students/[studentId]/fee-payment-dialog";

type PaymentRecord = {
  id: string;
  charge_id: string;
  amount: number;
  payment_method: string;
  reference: string | null;
  created_at: string;
};

const PAGE_SIZE = 50;

export default async function EducationFeePaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  const [canView, canCreate] = await Promise.all([
    canTabPermission("education_finance", "finance", "payments", "view"),
    canTabPermission("education_finance", "finance", "payments", "create"),
  ]);
  if (!canView) redirect("/dashboard?accessDenied=think-education.finance");

  const params = await searchParams;
  const currentPage = Math.max(1, Number.parseInt(typeof params.page === "string" ? params.page : "1", 10) || 1);
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const branchIds = campuses.map((campus) => campus.id);
  const supabase = await createClient();
  const [canPrint, canViewStudents, canViewAcademicYears] = await Promise.all([
    canTabPermission("education_finance", "finance", "payments", "print"),
    canTabPermission("education_students", "students", "list", "view"),
    canTabPermission("education_academics", "academics", "calendar", "view"),
  ]);
  const canPrintReceipts = canPrint && canViewStudents && canViewAcademicYears;
  const [{ data: openCharges, error: chargesError }, { data: payments, count: paymentCount, error: paymentsError }, currencyConfig] = await Promise.all([
    branchIds.length
      ? supabase.rpc("education_get_open_fee_charge_balances", {
        p_org_id: context.orgId,
        p_branch_ids: branchIds,
        p_limit: 1000,
      })
      : Promise.resolve({ data: [], error: null }),
    branchIds.length
      ? supabase.from("education_fee_payments")
        .select("id, charge_id, amount, payment_method, reference, created_at", { count: "exact" })
        .eq("org_id", context.orgId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1)
      : Promise.resolve({ data: [], count: 0, error: null }),
    getOrganizationCurrencyConfig(),
  ]);
  if (chargesError) throw new Error(`Could not load fee charges for payments: ${chargesError.message}`);
  if (paymentsError) throw new Error(`Could not load fee payment history: ${paymentsError.message}`);

  const paymentRows = (payments ?? []) as PaymentRecord[];
  const currentOpenCharges = openCharges ?? [];
  const pageCount = Math.max(1, Math.ceil((paymentCount ?? 0) / PAGE_SIZE));
  if (currentPage > pageCount) redirect(`${getProductAppPath("think-education", "/finance/payments")}?page=${pageCount}`);
  const allRelevantChargeIds = [...new Set([
    ...currentOpenCharges.map((charge) => charge.id),
    ...paymentRows.map((payment) => payment.charge_id),
  ])];
  const { data: chargeRows, error: relevantChargesError } = allRelevantChargeIds.length
    ? await supabase.from("education_fee_charges")
      .select("id, branch_id, student_id, description, amount, status, created_at")
      .eq("org_id", context.orgId)
      .in("id", allRelevantChargeIds)
    : { data: [], error: null };
  if (relevantChargesError) throw new Error(`Could not load fee charge details: ${relevantChargesError.message}`);
  const studentIds = [...new Set((chargeRows ?? []).map((charge) => charge.student_id))];
  const { data: students, error: studentsError } = studentIds.length
    ? await supabase.from("education_students")
      .select("id, branch_id, student_number, first_name, last_name")
      .eq("org_id", context.orgId)
      .in("id", studentIds)
    : { data: [], error: null };
  if (studentsError) throw new Error(`Could not load students for fee payments: ${studentsError.message}`);

  const chargeById = new Map((chargeRows ?? []).map((charge) => [charge.id, charge]));
  const studentById = new Map((students ?? []).map((student) => [student.id, student]));
  const payableCharges = currentOpenCharges.flatMap((charge) => {
    const student = studentById.get(charge.student_id);
    const balance = Number(charge.balance);
    return balance > 0 && student ? [{
      id: charge.id,
      studentId: student.id,
      studentName: `${student.first_name} ${student.last_name} · ${student.student_number}`,
      description: charge.description,
      balance,
    }] : [];
  });
  const studentName = (chargeId: string) => {
    const charge = chargeById.get(chargeId);
    const student = charge ? studentById.get(charge.student_id) : undefined;
    return student ? `${student.first_name} ${student.last_name} · ${student.student_number}` : "Student";
  };
  const formatMoney = (amount: number) => formatCurrencyAmount(amount, currencyConfig);
  const pageHref = (page: number) => `${getProductAppPath("think-education", "/finance/payments")}?page=${page}`;
  const paymentError = typeof params.error === "string" ? params.error : "";
  const paymentErrorMessage = paymentError === "invalid"
    ? "Check the payment amount, payment method, and selected fee charge."
    : paymentError === "accounting-mapping"
      ? "Configure the required campus account mappings before recording this payment."
      : paymentError === "accounting-period"
        ? "The payment date is outside an open accounting period."
        : paymentError === "not-found"
          ? "The selected fee charge could not be found."
          : "The payment could not be recorded. Please try again.";

  return <main className="mx-auto max-w-[1400px] space-y-5 p-4 md:p-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <Link href={getProductAppPath("think-education", "/finance")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900"><ArrowLeft className="h-4 w-4" /> Fees & Finance</Link>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">Fee Payments</h1>
        <p className="mt-1 text-sm text-slate-600">Record any student fee payment and review payment history in one place.</p>
      </div>
      {canCreate && payableCharges.length > 0 && <FeePaymentDialog charges={payableCharges} studentId="" studentName="" currencyConfig={currencyConfig} returnToPayments buttonLabel="Record fee payment" />}
    </header>
    {params.paid === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Payment recorded and receipt reference generated.</p>}
    {paymentError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{paymentErrorMessage}</p>}
    {canCreate && payableCharges.length === 0 && <p className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">There are no outstanding fee charges to receive payment against. Create a fee charge first from <Link href={getProductAppPath("think-education", "/finance")} className="font-semibold underline">Fees & Finance</Link>.</p>}

    <section className="grid gap-3 sm:grid-cols-3">
      {[["Payments recorded", (paymentCount ?? 0).toLocaleString()], ["Collected on this page", formatMoney(paymentRows.reduce((sum, payment) => sum + payment.amount, 0))], ["Outstanding charges", payableCharges.length.toLocaleString()]].map(([label, value]) => <article key={String(label)} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-950">{value}</p></article>)}
    </section>

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-200 p-4"><Receipt className="h-5 w-5 text-blue-700" /><h2 className="font-semibold text-slate-950">Payment history</h2></div>
      {paymentRows.length ? <><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Student</th><th className="px-4 py-3">Fee</th><th className="px-4 py-3">Method</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3 text-right">Amount</th>{canPrintReceipts && <th className="px-4 py-3">Receipt</th>}</tr></thead><tbody className="divide-y divide-slate-100">{paymentRows.map((payment) => <tr key={payment.id}><td className="px-4 py-3 text-slate-500">{new Date(payment.created_at).toLocaleString()}</td><td className="px-4 py-3 font-medium text-slate-900">{studentName(payment.charge_id)}</td><td className="px-4 py-3 text-slate-600">{chargeById.get(payment.charge_id)?.description ?? "Fee charge"}</td><td className="px-4 py-3 capitalize text-slate-600">{payment.payment_method.replace("_", " ")}</td><td className="px-4 py-3 text-slate-500">{payment.reference ?? "—"}</td><td className="px-4 py-3 text-right font-semibold text-slate-900">{formatMoney(payment.amount)}</td>{canPrintReceipts && <td className="px-4 py-3"><Link href={getProductAppPath("think-education", `/finance/receipts/${payment.id}`)} className="font-semibold text-blue-700 hover:underline">View receipt</Link></td>}</tr>)}</tbody></table></div>
        {(paymentCount ?? 0) > PAGE_SIZE && <nav aria-label="Fee payment pages" className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm"><span className="text-slate-500">Page {currentPage} of {pageCount} · {paymentCount} payments</span><div className="flex gap-2">{currentPage > 1 && <Link href={pageHref(currentPage - 1)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"><ChevronLeft className="h-4 w-4" /> Previous</Link>}{currentPage < pageCount && <Link href={pageHref(currentPage + 1)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">Next <ChevronRight className="h-4 w-4" /></Link>}</div></nav>}
      </> : <div className="p-10 text-center"><CreditCard className="mx-auto h-10 w-10 text-slate-300" /><p className="mt-3 font-medium text-slate-800">No fee payments recorded yet</p><p className="mt-1 text-sm text-slate-500">Use Record fee payment to record a payment against any outstanding student charge.</p></div>}
    </section>
  </main>;
}
