import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUp, ArrowDown, Equal } from "lucide-react";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";

function formatMoney(value: number) {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(value));
}

export default async function StockAdjustmentDetailPage({ params }: { params: { id: string } }) {
  const activeOrgId = cookies().get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const supabase = createClient();
  const { data: adjustment } = await supabase
    .from("stock_adjustments")
    .select(
      "id, adjustment_number, reference_no, adjustment_date, reason, note, created_at, business_locations(name)"
    )
    .eq("id", params.id)
    .eq("org_id", context.orgId)
    .single();

  if (!adjustment) notFound();

  const location = Array.isArray(adjustment.business_locations) ? adjustment.business_locations[0] : adjustment.business_locations;

  const { data: items } = await supabase
    .from("stock_adjustment_items")
    .select("id, system_stock, counted_stock, unit_cost, products(name, sku)")
    .eq("adjustment_id", adjustment.id);

  const totalImpact = (items ?? []).reduce((sum, i) => sum + (i.counted_stock - i.system_stock) * i.unit_cost, 0);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href="/inventory/adjustments"
          className="inline-flex items-center gap-1 text-sm text-ledger-500 hover:text-ink-900 dark:hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to stock adjustment
        </Link>
        <h1 className="mt-2 font-display text-2xl font-semibold text-ink-900 dark:text-white">
          {adjustment.reference_no || `Adjustment #${String(adjustment.adjustment_number).padStart(4, "0")}`}
        </h1>
        <p className="text-sm text-ledger-500 dark:text-ledger-400">
          {location?.name ?? "No warehouse"} · {new Date(adjustment.adjustment_date).toLocaleDateString()}
          {adjustment.reason ? ` · ${adjustment.reason}` : ""}
        </p>
      </div>

      <Card>
        <CardContent className="pt-5">
          <table className="w-full text-sm">
            <thead className="border-b border-ledger-100 text-left text-xs font-medium uppercase tracking-wide text-ledger-400 dark:border-ledger-700">
              <tr>
                <th className="pb-2">Item</th>
                <th className="pb-2 text-right">System</th>
                <th className="pb-2 text-right">Counted</th>
                <th className="pb-2 text-right">Change</th>
                <th className="pb-2 text-right">Impact</th>
              </tr>
            </thead>
            <tbody>
              {(items ?? []).map((item) => {
                const product = Array.isArray(item.products) ? item.products[0] : item.products;
                const variance = item.counted_stock - item.system_stock;
                const impact = variance * item.unit_cost;
                return (
                  <tr key={item.id} className="border-b border-ledger-50 last:border-0 dark:border-ledger-700/50">
                    <td className="py-2 text-ink-900 dark:text-white">
                      {product?.name ?? "Deleted product"}
                      <span className="ml-2 font-mono text-xs text-ledger-400">{product?.sku}</span>
                    </td>
                    <td className="py-2 text-right figure text-ledger-500 dark:text-ledger-400">{item.system_stock}</td>
                    <td className="py-2 text-right figure text-ink-900 dark:text-white">{item.counted_stock}</td>
                    <td className="py-2 text-right">
                      <span
                        className={`inline-flex items-center gap-1 figure font-medium ${variance > 0 ? "text-signal" : variance < 0 ? "text-alert" : "text-ledger-400"}`}
                      >
                        {variance > 0 ? <ArrowUp className="h-3 w-3" /> : variance < 0 ? <ArrowDown className="h-3 w-3" /> : <Equal className="h-3 w-3" />}
                        {variance > 0 ? `+${variance}` : variance}
                      </span>
                    </td>
                    <td className={`py-2 text-right figure font-medium ${impact >= 0 ? "text-signal" : "text-alert"}`}>
                      {impact >= 0 ? "+" : "-"}${formatMoney(impact)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="mt-4 flex items-center justify-between border-t border-ledger-100 pt-4 dark:border-ledger-700">
            <span className="text-sm font-medium text-ledger-600 dark:text-ledger-300">Total adjustment impact</span>
            <span className={`figure text-lg font-semibold ${totalImpact >= 0 ? "text-signal" : "text-alert"}`}>
              {totalImpact >= 0 ? "+" : "-"}${formatMoney(totalImpact)}
            </span>
          </div>

          {adjustment.note && (
            <div className="mt-4 border-t border-ledger-100 pt-4 dark:border-ledger-700">
              <p className="text-xs font-medium uppercase tracking-wide text-ledger-400">Note</p>
              <p className="mt-1 text-sm text-ledger-600 dark:text-ledger-300">{adjustment.note}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}