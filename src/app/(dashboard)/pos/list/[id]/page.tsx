import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarClock, MapPin, Printer, ReceiptText, UserRound } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PosReceiptPrintButton } from "@/components/pos/pos-receipt-print-button";
import { SaleStatusMenu } from "@/components/sales/sale-status-menu";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canAccessLocation } from "@/lib/organizations/location-access";
import { canPermission, requirePermission } from "@/lib/rbac/permissions";
import { formatCurrency, formatDateTime, formatPosReceiptNumber } from "@/lib/sales/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "POS Transaction · SalesMate ERP" };

function displayStatus(status: string) {
  return status === "cancelled" ? "Voided" : status === "returned" ? "Returned" : "Completed";
}

export default async function PosSaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  await requirePermission("pos", "view");
  const canManageSaleStatus = await canPermission("sales", "approve");

  const supabase = await createClient();
  const { data: sale, error: saleError } = await supabase
    .from("sales")
    .select("id, sale_number, org_id, customer_id, customer_name, subtotal, discount_amount, tax_amount, total, amount_paid, due_date, payment_method, reference, sale_date, created_at, location_id, sold_by, register_session_id, document_status, status, refunded_amount")
    .eq("id", id)
    .eq("org_id", context.orgId)
    .maybeSingle();
  if (saleError) throw new Error(`Could not load POS transaction: ${saleError.message}`);
  if (
    !sale ||
    !sale.register_session_id ||
    sale.document_status !== "final" ||
    !canAccessLocation(context, sale.location_id) ||
    (!context.canViewOtherTransactions && sale.sold_by !== context.userId)
  ) notFound();

  const [itemsResult, locationResult, cashierResult, customerResult, historyResult] = await Promise.all([
    supabase.from("sale_items").select("id, quantity, unit_price, discount_percent, tax_percent, line_total, products(name, sku)").eq("sale_id", sale.id).order("created_at"),
    sale.location_id
      ? supabase.from("business_locations").select("name").eq("org_id", context.orgId).eq("id", sale.location_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("profiles").select("full_name").eq("id", sale.sold_by).maybeSingle(),
    sale.customer_id
      ? supabase.from("customers").select("name, phone, email").eq("org_id", context.orgId).eq("id", sale.customer_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("audit_logs").select("action, actor_id, created_at, metadata").eq("org_id", context.orgId).eq("entity_type", "sales").eq("entity_id", sale.id).order("created_at", { ascending: false }).limit(10),
  ]);
  for (const result of [itemsResult, locationResult, cashierResult, customerResult, historyResult]) {
    if (result.error) throw new Error(`Could not load POS transaction details: ${result.error.message}`);
  }

  const dateTime = formatDateTime(sale.created_at);
  const paid = Number(sale.amount_paid ?? 0);
  const paymentStatus = paid >= Number(sale.total) ? "Paid" : paid > 0 ? "Partially paid" : "Unpaid";

  return (
    <main className="mx-auto max-w-5xl space-y-6 pb-10">
      <div>
        <Link href="/pos/list" className="inline-flex items-center gap-2 text-sm text-ledger-500 hover:text-ink-900 dark:text-ledger-400 dark:hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back to List POS
        </Link>
        <div className="mt-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ledger-400">POS transaction</p>
            <h1 className="mt-1 font-display text-2xl font-bold text-ink-900 dark:text-white">
              {formatPosReceiptNumber(sale.sale_number, sale.sale_date)}
            </h1>
            <p className="mt-1 text-sm text-ledger-500 dark:text-ledger-400">Transaction ID: <span className="font-mono">{sale.id}</span></p>
          </div>
          <div className="flex items-center gap-2">
            <PosReceiptPrintButton saleId={sale.id} userId={context.userId} />
            {canManageSaleStatus && <SaleStatusMenu saleId={sale.id} status={sale.status} total={Number(sale.total)} currency={context.currency} />}
          </div>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="space-y-4 p-5">
            <h2 className="font-semibold text-ink-900 dark:text-white">Transaction details</h2>
            <Info icon={CalendarClock} label="Date & time" value={`${dateTime.date} · ${dateTime.time}`} />
            <Info icon={MapPin} label="Organization / branch" value={`${context.orgName} · ${locationResult.data?.name ?? "Unassigned"}`} />
            <Info icon={UserRound} label="Cashier" value={cashierResult.data?.full_name ?? "Unknown cashier"} />
            <Info icon={ReceiptText} label="Status" value={`${displayStatus(sale.status)} · ${paymentStatus}`} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-4 p-5">
            <h2 className="font-semibold text-ink-900 dark:text-white">Customer & payment</h2>
            <Info icon={UserRound} label="Customer" value={customerResult.data?.name ?? sale.customer_name ?? "Walk-in customer"} />
            <Info icon={UserRound} label="Contact" value={customerResult.data?.phone ?? customerResult.data?.email ?? "—"} />
            <Info icon={ReceiptText} label="Payment method" value={sale.payment_method ?? "—"} />
            <Info icon={ReceiptText} label="Payment reference" value={sale.reference ?? "—"} />
            <div className="flex justify-between border-t border-ledger-100 pt-3 text-sm dark:border-ledger-800">
              <span className="text-ledger-500 dark:text-ledger-400">Paid / total</span>
              <span className="font-semibold figure text-ink-900 dark:text-white">{formatCurrency(paid, context.currency)} / {formatCurrency(sale.total, context.currency)}</span>
            </div>
            {Number(sale.refunded_amount) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-ledger-500 dark:text-ledger-400">Refunded</span>
                <span className="font-semibold figure text-rose-600">{formatCurrency(sale.refunded_amount, context.currency)}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <Card className="overflow-hidden">
        <div className="border-b border-ledger-100 px-5 py-4 dark:border-ledger-800">
          <h2 className="font-semibold text-ink-900 dark:text-white">Items sold</h2>
          <p className="text-xs text-ledger-500 dark:text-ledger-400">POS receipt line items and applied adjustments</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-ledger-50 text-xs uppercase text-ledger-500 dark:bg-ink-800 dark:text-ledger-300">
              <tr><th className="px-5 py-3">Item</th><th className="px-5 py-3 text-right">Qty</th><th className="px-5 py-3 text-right">Unit price</th><th className="px-5 py-3 text-right">Discount</th><th className="px-5 py-3 text-right">Tax</th><th className="px-5 py-3 text-right">Line total</th></tr>
            </thead>
            <tbody className="divide-y divide-ledger-100 dark:divide-ledger-800">
              {(itemsResult.data ?? []).map((item) => {
                const product = Array.isArray(item.products) ? item.products[0] : item.products;
                return (
                  <tr key={item.id}>
                    <td className="px-5 py-3 font-medium text-ink-900 dark:text-white">
                      {product?.name ?? "Deleted product"}
                      {product?.sku && <span className="ml-2 font-mono text-xs text-ledger-400">{product.sku}</span>}
                    </td>
                    <td className="px-5 py-3 text-right figure">{item.quantity}</td>
                    <td className="px-5 py-3 text-right figure">{formatCurrency(item.unit_price, context.currency)}</td>
                    <td className="px-5 py-3 text-right figure">{Number(item.discount_percent)}%</td>
                    <td className="px-5 py-3 text-right figure">{Number(item.tax_percent)}%</td>
                    <td className="px-5 py-3 text-right font-medium figure">{formatCurrency(item.line_total, context.currency)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <CardContent className="space-y-2 border-t border-ledger-100 p-5 dark:border-ledger-800">
          <Money label="Subtotal" value={sale.subtotal} currency={context.currency} />
          <Money label="Discount" value={sale.discount_amount} currency={context.currency} />
          <Money label="Tax" value={sale.tax_amount} currency={context.currency} />
          <Money label="Total amount" value={sale.total} currency={context.currency} strong />
        </CardContent>
      </Card>

      {(historyResult.data ?? []).length > 0 && (
        <Card>
          <CardContent className="p-5">
            <h2 className="font-semibold text-ink-900 dark:text-white">Available audit history</h2>
            <ul className="mt-4 space-y-3">
              {(historyResult.data ?? []).map((event, index) => (
                <li key={`${event.created_at}-${index}`} className="flex flex-col gap-1 border-l-2 border-ledger-200 pl-3 dark:border-ledger-700 sm:flex-row sm:justify-between">
                  <span className="text-sm text-ink-800 dark:text-ledger-200">{event.action.replaceAll(".", " ")}</span>
                  <span className="text-xs text-ledger-400">{formatDateTime(event.created_at).date} · {formatDateTime(event.created_at).time}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </main>
  );
}

function Info({ icon: Icon, label, value }: { icon: typeof CalendarClock; label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ledger-400" />
      <div className="min-w-0">
        <p className="text-xs text-ledger-400">{label}</p>
        <p className="break-words text-sm font-medium text-ink-800 dark:text-ledger-200">{value}</p>
      </div>
    </div>
  );
}

function Money({ label, value, currency, strong = false }: { label: string; value: number; currency: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between text-sm ${strong ? "border-t border-ledger-100 pt-3 dark:border-ledger-800" : ""}`}>
      <span className={strong ? "font-semibold text-ink-900 dark:text-white" : "text-ledger-500 dark:text-ledger-400"}>{label}</span>
      <span className={`${strong ? "text-lg font-bold text-ink-900 dark:text-white" : "text-ink-800 dark:text-ledger-200"} figure`}>{formatCurrency(value, currency)}</span>
    </div>
  );
}
