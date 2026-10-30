import Link from "next/link";

export type RestaurantSupplierInvoiceAgingRow = {
  purchase_order_id: string;
  location_id: string;
  location_name: string;
  supplier_name: string;
  reference: string;
  invoice_reference: string | null;
  due_date: string | null;
  invoice_date: string;
  invoiced_total: number;
  paid_total: number;
  outstanding: number;
  overdue_days: number;
};

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
}

function csvCell(value: string | number) {
  const text = String(value);
  const safeText = typeof value === "string" && /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

export function RestaurantSupplierInvoiceAging({
  invoices,
  currency,
  showManageLink = false,
}: {
  invoices: RestaurantSupplierInvoiceAgingRow[];
  currency: string;
  showManageLink?: boolean;
}) {
  function exportInvoices() {
    const rows = [
      ["Invoice reference", "Purchase reference", "Supplier", "Branch", "Invoice date", "Due date", "Invoice total", "Paid", "Outstanding", "Days overdue"],
      ...invoices.map((invoice) => [
        invoice.invoice_reference ?? "",
        invoice.reference,
        invoice.supplier_name,
        invoice.location_name,
        invoice.invoice_date,
        invoice.due_date ?? "",
        Number(invoice.invoiced_total).toFixed(2),
        Number(invoice.paid_total).toFixed(2),
        Number(invoice.outstanding).toFixed(2),
        invoice.overdue_days,
      ]),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `restaurant-supplier-invoice-aging-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const amountFor = (matches: RestaurantSupplierInvoiceAgingRow[]) =>
    matches.reduce((sum, invoice) => sum + Number(invoice.outstanding), 0);
  const noDueDate = invoices.filter((invoice) => !invoice.due_date);
  const notDue = invoices.filter((invoice) => invoice.due_date && invoice.overdue_days === 0);
  const overdueOneToThirty = invoices.filter((invoice) => invoice.overdue_days >= 1 && invoice.overdue_days <= 30);
  const overdueThirtyOneToSixty = invoices.filter((invoice) => invoice.overdue_days >= 31 && invoice.overdue_days <= 60);
  const overdueOverSixty = invoices.filter((invoice) => invoice.overdue_days > 60);

  return <section className="space-y-3 rounded-lg border bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h4 className="text-sm font-bold text-slate-900 dark:text-white">Open supplier invoices</h4>
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
          Total outstanding: {formatCurrency(amountFor(invoices), currency)}
        </span>
        <button type="button" onClick={exportInvoices} disabled={!invoices.length} className="rounded border bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
          Export CSV
        </button>
      </div>
    </div>
    <p className="text-[11px] text-slate-500">Aging is based on receipts posted to Restaurant supplier payables. Receipts without a payable journal must be reconciled separately.</p>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
      {[
        { label: "Not yet due", rows: notDue },
        { label: "1-30 days overdue", rows: overdueOneToThirty },
        { label: "31-60 days overdue", rows: overdueThirtyOneToSixty },
        { label: "Over 60 days overdue", rows: overdueOverSixty },
        { label: "No due date", rows: noDueDate },
      ].map(({ label, rows }) => <div key={label} className="rounded border bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
        <p className="text-[10px] font-semibold text-slate-500">{label}</p>
        <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">{formatCurrency(amountFor(rows), currency)}</p>
      </div>)}
    </div>
    {invoices.length === 0
      ? <p className="text-xs text-slate-500">No outstanding supplier invoices.</p>
      : <div className="overflow-x-auto rounded border bg-white dark:border-slate-700 dark:bg-slate-900">
        <table className="w-full min-w-[620px] text-left text-xs">
          <thead className="border-b bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800">
            <tr><th className="p-2">Invoice</th><th className="p-2">Supplier</th><th className="p-2">Branch</th><th className="p-2">Invoice date</th><th className="p-2">Due / aging</th><th className="p-2 text-right">Outstanding</th>{showManageLink && <th className="p-2">Manage</th>}</tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => <tr key={invoice.purchase_order_id} className="border-b last:border-0 dark:border-slate-700">
              <td className="p-2 font-semibold text-slate-800 dark:text-slate-100">{invoice.invoice_reference || invoice.reference}</td>
              <td className="p-2">{invoice.supplier_name}</td>
              <td className="p-2">{invoice.location_name}</td>
              <td className="p-2">{invoice.invoice_date}</td>
              <td className={`p-2 ${invoice.overdue_days > 0 ? "font-semibold text-red-700 dark:text-red-400" : "text-slate-600 dark:text-slate-300"}`}>
                {!invoice.due_date ? "No due date" : invoice.overdue_days > 0 ? `${invoice.due_date} · ${invoice.overdue_days}d overdue` : `${invoice.due_date} · Not due`}
              </td>
              <td className="p-2 text-right font-semibold">{formatCurrency(Number(invoice.outstanding), currency)}</td>
              {showManageLink && <td className="p-2">
                <Link href={`/restaurant?view=ingredients&locationId=${encodeURIComponent(invoice.location_id)}`} className="font-semibold text-orange-700 hover:underline dark:text-orange-300">
                  Manage
                </Link>
              </td>}
            </tr>)}
          </tbody>
        </table>
      </div>}
  </section>;
}
