import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowLeft } from "lucide-react";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { formatCurrencyAmount } from "@/lib/currency";
import { getOrganizationCurrencyConfig } from "@/lib/currency/settings";
import { PrintInvoiceButton } from "../../../print-invoice-button";

export const metadata = { title: "Payment receipt · ThinkSales Pro" };

export default async function ServiceInvoiceReceiptPage({
  params,
}: {
  params: Promise<{ id: string; paymentId: string }>;
}) {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const { id, paymentId } = await params;
  const supabase = await createClient();
  const [{ data: payment, error: paymentError }, currencyConfig] = await Promise.all([
    supabase.from("service_invoice_payments")
      .select("id, invoice_id, job_id, amount, payment_method, payment_date, balance_after, notes, created_at")
      .eq("org_id", context.orgId)
      .eq("invoice_id", id)
      .eq("id", paymentId)
      .maybeSingle(),
    getOrganizationCurrencyConfig(),
  ]);
  if (paymentError) throw new Error(`Unable to load payment receipt: ${paymentError.message}`);
  if (!payment) {
    return (
      <div className="mx-auto max-w-3xl rounded-xl border border-dashed border-ledger-200 bg-white p-10 text-center dark:border-ledger-700 dark:bg-ink-900">
        <p className="text-sm text-ledger-500 dark:text-ledger-400">Payment receipt not found.</p>
        <Link href={`/accounting/invoices/${id}`} className="mt-4 inline-block text-sm font-medium text-amber-700 hover:underline dark:text-amber-300">Back to invoice</Link>
      </div>
    );
  }

  const { data: invoice, error: invoiceError } = await supabase.from("invoices")
    .select("invoice_number, customer_name, amount, source_service_job_id")
    .eq("org_id", context.orgId)
    .eq("id", payment.invoice_id)
    .maybeSingle();
  if (invoiceError) throw new Error(`Unable to load the invoice for this receipt: ${invoiceError.message}`);
  if (!invoice || invoice.source_service_job_id !== payment.job_id) {
    return (
      <div className="mx-auto max-w-3xl rounded-xl border border-dashed border-ledger-200 bg-white p-10 text-center dark:border-ledger-700 dark:bg-ink-900">
        <p className="text-sm text-ledger-500 dark:text-ledger-400">Payment receipt not found.</p>
      </div>
    );
  }

  const balanceBefore = Number(payment.balance_after) + Number(payment.amount);
  const amountDueAfterPayment = Math.max(0, Number(payment.balance_after));

  return (
    <main className="mx-auto max-w-3xl space-y-6 print:max-w-none print:space-y-0">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link href={`/accounting/invoices/${id}`} className="inline-flex items-center gap-1 text-sm text-ledger-500 hover:text-ink-900 dark:hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to invoice
        </Link>
        <PrintInvoiceButton />
      </div>

      <article className="rounded-xl border border-ledger-200 bg-white p-8 shadow-sm dark:border-ledger-700 dark:bg-ink-900 print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-ledger-200 pb-6 dark:border-ledger-700 print:border-slate-300">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300 print:text-slate-700">{context.orgName}</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink-900 dark:text-white print:text-black">Payment receipt</h1>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-ink-900 dark:text-white print:text-black">Receipt {payment.id.slice(0, 8).toUpperCase()}</p>
            <p className="mt-1 text-sm text-ledger-500 dark:text-ledger-400 print:text-slate-600">Invoice #{String(invoice.invoice_number).padStart(4, "0")}</p>
          </div>
        </header>

        <section className="grid gap-6 py-6 sm:grid-cols-2">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ledger-500 dark:text-ledger-400 print:text-slate-500">Received from</h2>
            <p className="mt-2 font-medium text-ink-900 dark:text-white print:text-black">{invoice.customer_name}</p>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:justify-self-end">
            <dt className="text-ledger-500 dark:text-ledger-400 print:text-slate-500">Payment date</dt>
            <dd className="text-right text-ink-900 dark:text-white print:text-black">{new Date(`${payment.payment_date}T00:00:00`).toLocaleDateString()}</dd>
            <dt className="text-ledger-500 dark:text-ledger-400 print:text-slate-500">Payment method</dt>
            <dd className="text-right text-ink-900 dark:text-white print:text-black">{payment.payment_method}</dd>
          </dl>
        </section>

        <section className="border-y border-ledger-200 py-5 dark:border-ledger-700 print:border-slate-300">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <dt className="text-ledger-500 dark:text-ledger-400 print:text-slate-500">Invoice total</dt>
            <dd className="text-right text-ink-900 dark:text-white print:text-black">{formatCurrencyAmount(invoice.amount, currencyConfig)}</dd>
            <dt className="text-ledger-500 dark:text-ledger-400 print:text-slate-500">Balance before payment</dt>
            <dd className="text-right text-ink-900 dark:text-white print:text-black">{formatCurrencyAmount(balanceBefore, currencyConfig)}</dd>
            <dt className="font-semibold text-ink-900 dark:text-white print:text-black">Payment received</dt>
            <dd className="text-right font-semibold text-ink-900 dark:text-white print:text-black">{formatCurrencyAmount(payment.amount, currencyConfig)}</dd>
            <dt className="font-semibold text-ledger-700 dark:text-ledger-200 print:text-black">Balance after payment</dt>
            <dd className="text-right font-semibold text-ink-900 dark:text-white print:text-black">{formatCurrencyAmount(amountDueAfterPayment, currencyConfig)}</dd>
          </dl>
        </section>

        {payment.notes && (
          <section className="pt-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ledger-500 dark:text-ledger-400 print:text-slate-500">Notes</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-ink-900 dark:text-white print:text-black">{payment.notes}</p>
          </section>
        )}
        <p className="mt-8 text-xs text-ledger-400 dark:text-ledger-500 print:text-slate-500">
          Recorded {new Date(payment.created_at).toLocaleString()}
        </p>
      </article>
    </main>
  );
}
