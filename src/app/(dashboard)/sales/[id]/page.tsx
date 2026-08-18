import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";

function formatMoney(value: number) {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export default async function SaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const supabase = await createClient();
  const { data: sale } = await supabase
    .from("sales")
    .select("id, sale_number, customer_name, subtotal, total, created_at")
    .eq("id", id)
    .eq("org_id", context.orgId)
    .single();

  if (!sale) notFound();

  const { data: items } = await supabase
    .from("sale_items")
    .select("id, quantity, unit_price, line_total, products(name, sku)")
    .eq("sale_id", sale.id);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/sales" className="inline-flex items-center gap-1 text-sm text-ledger-500 hover:text-ink-900 dark:hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to sales
        </Link>
        <h1 className="mt-2 font-display text-2xl font-semibold text-ink-900 dark:text-white">
          Sale #{String(sale.sale_number).padStart(4, "0")}
        </h1>
        <p className="text-sm text-ledger-500 dark:text-ledger-400">
          {sale.customer_name ?? "Walk-in customer"} · {new Date(sale.created_at).toLocaleString()}
        </p>
      </div>

      <Card>
        <CardContent className="pt-5">
          <table className="w-full text-sm">
            <thead className="border-b border-ledger-100 text-left text-xs font-medium uppercase tracking-wide text-ledger-400 dark:border-ledger-700">
              <tr>
                <th className="pb-2">Item</th>
                <th className="pb-2 text-right">Qty</th>
                <th className="pb-2 text-right">Price</th>
                <th className="pb-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {(items ?? []).map((item) => {
                const product = Array.isArray(item.products) ? item.products[0] : item.products;
                return (
                  <tr key={item.id} className="border-b border-ledger-50 last:border-0 dark:border-ledger-700/50">
                    <td className="py-2 text-ink-900 dark:text-white">
                      {product?.name ?? "Deleted product"}
                      <span className="ml-2 font-mono text-xs text-ledger-400">{product?.sku}</span>
                    </td>
                    <td className="py-2 text-right figure">{item.quantity}</td>
                    <td className="py-2 text-right figure">${formatMoney(item.unit_price)}</td>
                    <td className="py-2 text-right figure">${formatMoney(item.line_total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="mt-4 flex items-center justify-between border-t border-ledger-100 pt-4 dark:border-ledger-700">
            <span className="text-sm font-medium text-ledger-500 dark:text-ledger-400">Total</span>
            <span className="figure text-xl font-semibold text-ink-900 dark:text-white">${formatMoney(sale.total)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}