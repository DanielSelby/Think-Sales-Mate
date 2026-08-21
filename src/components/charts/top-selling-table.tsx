import { formatMoney } from "@/lib/currency";
import type { BestSeller } from "@/lib/accounting/metrics";

export function TopSellingTable({ products, currency }: { products: BestSeller[]; currency: string }) {
  if (products.length === 0) {
    return (
      <div className="flex h-32 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-ledger-200 text-center dark:border-ledger-700">
        <p className="text-sm text-ledger-400">No sales in this period yet.</p>
      </div>
    );
  }

  return (
       <table className="w-full text-sm">
      <thead>
       <tr>
          <th className="pb-2">#</th>
          <th className="pb-2">Product</th>
          <th className="pb-2 text-right">Qty sold</th>
          <th className="pb-2 text-right">Revenue</th>
        </tr>
      </thead>
      <tbody>
        {products.map((product, i) => (
          <tr key={product.name} className="border-b border-ledger-50 last:border-0 dark:border-ledger-700/50">
            <td className="py-2.5 text-ledger-400">{i + 1}</td>
            <td className="py-2.5 text-ink-900 dark:text-white">{product.name}</td>
            <td className="py-2.5 text-right figure text-ledger-600 dark:text-ledger-300">{product.quantity}</td>
            <td className="py-2.5 text-right figure font-semibold tracking-tight tabular-nums text-ink-900 dark:text-white">
              {formatMoney(product.revenue, currency)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}