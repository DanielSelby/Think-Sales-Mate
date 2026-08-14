import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowLeft } from "lucide-react";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ExportCsvButton } from "@/components/reports/export-csv-button";

function formatMoney(value: number) {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function defaultRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export default async function SalesReportPage({
  searchParams
}: {
  searchParams: { start?: string; end?: string };
}) {
  const activeOrgId = await (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const defaults = defaultRange();
  const start = searchParams.start || defaults.start;
  const end = searchParams.end || defaults.end;

  const supabase = await createClient();
  const { data: sales } = await supabase
    .from("sales")
    .select("sale_number, customer_name, subtotal, total, created_at")
    .eq("org_id", context.orgId)
    .gte("created_at", `${start}T00:00:00`)
    .lte("created_at", `${end}T23:59:59`)
    .order("created_at", { ascending: false });

  const rows = sales ?? [];
  const totalRevenue = rows.reduce((sum, s) => sum + Number(s.total), 0);

  const csvRows = rows.map((s) => [
    String(s.sale_number).padStart(4, "0"),
    s.customer_name ?? "Walk-in",
    new Date(s.created_at).toLocaleDateString(),
    s.total.toFixed(2)
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/reports" className="inline-flex items-center gap-1 text-sm text-ledger-500 hover:text-ink-900 dark:hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to reports
        </Link>
        <h1 className="mt-2 font-display text-2xl font-semibold text-ink-900 dark:text-white">Sales report</h1>
      </div>

      <form method="GET" className="flex flex-wrap items-end gap-3 rounded-card border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-ledger-700 dark:text-ledger-200">From</label>
          <Input name="start" type="date" defaultValue={start} />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-ledger-700 dark:text-ledger-200">To</label>
          <Input name="end" type="date" defaultValue={end} />
        </div>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        <div className="ml-auto">
          <ExportCsvButton
            filename={`sales-report-${start}-to-${end}.csv`}
            headers={["Sale #", "Customer", "Date", "Total"]}
            rows={csvRows}
          />
        </div>
      </form>

      <div className="rounded-card border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900">
        <p className="text-sm text-ledger-500 dark:text-ledger-400">
          {rows.length} sale{rows.length === 1 ? "" : "s"} · total{" "}
          <span className="figure font-semibold text-ink-900 dark:text-white">${formatMoney(totalRevenue)}</span>
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-card border border-dashed border-ledger-200 bg-white p-10 text-center dark:border-ledger-700 dark:bg-ink-900">
          <p className="text-sm text-ledger-500 dark:text-ledger-400">No sales in this date range.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-ledger-100 bg-white shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <table className="w-full text-sm">
            <thead className="border-b border-ledger-100 text-left text-xs font-medium uppercase tracking-wide text-ledger-400 dark:border-ledger-700">
              <tr>
                <th className="px-4 py-3">Sale</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((sale) => (
                <tr key={sale.sale_number} className="border-b border-ledger-50 last:border-0 dark:border-ledger-700/50">
                  <td className="px-4 py-3 text-ink-900 dark:text-white">#{String(sale.sale_number).padStart(4, "0")}</td>
                  <td className="px-4 py-3 text-ledger-500 dark:text-ledger-400">{sale.customer_name ?? "Walk-in"}</td>
                  <td className="px-4 py-3 text-ledger-500 dark:text-ledger-400">
                    {new Date(sale.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right figure text-ink-900 dark:text-white">${formatMoney(sale.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}