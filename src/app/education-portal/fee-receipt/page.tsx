import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { educationGuardianFeePaymentsSchema } from "@/lib/education/guardian-fee-payments";
import { createClient } from "@/lib/supabase/server";
import { PrintFeeReceiptButton } from "./print-button";

export const dynamic = "force-dynamic";

const paymentIdSchema = z.string().uuid();

export default async function GuardianFeeReceiptPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(`Could not verify the account for this payment receipt: ${userError.message}`);
  if (!user) redirect("/education-portal");

  const params = await searchParams;
  const paymentId = typeof params.paymentId === "string" ? paymentIdSchema.safeParse(params.paymentId) : null;
  if (!paymentId?.success) notFound();

  const { data, error } = await supabase.rpc("education_get_guardian_fee_payment_receipts", {
    p_payment_id: paymentId.data,
  });
  if (error) {
    if (error.code === "42501") notFound();
    console.error("Guardian fee receipt lookup failed.", { userId: user.id });
    throw new Error("The payment receipt could not be loaded. Please try again.");
  }
  const parsedPayments = educationGuardianFeePaymentsSchema.safeParse(data);
  if (!parsedPayments.success) {
    console.error("Guardian fee receipt returned unexpected data.", { userId: user.id });
    throw new Error("The payment receipt could not be safely displayed.");
  }
  const [payment] = parsedPayments.data;
  if (!payment || parsedPayments.data.length !== 1) notFound();
  const formattedAmount = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: payment.currency_code,
  }).format(payment.amount);

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6 text-slate-900">
      <div className="flex items-center justify-between gap-4 print:hidden">
        <a href="/education-portal" className="text-sm font-semibold text-blue-700 hover:text-blue-900">Back to parent portal</a>
        <PrintFeeReceiptButton />
      </div>
      <article className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm print:border-0 print:p-0 print:shadow-none">
        <header className="border-b border-slate-200 pb-5">
          <p className="text-sm font-medium text-blue-700">{payment.school_name}</p>
          <h1 className="mt-2 text-2xl font-bold">Fee payment receipt</h1>
          <p className="mt-2 text-sm text-slate-600">Recorded {new Date(payment.paid_at).toLocaleString()}</p>
        </header>
        <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Student</dt>
            <dd className="mt-1 font-medium">{payment.student_name}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Fee</dt>
            <dd className="mt-1 font-medium">{payment.fee_description}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Amount recorded</dt>
            <dd className="mt-1 text-lg font-semibold">{formattedAmount}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Payment method</dt>
            <dd className="mt-1 font-medium capitalize">{payment.payment_method.replaceAll("_", " ")}</dd>
          </div>
          {payment.reference && (
            <div className="sm:col-span-2">
              <dt className="text-slate-500">Reference</dt>
              <dd className="mt-1 break-all font-medium">{payment.reference}</dd>
            </div>
          )}
          <div className="sm:col-span-2">
            <dt className="text-slate-500">Payment record ID</dt>
            <dd className="mt-1 break-all font-mono text-xs">{payment.payment_id}</dd>
          </div>
        </dl>
        <p className="mt-8 border-t border-slate-200 pt-4 text-xs leading-5 text-slate-500">
          This receipt reflects a payment recorded in the school portal. Contact the school if any details need correction.
        </p>
      </article>
    </main>
  );
}
