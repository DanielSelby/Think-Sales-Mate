import Link from "next/link";
import { AlertTriangle, CalendarClock } from "lucide-react";
import { formatMoney } from "@/lib/currency";
import type { RestaurantSupplierInvoiceAgingRow } from "./restaurant-supplier-invoice-aging";

function formatCurrency(value: number, currency: string) {
  return formatMoney(value, currency);
}

export function RestaurantSupplierInvoiceAlert({
  invoices,
  currency,
}: {
  invoices: RestaurantSupplierInvoiceAgingRow[];
  currency: string;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const nextWeek = new Date();
  nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);
  const nextWeekKey = nextWeek.toISOString().slice(0, 10);
  const overdue = invoices.filter((invoice) => invoice.overdue_days > 0);
  const dueSoon = invoices.filter((invoice) =>
    invoice.due_date !== null
    && invoice.due_date >= today
    && invoice.due_date <= nextWeekKey,
  );
  const outstanding = (rows: RestaurantSupplierInvoiceAgingRow[]) =>
    rows.reduce((total, invoice) => total + Number(invoice.outstanding), 0);

  if (!overdue.length && !dueSoon.length) return null;

  return <section className="grid gap-3 md:grid-cols-2" aria-label="Restaurant supplier invoice reminders">
    {overdue.length > 0 && <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/30">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-700 dark:text-red-300" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-bold text-red-900 dark:text-red-100">Overdue Restaurant supplier invoices</h2>
        <p className="mt-1 text-xs text-red-800 dark:text-red-200">
          {overdue.length} invoice{overdue.length === 1 ? "" : "s"} · {formatCurrency(outstanding(overdue), currency)} outstanding
        </p>
        <Link href="/accounting?tab=payables" className="mt-2 inline-flex text-xs font-semibold text-red-800 underline dark:text-red-200">
          Review payables
        </Link>
      </div>
    </div>}
    {dueSoon.length > 0 && <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
      <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-bold text-amber-950 dark:text-amber-100">Restaurant invoices due soon</h2>
        <p className="mt-1 text-xs text-amber-900 dark:text-amber-200">
          {dueSoon.length} invoice{dueSoon.length === 1 ? "" : "s"} due within 7 days · {formatCurrency(outstanding(dueSoon), currency)}
        </p>
        <Link href="/accounting?tab=payables" className="mt-2 inline-flex text-xs font-semibold text-amber-900 underline dark:text-amber-200">
          Review payables
        </Link>
      </div>
    </div>}
  </section>;
}
