import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { formatMoney } from "@/lib/currency";

export function InventorySummaryCard({
  totalProducts,
  lowStockCount,
  outOfStockCount,
  inventoryValue,
  currency
}: {
  totalProducts: number;
  lowStockCount: number;
  outOfStockCount: number;
  inventoryValue: number;
  currency: string;
}) {
  const healthyCount = Math.max(totalProducts - lowStockCount - outOfStockCount, 0);
  const healthyPct = totalProducts > 0 ? (healthyCount / totalProducts) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="figure grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="figure text-lg font-semibold tracking-tight tabular-nums text-ink-900 dark:text-white">{totalProducts}</p>
          <p className="text-xs text-ledger-400">Total items</p>
        </div>
        <div>
          <p className="figure text-lg font-semibold tracking-tight tabular-nums text-amber">{lowStockCount}</p>
          <p className="text-xs text-ledger-400">Low stock</p>
        </div>
        <div>
          <p className="figure text-lg font-semibold tracking-tight tabular-nums text-alert">{outOfStockCount}</p>
          <p className="text-xs text-ledger-400">Out of stock</p>
        </div>
      </div>

      <div>
        <div className="figure flex items-center justify-between text-xs text-ledger-500 dark:text-ledger-400">
          <span>Inventory value</span>
          <span className="figure font-semibold tracking-tight tabular-nums text-ink-900 dark:text-white">{formatMoney(inventoryValue, currency)}</span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ledger-100 dark:bg-ledger-800">
          <div className="h-full rounded-full bg-signal transition-all duration-500" style={{ width: `${healthyPct}%` }} />
        </div>
        <p className="mt-1 text-xs text-ledger-400">{healthyPct.toFixed(0)}% of items well stocked</p>
      </div>

      <Link href="/inventory" className="inline-flex items-center gap-1 text-sm font-medium text-signal hover:underline">
        View Inventory
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}