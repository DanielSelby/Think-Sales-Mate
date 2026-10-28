import Link from "next/link";

export type RestaurantFinancialSummaryData = {
  order_count: number;
  completed_order_count: number;
  cancelled_order_count: number;
  order_sales: number;
  payment_count: number;
  collected: number;
  refunded: number;
  tips: number;
  refunded_tips: number;
  net_collected: number;
  net_tips: number;
  methods: Array<{
    payment_method: string;
    payment_count: number;
    collected: number;
    refunded: number;
    net_amount: number;
    net_tips: number;
  }>;
};

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
}

function methodLabel(value: string) {
  return value === "mobile_money" ? "Mobile money" : value === "other" ? "Other" : value[0].toUpperCase() + value.slice(1);
}

export function RestaurantFinancialSummary({
  summary,
  currency,
  periodLabel,
  href,
}: {
  summary: RestaurantFinancialSummaryData;
  currency: string;
  periodLabel: string;
  href?: string;
}) {
  return (
    <section className="rounded-2xl border border-orange-200 bg-white p-5 shadow-sm dark:border-orange-900 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-300">Restaurant · {periodLabel}</p>
          <h2 className="mt-1 text-lg font-bold text-slate-950 dark:text-white">Sales & payment summary</h2>
        </div>
        {href && <Link href={href} className="rounded-lg border border-orange-200 px-3 py-2 text-xs font-semibold text-orange-800 hover:bg-orange-50 dark:border-orange-900 dark:text-orange-200 dark:hover:bg-orange-950/40">
          Restaurant details
        </Link>}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Order sales" value={formatCurrency(summary.order_sales, currency)} detail={`${summary.order_count} non-cancelled order(s)`} />
        <Metric label="Net payments" value={formatCurrency(summary.net_collected, currency)} detail={`${summary.payment_count} payment/refund record(s)`} />
        <Metric label="Net tips" value={formatCurrency(summary.net_tips, currency)} detail="Kept separate from order sales" />
        <Metric label="Refunds" value={formatCurrency(summary.refunded, currency)} detail={`${summary.cancelled_order_count} cancelled order(s)`} />
      </div>
      <div className="mt-4 overflow-x-auto rounded-lg border dark:border-slate-700">
        <table className="w-full min-w-[36rem] text-left text-xs">
          <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
            <tr>
              <th className="px-3 py-2 font-semibold">Tender</th>
              <th className="px-3 py-2 text-right font-semibold">Collected</th>
              <th className="px-3 py-2 text-right font-semibold">Refunded</th>
              <th className="px-3 py-2 text-right font-semibold">Net received</th>
              <th className="px-3 py-2 text-right font-semibold">Net tips</th>
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-slate-700">
            {summary.methods.length ? summary.methods.map((method) => (
              <tr key={method.payment_method} className="text-slate-700 dark:text-slate-200">
                <td className="px-3 py-2 font-medium">{methodLabel(method.payment_method)}</td>
                <td className="px-3 py-2 text-right">{formatCurrency(method.collected, currency)}</td>
                <td className="px-3 py-2 text-right">{formatCurrency(method.refunded, currency)}</td>
                <td className="px-3 py-2 text-right font-semibold">{formatCurrency(method.net_amount, currency)}</td>
                <td className="px-3 py-2 text-right">{formatCurrency(method.net_tips, currency)}</td>
              </tr>
            )) : <tr><td colSpan={5} className="px-3 py-5 text-center text-slate-500">No Restaurant payments in this period.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
        Orders are grouped by order date; payments and refunds by transaction date. Restaurant activity is reported separately from ERP product sales. Payment and refund journals post only when all Restaurant account mappings are configured; Restaurant receipts remain outside the existing physical-cash variance calculation.
      </p>
    </section>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
    <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
    <p className="mt-1 text-lg font-bold text-slate-950 dark:text-white">{value}</p>
    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{detail}</p>
  </div>;
}
