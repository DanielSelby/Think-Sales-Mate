"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { deleteAsset } from "@/app/(dashboard)/assets/actions";
import { formatCurrency } from "@/lib/sales/format";

export interface AssetRow {
  id: string;
  name: string;
  category: string | null;
  purchaseCost: number;
  currentValue: number;
  status: "in_use" | "under_repair" | "disposed";
}

function formatMoney(value: number) {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

const STATUS_STYLES: Record<AssetRow["status"], string> = {
  in_use: "bg-signal-soft text-signal",
  under_repair: "bg-amber-soft text-amber",
  disposed: "bg-ledger-100 text-ledger-500 dark:bg-white/5 dark:text-ledger-400"
};

const STATUS_LABELS: Record<AssetRow["status"], string> = {
  in_use: "In use",
  under_repair: "Under repair",
  disposed: "Disposed"
};

export function AssetsTable({ assets, canManage, currency }: { assets: AssetRow[]; canManage: boolean; currency: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete(id: string, name: string) {
    if (!confirm(`Remove "${name}" from the asset register? This can't be undone.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteAsset(id);
      if (result?.error) setError(result.error);
    });
  }

  if (assets.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-ledger-200 bg-white p-10 text-center dark:border-ledger-700 dark:bg-ink-900">
        <p className="text-sm text-ledger-500 dark:text-ledger-400">No assets registered yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">{error}</p>}

      <div className="overflow-hidden rounded-card border border-ledger-100 bg-white shadow-card dark:border-ledger-700 dark:bg-ink-900">
        <table className="w-full text-sm">
          <thead className="border-b border-ledger-100 text-left text-xs font-medium uppercase tracking-wide text-ledger-400 dark:border-ledger-700">
            <tr>
              <th className="px-4 py-3">Asset</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3 text-right">Purchase cost</th>
              <th className="px-4 py-3 text-right">Current value</th>
              <th className="px-4 py-3">Status</th>
              {canManage && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {assets.map((asset) => (
              <tr key={asset.id} className="border-b border-ledger-50 last:border-0 dark:border-ledger-700/50">
                <td className="px-4 py-3 text-ink-900 dark:text-white">{asset.name}</td>
                <td className="px-4 py-3 text-ledger-500 dark:text-ledger-400">{asset.category ?? "—"}</td>
                <td className="px-4 py-3 text-right figure text-ledger-500 dark:text-ledger-400">
                  {formatCurrency(asset.purchaseCost, currency)}
                </td>
                <td className="px-4 py-3 text-right figure text-ink-900 dark:text-white">
                  {formatCurrency(asset.currentValue, currency)}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[asset.status]}`}>
                    {STATUS_LABELS[asset.status]}
                  </span>
                </td>
                {canManage && (
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      <Link
                        href={`/assets/${asset.id}/edit`}
                        className="text-ledger-400 hover:text-ink-900 dark:hover:text-white"
                        aria-label={`Edit ${asset.name}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Link>
                      <button
                        onClick={() => handleDelete(asset.id, asset.name)}
                        disabled={isPending}
                        className="text-ledger-400 hover:text-alert disabled:opacity-40"
                        aria-label={`Remove ${asset.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}