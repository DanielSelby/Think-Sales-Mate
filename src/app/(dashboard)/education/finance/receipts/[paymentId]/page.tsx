import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { formatCurrencyAmount } from "@/lib/currency";
import { getOrganizationCurrencyConfig } from "@/lib/currency/settings";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import PrintReceiptButton from "../../print-receipt-button";
import styles from "./receipt.module.css";

export default async function EducationFeeReceiptPage({
  params,
}: {
  params: Promise<{ paymentId: string }>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  const [canViewPayments, canPrintReceipts, canViewStudents, canViewAcademicYears] = await Promise.all([
    canTabPermission("education_finance", "finance", "payments", "view"),
    canTabPermission("education_finance", "finance", "payments", "print"),
    canTabPermission("education_students", "students", "list", "view"),
    canTabPermission("education_academics", "academics", "calendar", "view"),
  ]);
  if (!canViewPayments || !canPrintReceipts || !canViewStudents || !canViewAcademicYears) {
    redirect("/dashboard?accessDenied=think-education.finance.receipt");
  }

  const { paymentId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(paymentId)) {
    notFound();
  }

  const supabase = await createClient();
  const { data: payment, error: paymentError } = await supabase.from("education_fee_payments")
    .select("id, charge_id, amount, payment_method, reference, created_at")
    .eq("org_id", context.orgId)
    .eq("id", paymentId)
    .maybeSingle();
  if (paymentError) throw new Error(`Could not load the Think Education payment receipt: ${paymentError.message}`);
  if (!payment) notFound();

  const { data: charge, error: chargeError } = await supabase.from("education_fee_charges")
    .select("id, branch_id, student_id, academic_year_id, description, amount, status, due_on")
    .eq("org_id", context.orgId)
    .eq("id", payment.charge_id)
    .maybeSingle();
  if (chargeError) throw new Error(`Could not load the fee charge for this receipt: ${chargeError.message}`);
  if (!charge) notFound();

  const [
    { data: student, error: studentError },
    { data: academicYear, error: academicYearError },
    { data: organization, error: organizationError },
    { data: chargePayments, error: paymentsError },
  ] = await Promise.all([
    supabase.from("education_students")
      .select("id, branch_id, student_number, first_name, last_name")
      .eq("org_id", context.orgId)
      .eq("branch_id", charge.branch_id)
      .eq("id", charge.student_id)
      .maybeSingle(),
    supabase.from("education_academic_years")
      .select("id, name")
      .eq("org_id", context.orgId)
      .eq("id", charge.academic_year_id)
      .maybeSingle(),
    supabase.from("organizations")
      .select("name, currency")
      .eq("id", context.orgId)
      .single(),
    supabase.from("education_fee_payments")
      .select("amount")
      .eq("org_id", context.orgId)
      .eq("charge_id", charge.id),
  ]);
  if (studentError) throw new Error(`Could not load the student for this receipt: ${studentError.message}`);
  if (academicYearError) throw new Error(`Could not load the academic year for this receipt: ${academicYearError.message}`);
  if (organizationError) throw new Error(`Could not load organization details for this receipt: ${organizationError.message}`);
  if (paymentsError) throw new Error(`Could not calculate the fee balance for this receipt: ${paymentsError.message}`);
  if (!student || !academicYear) notFound();

  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const campusName = campuses.find((campus) => campus.id === charge.branch_id)?.name ?? "Campus";
  const totalPaid = (chargePayments ?? []).reduce((sum, record) => sum + record.amount, 0);
  const balance = Math.max(0, charge.amount - totalPaid);
  const receiptNumber = `TE-${payment.id.toUpperCase()}`;
  const currencyConfig = await getOrganizationCurrencyConfig();
  const formatMoney = (amount: number) => formatCurrencyAmount(amount, currencyConfig);

  return <main className="mx-auto max-w-3xl space-y-5 p-4 md:p-8 print:max-w-none print:p-0">
    <div className="print:hidden">
      <Link href={getProductAppPath("think-education", "/finance")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
        <ArrowLeft className="h-4 w-4" /> Fees & Finance
      </Link>
    </div>
    <article className={`${styles.printReceipt} overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm print:rounded-none print:border-0 print:shadow-none`}>
      <header className="bg-gradient-to-r from-blue-950 via-blue-900 to-indigo-800 px-6 py-7 text-white md:px-10 print:bg-blue-950">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-200">Think Education · Official receipt</p>
            <h1 className="mt-3 text-2xl font-bold tracking-tight md:text-3xl">{organization.name}</h1>
            <p className="mt-1 text-sm text-blue-100">{campusName}</p>
          </div>
          <div className="min-w-40 rounded-xl border border-white/20 bg-white/10 px-4 py-3 md:text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-100">Amount received</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{formatMoney(payment.amount)}</p>
          </div>
        </div>
      </header>

      <div className="space-y-7 p-6 md:p-10">
        <section className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Receipt number</p>
            <p className="mt-1 break-all font-mono text-sm font-semibold text-slate-900">{receiptNumber}</p>
          </div>
          <div className="text-sm md:text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payment date</p>
            <p className="mt-1 font-medium text-slate-900">{new Date(payment.created_at).toLocaleString()}</p>
            <span className="mt-2 inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold capitalize text-emerald-800">{balance > 0 ? "Partial payment" : "Paid in full"}</span>
          </div>
        </section>

        <section className="grid gap-5 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Student</h2>
            <p className="mt-2 text-lg font-bold text-slate-950">{student.first_name} {student.last_name}</p>
            <p className="mt-1 text-sm text-slate-600">Student number: {student.student_number}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payment details</h2>
            <p className="mt-2 text-sm text-slate-800"><span className="font-medium">Academic year:</span> {academicYear.name}</p>
            <p className="mt-1 text-sm capitalize text-slate-700"><span className="font-medium">Method:</span> {payment.payment_method.replace(/_/g, " ")}</p>
            {payment.reference && <p className="mt-1 break-words text-sm text-slate-700"><span className="font-medium">Reference:</span> {payment.reference}</p>}
          </div>
        </section>

        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fee payment</h2>
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
            <div className="grid grid-cols-[1fr_auto] gap-4 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span>Description</span><span>Applied</span>
            </div>
            <div className="grid grid-cols-[1fr_auto] items-start gap-4 px-4 py-5 text-sm">
              <div>
                <p className="font-semibold text-slate-950">{charge.description}</p>
                <p className="mt-1 text-slate-600">{charge.due_on ? `Due ${charge.due_on}` : "No due date"}</p>
              </div>
              <span className="font-bold tabular-nums text-slate-950">{formatMoney(payment.amount)}</span>
            </div>
          </div>
        </section>

        <section className="ml-auto max-w-sm rounded-xl border border-slate-200 p-4 text-sm">
          <div className="flex justify-between gap-4 text-slate-600"><span>Total charge</span><span className="tabular-nums">{formatMoney(charge.amount)}</span></div>
          <div className="mt-2 flex justify-between gap-4 text-slate-600"><span>Total paid</span><span className="tabular-nums">{formatMoney(totalPaid)}</span></div>
          <div className="mt-3 flex justify-between gap-4 border-t border-slate-200 pt-3 font-bold text-slate-950"><span>Balance remaining</span><span className="tabular-nums">{formatMoney(balance)}</span></div>
        </section>

        <footer className="border-t border-slate-200 pt-5 text-center text-xs leading-5 text-slate-500">
          <p className="font-medium text-slate-700">Thank you. This receipt confirms payment received by {organization.name}.</p>
          <p className="mt-1">Keep this receipt for your records. Please contact the school if any payment detail is incorrect.</p>
        </footer>
      </div>
    </article>
    <div className="flex justify-end print:hidden"><PrintReceiptButton label="Print / Save receipt" /></div>
  </main>;
}
