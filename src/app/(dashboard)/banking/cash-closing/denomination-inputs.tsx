"use client";

import { useState } from "react";

const DEFAULT_DENOMINATIONS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];

export function DenominationInputs() {
  const [customRows, setCustomRows] = useState<number[]>([]);

  return (
    <fieldset className="rounded-lg border border-ledger-200 p-3 dark:border-ledger-700">
      <legend className="px-1 text-[10px] font-medium text-ledger-500">Denominations</legend>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
        {DEFAULT_DENOMINATIONS.map((denomination) => (
          <label key={denomination} className="text-[10px]">
            {denomination}
            <input name={`denomination_${denomination}`} type="number" min="0" step="1" defaultValue="0" className="mt-1 h-8 w-full rounded border border-ledger-200 px-1 dark:border-ledger-700 dark:bg-ink-950" />
          </label>
        ))}
        {customRows.map((rowId) => (
          <div key={rowId} className="col-span-2 grid grid-cols-2 gap-1">
            <label className="text-[10px]">Value<input name={`custom_denomination_value_${rowId}`} type="number" min="0.01" step="0.01" className="mt-1 h-8 w-full rounded border border-ledger-200 px-1 dark:border-ledger-700 dark:bg-ink-950" required /></label>
            <label className="text-[10px]">Qty<input name={`custom_denomination_quantity_${rowId}`} type="number" min="0" step="1" defaultValue="0" className="mt-1 h-8 w-full rounded border border-ledger-200 px-1 dark:border-ledger-700 dark:bg-ink-950" /></label>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => setCustomRows((rows) => [...rows, (rows.at(-1) ?? 0) + 1])} className="mt-3 rounded-md border border-[#1478dd] px-3 py-1.5 text-[10px] font-semibold text-[#1478dd] hover:bg-blue-50">
        + Add another denomination
      </button>
    </fieldset>
  );
}
