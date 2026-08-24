"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { formatMoney } from "@/lib/currency";
import { deleteProduct } from "@/app/(dashboard)/inventory/actions";

export interface ProductRow {
  id: string;
  sku: string;
  name: string;
  unitPrice: number;
  stockQuantity: number;
  lowStockThreshold: number;
  isActive: boolean;
}


export function ProductsTable({ products, canManage, currency = "GHS" }: { products: ProductRow[]; canManage: boolean; currency?: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  function handleDelete(id: string, name: string) {
    if (!confirm(`Remove "${name}" from inventory? This can't be undone.`)) return;
    setError(null);
    setPendingDelete(id);
    startTransition(async () => {
      const result = await deleteProduct(id);
      setPendingDelete(null);
      if (result?.error) setError(result.error);
    });
  }

  if (products.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-ledger-200 bg-white p-10 text-center dark:border-ledger-700 dark:bg-ink-900">
        <p className="text-sm text-ledger-500 dark:text-ledger-400">No products yet — add your first one to start tracking stock.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">{error}</p>}

      <div className="overflow-hidden rounded-card border border-ledger-100 bg-white shadow-card dark:border-ledger-700 dark:bg-ink-900">
        <table className="w-full text-sm">
          <thead className="border-b border-ledger-100 text-left text-xs font-semibold uppercase tracking-wide text-ink-900 dark:border-ledger-700 dark:text-white">
            <tr>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3 text-right">Price</th>
              <th className="px-4 py-3 text-right">Stock</th>
              {canManage && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {products.map((product) => {
              const isLow = product.stockQuantity <= product.lowStockThreshold;
              return (
                  <td className="px-4 py-3 font-mono text-xs text-ledger-500 dark:text-ledger-400">
                    <Link href={`/inventory/${product.id}`} className="hover:text-blue-600 hover:underline dark:hover:text-blue-400">
                      {product.sku}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-medium text-ink-900 dark:text-white">
                    <Link href={`/inventory/${product.id}`} className="hover:text-blue-600 hover:underline dark:hover:text-blue-400">
                      {product.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right text-ink-900 dark:text-white">{formatMoney(product.unitPrice, currency)}</td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={
                        isLow
                          ? "rounded-full bg-alert-soft px-2 py-0.5 text-xs font-semibold text-alert"
                          : "text-ledger-700 dark:text-ledger-200"
                      }
                    >
                      {product.stockQuantity}
                    </span>
                  </td>
                  {canManage && (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-3">
                        <Link
                          href={`/inventory/${product.id}/edit`}
                          className="text-ledger-400 hover:text-ink-900 dark:hover:text-white"
                          aria-label={`Edit ${product.name}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Link>
                        <button
                          onClick={() => handleDelete(product.id, product.name)}
                          disabled={isPending && pendingDelete === product.id}
                          className="text-ledger-400 hover:text-alert disabled:opacity-40"
                          aria-label={`Remove ${product.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}