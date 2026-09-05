"use client";

import { useState, useTransition } from "react";
import { SearchCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { checkCrossBranchStock, type CrossBranchStockResult } from "@/app/(dashboard)/inventory/stock-actions";

export function CrossBranchStockButton({ query, enabled }: { query: string; enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<CrossBranchStockResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function checkStock() {
    startTransition(async () => {
      const next = await checkCrossBranchStock(query);
      setResult(next);
      setOpen(true);
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" disabled={!enabled || isPending} onClick={checkStock} title={!enabled ? "Search for a product not available at this branch first" : "Check stock across branches"}>
        <SearchCheck className="h-4 w-4" />
        Check stock
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Stock by branch" description={result?.productName ? `${result.productName} · ${result.sku}` : undefined}>
        {result?.error ? (
          <p className="rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">{result.error}</p>
        ) : (
          <div className="space-y-2">
            {(result?.branches ?? []).map((branch) => (
              <div key={branch.id} className="flex items-center justify-between rounded-md border border-ledger-100 px-3 py-2 text-sm dark:border-ledger-700">
                <span>{branch.name}</span>
                <span className="font-semibold">{branch.quantity}</span>
              </div>
            ))}
            {result?.branches?.length === 0 && <p className="text-sm text-ledger-500">No stock record found for this product.</p>}
          </div>
        )}
      </Dialog>
    </>
  );
}
