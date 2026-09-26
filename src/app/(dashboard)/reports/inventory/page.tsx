import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowLeft } from "lucide-react";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { ExportCsvButton } from "@/components/reports/export-csv-button";
import { formatCurrency } from "@/lib/sales/format";

export default async function InventoryReportPage({ searchParams }: { searchParams?: { location?: string } }) {
  const activeOrgId = await (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const supabase = await createClient();
  const locationId = context.masterLocationId ?? (searchParams?.location && searchParams.location !== "all" ? searchParams.location : null);
  const allowedIds = context.isBranchScoped
    ? locationId && context.allowedLocationIds.includes(locationId) ? [locationId] : context.allowedLocationIds
    : locationId ? [locationId] : null;
  let stockQuery = supabase
    .from("product_stock_levels")
    .select("product_id, location_id, quantity")
    .eq("org_id", context.orgId)
  if (allowedIds) stockQuery = stockQuery.in("location_id", allowedIds);
  const { data: stockRows, error: stockError } = await stockQuery;
  if (stockError) throw new Error(`Unable to load inventory stock: ${stockError.message}`);
  const quantities = new Map<string, number>();
  for (const row of stockRows ?? []) quantities.set(row.product_id, (quantities.get(row.product_id) ?? 0) + Number(row.quantity ?? 0));
  const productIds = [...quantities.keys()];
  const { data: rows, error: productError } = productIds.length
    ? await supabase.from("products").select("id, sku, name, unit_price, is_active").eq("org_id", context.orgId).eq("is_active", true).in("id", productIds).order("name")
    : { data: [], error: null };
  if (productError) throw new Error(`Unable to load inventory products: ${productError.message}`);

  const products = (rows ?? []).map((product) => ({ ...product, stock_quantity: quantities.get(product.id) ?? 0 }));
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
            <span className="figure font-semibold text-ink-900 dark:text-white">{formatCurrency(totalValue, context.currency)}</span>
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
                    {formatCurrency(p.unit_price, context.currency)}
                  </td>
                  <td className="px-4 py-3 text-right figure text-ink-900 dark:text-white">
                    {formatCurrency(p.unit_price * p.stock_quantity, context.currency)}
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