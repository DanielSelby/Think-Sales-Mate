import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowLeft } from "lucide-react";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { formatCurrencyAmount } from "@/lib/currency";
import { getOrganizationCurrencyConfig } from "@/lib/currency/settings";
import { canPermission, canTabPermission } from "@/lib/rbac/permissions";
import { ServiceInvoicePaymentForm } from "@/components/accounting/service-invoice-payment-form";
import { PrintInvoiceButton } from "../print-invoice-button";

export const metadata = { title: "Invoice · ThinkSales Pro" };

export default async function InvoiceDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const { id } = await params;
  const supabase = await createClient();
  const [{ data: invoice, error: invoiceError }, currencyConfig] = await Promise.all([
    supabase.from("invoices")
      .select("id, invoice_number, customer_name, amount, amount_paid, status, due_date, paid_at, source_catering_event_id, source_service_job_id, source_service_quotation_id, created_at")
      .eq("org_id", context.orgId)
      .eq("id", id)
      .maybeSingle(),
    getOrganizationCurrencyConfig(),
  ]);
  if (invoiceError) throw new Error(`Unable to load invoice: ${invoiceError.message}`);
  if (!invoice) {
    return (
      <div className="mx-auto max-w-3xl rounded-xl border border-dashed border-ledger-200 bg-white p-10 text-center dark:border-ledger-700 dark:bg-ink-900">
        <p className="text-sm text-ledger-500 dark:text-ledger-400">Invoice not found.</p>
        <Link href="/accounting/invoices" className="mt-4 inline-block text-sm font-medium text-amber-700 hover:underline dark:text-amber-300">Back to invoices</Link>
      </div>
    );
  }

  let serviceJobNumber: string | null = null;
  let canRecordPayment = false;
  let serviceItems: Array<{ id: string; description: string; quantity: number; unit_price: number; line_total: number }> = [];
  let servicePayments: Array<{
    id: string;
    amount: number;
    payment_method: string;
    payment_date: string;
    created_at: string;
  }> = [];
  let estimateTax: { subtotal: number; tax_rate: number; tax_amount: number } | null = null;
  if (invoice.source_service_job_id) {
    const [{ data: job, error: jobError }, { data: quotation, error: quotationError }, { data: items, error: itemsError }, { data: payments, error: paymentsError }] = await Promise.all([
      supabase.from("service_jobs")
        .select("job_number")
        .eq("org_id", context.orgId)
        .eq("id", invoice.source_service_job_id)
        .maybeSingle(),
      invoice.source_service_quotation_id ? supabase.from("service_quotations")
        .select("subtotal, tax_rate, tax_amount")
        .eq("org_id", context.orgId)
        .eq("job_id", invoice.source_service_job_id)
        .eq("id", invoice.source_service_quotation_id)
        .maybeSingle() : Promise.resolve({ data: null, error: null }),
      invoice.source_service_quotation_id ? supabase.from("service_quotation_items")
        .select("id, description, quantity, unit_price, line_total")
        .eq("org_id", context.orgId)
        .eq("quotation_id", invoice.source_service_quotation_id)
        .order("created_at") : Promise.resolve({ data: [], error: null }),
      supabase.from("service_invoice_payments")
        .select("id, amount, payment_method, payment_date, created_at")
        .eq("org_id", context.orgId)
        .eq("invoice_id", invoice.id)
        .order("created_at", { ascending: false }),
    ]);
    if (jobError) throw new Error(`Unable to load the repair job for this invoice: ${jobError.message}`);
    if (quotationError) throw new Error(`Unable to load the approved estimate for this invoice: ${quotationError.message}`);
    if (itemsError) throw new Error(`Unable to load invoice line items: ${itemsError.message}`);
    if (paymentsError) throw new Error(`Unable to load invoice payments: ${paymentsError.message}`);
    serviceJobNumber = job?.job_number ?? null;
    estimateTax = quotation;
    serviceItems = items ?? [];
    servicePayments = payments ?? [];
    canRecordPayment = await canPermission("accounting", "edit")
      && await canTabPermission("accounting", "accounting", "receivables", "edit");
  }

  const balanceDue = Math.max(0, Number(invoice.amount) - Number(invoice.amount_paid));
  const statusLabel = invoice.status.replaceAll("_", " ");

  return (
    <main className="mx-auto max-w-4xl space-y-6 print:max-w-none print:space-y-0">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link href="/accounting/invoices" className="inline-flex items-center gap-1 text-sm text-ledger-500 hover:text-ink-900 dark:hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to invoices
        </Link>
        <PrintInvoiceButton />
      </div>

      <article className="rounded-xl border border-ledger-200 bg-white p-8 shadow-sm dark:border-ledger-700 dark:bg-ink-900 print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-ledger-200 pb-6 dark:border-ledger-700 print:border-slate-300">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300 print:text-slate-700">{context.orgName}</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink-900 dark:text-white print:text-black">Invoice</h1>
          </div>
          <div className="text-right">
            <p className="text-xl font-semibold text-ink-900 dark:text-white print:text-black">#{String(invoice.invoice_number).padStart(4, "0")}</p>
            <p className="mt-1 text-sm capitalize text-ledger-500 dark:text-ledger-400 print:text-slate-600">{statusLabel}</p>
            {serviceJobNumber && <p className="mt-1 text-sm text-ledger-500 dark:text-ledger-400 print:text-slate-600">Repair job {serviceJobNumber}</p>}
            {invoice.source_catering_event_id && <p className="mt-1 text-sm text-ledger-500 dark:text-ledger-400 print:text-slate-600">Catering invoice</p>}
          </div>
        </header>

        <section className="grid gap-6 py-6 sm:grid-cols-2">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ledger-500 dark:text-ledger-400 print:text-slate-500">Bill to</h2>
            <p className="mt-2 font-medium text-ink-900 dark:text-white print:text-black">{invoice.customer_name}</p>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:justify-self-end">
            <dt className="text-ledger-500 dark:text-ledger-400 print:text-slate-500">Invoice date</dt>
            <dd className="text-right text-ink-900 dark:text-white print:text-black">{new Date(invoice.created_at).toLocaleDateString()}</dd>
            <dt className="text-ledger-500 dark:text-ledger-400 print:text-slate-500">Due date</dt>
            <dd className="text-right text-ink-900 dark:text-white print:text-black">{new Date(`${invoice.due_date}T00:00:00`).toLocaleDateString()}</dd>
            {invoice.paid_at && (
              <>
                <dt className="text-ledger-500 dark:text-ledger-400 print:text-slate-500">Paid on</dt>
                <dd className="text-right text-ink-900 dark:text-white print:text-black">{new Date(invoice.paid_at).toLocaleDateString()}</dd>
              </>
            )}
          </dl>
        </section>

        {serviceJobNumber ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-y border-ledger-200 text-left text-xs uppercase tracking-wide text-ledger-500 dark:border-ledger-700 dark:text-ledger-400 print:border-slate-300 print:text-slate-600">
                  <tr>
                    <th className="py-3 pr-3">Description</th>
                    <th className="px-3 py-3 text-right">Quantity</th>
                    <th className="px-3 py-3 text-right">Unit price</th>
                    <th className="py-3 pl-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ledger-100 dark:divide-ledger-800 print:divide-slate-200">
                  {serviceItems.map((item) => (
                    <tr key={item.id}>
                      <td className="py-3 pr-3 text-ink-900 dark:text-white print:text-black">{item.description}</td>
                      <td className="px-3 py-3 text-right text-ledger-600 dark:text-ledger-300 print:text-slate-700">{item.quantity}</td>
                      <td className="px-3 py-3 text-right text-ledger-600 dark:text-ledger-300 print:text-slate-700">{formatCurrencyAmount(item.unit_price, currencyConfig)}</td>
                      <td className="py-3 pl-3 text-right font-medium text-ink-900 dark:text-white print:text-black">{formatCurrencyAmount(item.line_total, currencyConfig)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {estimateTax && (
              <dl className="ml-auto mt-4 grid max-w-sm grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <dt className="text-ledger-500 dark:text-ledger-400 print:text-slate-500">Subtotal</dt>
                <dd className="text-right text-ink-900 dark:text-white print:text-black">{formatCurrencyAmount(estimateTax.subtotal, currencyConfig)}</dd>
                <dt className="text-ledger-500 dark:text-ledger-400 print:text-slate-500">Tax ({estimateTax.tax_rate}%)</dt>
                <dd className="text-right text-ink-900 dark:text-white print:text-black">{formatCurrencyAmount(estimateTax.tax_amount, currencyConfig)}</dd>
              </dl>
            )}
          </>
        ) : (
          <div className="border-y border-ledger-200 py-4 dark:border-ledger-700 print:border-slate-300">
            <p className="text-sm text-ledger-600 dark:text-ledger-300 print:text-slate-700">
              {invoice.source_service_job_id ? "Service repair invoice" : "Invoice amount"}
            </p>
            <p className="mt-1 text-xs text-ledger-400 dark:text-ledger-500 print:text-slate-500">
              No itemized lines are recorded for this invoice.
            </p>
          </div>
        )}

        <section className="ml-auto mt-6 grid max-w-sm grid-cols-2 gap-x-6 gap-y-2 border-t border-ledger-200 pt-4 text-sm dark:border-ledger-700 print:border-slate-300">
          <h2 className="font-semibold text-ink-900 dark:text-white print:text-black">Invoice total</h2>
          <p className="text-right font-semibold text-ink-900 dark:text-white print:text-black">{formatCurrencyAmount(invoice.amount, currencyConfig)}</p>
          <p className="text-ledger-500 dark:text-ledger-400 print:text-slate-500">Paid</p>
          <p className="text-right text-ink-900 dark:text-white print:text-black">{formatCurrencyAmount(invoice.amount_paid, currencyConfig)}</p>
          <p className="font-semibold text-ledger-700 dark:text-ledger-200 print:text-black">Balance due</p>
          <p className="text-right font-semibold text-ink-900 dark:text-white print:text-black">{formatCurrencyAmount(balanceDue, currencyConfig)}</p>
        </section>
      </article>
      {invoice.source_service_job_id && invoice.status !== "paid" && invoice.status !== "void" && balanceDue > 0 && canRecordPayment && (
        <ServiceInvoicePaymentForm
          invoiceId={invoice.id}
          balanceDue={balanceDue}
          currencyConfig={currencyConfig}
        />
      )}
      {invoice.source_service_job_id && servicePayments.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-ledger-200 bg-white dark:border-ledger-700 dark:bg-ink-900 print:hidden">
          <div className="border-b border-ledger-100 px-5 py-4 dark:border-ledger-700">
            <h2 className="font-semibold text-ink-900 dark:text-white">Payment history</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-ledger-400">
                <tr>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Method</th>
                  <th className="px-5 py-3 text-right">Amount</th>
                  <th className="px-5 py-3 text-right">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {servicePayments.map((payment) => (
                  <tr key={payment.id} className="border-t border-ledger-100 dark:border-ledger-800">
                    <td className="px-5 py-3 text-ledger-600 dark:text-ledger-300">{new Date(`${payment.payment_date}T00:00:00`).toLocaleDateString()}</td>
                    <td className="px-5 py-3 text-ledger-600 dark:text-ledger-300">{payment.payment_method}</td>
                    <td className="px-5 py-3 text-right font-medium text-ink-900 dark:text-white">{formatCurrencyAmount(payment.amount, currencyConfig)}</td>
                    <td className="px-5 py-3 text-right">
                      <Link href={`/accounting/invoices/${invoice.id}/receipts/${payment.id}`} className="font-medium text-amber-700 hover:underline dark:text-amber-300">View receipt</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
