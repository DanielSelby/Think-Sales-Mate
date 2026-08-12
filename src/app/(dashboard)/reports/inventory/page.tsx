import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowLeft } from "lucide-react";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { ExportCsvButton } from "@/components/reports/export-csv-button";

function formatMoney(value: number) {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export default async function InventoryReportPage() {
  const activeOrgId = await cookies().get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("products")
    .select("sku, name, unit_price, stock_quantity, is_active")
    .eq("org_id", context.orgId)
    .eq("is_active", true)
    .order("name");

  const products = rows ?? [];
  const totalValue = products.reduce((sum, p) => sum + p.unit_price * p.stock_quantity, 0);

  const csvRows = products.map((p) => [
    p.sku,
    p.name,
    p.stock_quantity,
    p.unit_price.toFixed(2),
    (p.unit_price * p.stock_quantity).toFixed(2)
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/reports" className="inline-flex items-center gap-1 text-sm text-ledger-500 hover:text-ink-900 dark:hover:text-white">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to reports
          </Link>
          <h1 className="mt-2 font-display text-2xl font-semibold text-ink-900 dark:text-white">Inventory valuation</h1>
          <p className="text-sm text-ledger-500 dark:text-ledger-400">
            {products.length} active product{products.length === 1 ? "" : "s"} · total{" "}
            <span className="figure font-semibold text-ink-900 dark:text-white">${formatMoney(totalValue)}</span>
          </p>
        </div>
        <ExportCsvButton
          filename="inventory-valuation.csv"
          headers={["SKU", "Product", "Stock", "Unit price", "Value"]}
          rows={csvRows}
        />
      </div>

      {products.length === 0 ? (
        <div className="rounded-card border border-dashed border-ledger-200 bg-white p-10 text-center dark:border-ledger-700 dark:bg-ink-900">
          <p className="text-sm text-ledger-500 dark:text-ledger-400">No active products to value.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-ledger-100 bg-white shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <table className="w-full text-sm">
            <thead className="border-b border-ledger-100 text-left text-xs font-medium uppercase tracking-wide text-ledger-400 dark:border-ledger-700">
              <tr>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3 text-right">Stock</th>
                <th className="px-4 py-3 text-right">Unit price</th>
                <th className="px-4 py-3 text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.sku} className="border-b border-ledger-50 last:border-0 dark:border-ledger-700/50">
                  <td className="px-4 py-3 font-mono text-xs text-ledger-500 dark:text-ledger-400">{p.sku}</td>
                  <td className="px-4 py-3 text-ink-900 dark:text-white">{p.name}</td>
                  <td className="px-4 py-3 text-right figure text-ledger-500 dark:text-ledger-400">{p.stock_quantity}</td>
                  <td className="px-4 py-3 text-right figure text-ledger-500 dark:text-ledger-400">
                    ${formatMoney(p.unit_price)}
                  </td>
                  <td className="px-4 py-3 text-right figure text-ink-900 dark:text-white">
                    ${formatMoney(p.unit_price * p.stock_quantity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}