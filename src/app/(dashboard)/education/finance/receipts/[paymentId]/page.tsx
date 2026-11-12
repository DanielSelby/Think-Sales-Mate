import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import PrintReceiptButton from "../../print-receipt-button";

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
  const formatMoney = (amount: number) => `${organization.currency} ${amount.toFixed(2)}`;

  return <main className="mx-auto max-w-3xl space-y-5 p-4 md:p-8 print:max-w-none print:p-0">
    <div className="print:hidden">
      <Link href={getProductAppPath("think-education", "/finance")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
        <ArrowLeft className="h-4 w-4" /> Fees & Finance
      </Link>
    </div>
    <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-10 print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <header className="flex flex-wrap items-start justify-between gap-5 border-b border-slate-200 pb-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">Think Education · Payment receipt</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-950">{organization.name}</h1>
          <p className="mt-1 text-sm text-slate-600">{campusName}</p>
        </div>
        <div className="text-sm md:text-right">
          <p className="font-semibold text-slate-900">Receipt number</p>
          <p className="mt-1 break-all font-mono text-xs text-slate-600">{receiptNumber}</p>
          <p className="mt-2 text-slate-600">{new Date(payment.created_at).toLocaleString()}</p>
        </div>
      </header>

      <section className="grid gap-5 border-b border-slate-200 py-6 sm:grid-cols-2">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Received from</h2>
          <p className="mt-2 font-semibold text-slate-950">{student.first_name} {student.last_name}</p>
          <p className="mt-1 text-sm text-slate-600">Student number: {student.student_number}</p>
        </div>
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payment details</h2>
          <p className="mt-2 text-sm text-slate-800">Academic year: {academicYear.name}</p>
          <p className="mt-1 text-sm capitalize text-slate-600">Method: {payment.payment_method.replace(/_/g, " ")}</p>
          {payment.reference && <p className="mt-1 break-words text-sm text-slate-600">Reference: {payment.reference}</p>}
        </div>
      </section>

      <section className="py-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payment applied to</h2>
        <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
          <div className="grid grid-cols-[1fr_auto] gap-4 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
            <span>Description</span><span>Amount</span>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-4 px-4 py-4 text-sm">
            <div>
              <p className="font-medium text-slate-900">{charge.description}</p>
              {charge.due_on && <p className="mt-1 text-slate-500">Due {charge.due_on}</p>}
            </div>
            <span className="font-semibold text-slate-900">{formatMoney(payment.amount)}</span>
          </div>
        </div>
      </section>

      <section className="ml-auto max-w-sm space-y-2 border-t border-slate-200 pt-4 text-sm">
        <div className="flex justify-between gap-4 text-slate-600"><span>Total charge</span><span>{formatMoney(charge.amount)}</span></div>
        <div className="flex justify-between gap-4 text-slate-600"><span>Total paid</span><span>{formatMoney(totalPaid)}</span></div>
        <div className="flex justify-between gap-4 border-t border-slate-200 pt-3 text-base font-bold text-slate-950"><span>Balance remaining</span><span>{formatMoney(balance)}</span></div>
      </section>

      <footer className="mt-10 border-t border-slate-200 pt-5 text-center text-xs text-slate-500">
        This receipt confirms payment received for the fee listed above.
      </footer>
    </article>
    <div className="flex justify-end"><PrintReceiptButton /></div>
  </main>;
}
