"use client";

import { useState } from "react";
import { formatCurrencyAmount, type CurrencyConfig } from "@/lib/currency";

const DEFAULT_DENOMINATIONS = [1, 2, 5, 10, 20, 50, 100, 200];

export function DenominationInputs({ expectedCash, currency }: { expectedCash: number; currency: CurrencyConfig }) {
  const [customRows, setCustomRows] = useState<number[]>([]);
  const [values, setValues] = useState<Record<string, number>>({});
  const total = Object.values(values).reduce((sum, value) => sum + value, 0);
  const variance = total - expectedCash;
  const update = (key: string, denomination: number) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setValues((current) => ({ ...current, [key]: denomination * Math.max(0, Math.floor(Number(event.target.value) || 0)) }));
  };

  return (
    <fieldset className="rounded-lg border border-ledger-200 p-5 shadow-sm dark:border-ledger-700">
      <legend className="px-1 text-[10px] font-medium text-ledger-500">Denominations</legend>
      <div className="grid grid-cols-3 gap-4">
        {DEFAULT_DENOMINATIONS.map((denomination) => (
          <label key={denomination} className="text-xs font-medium">
            <span className="flex justify-between"><span>{denomination}</span><span className="text-[11px] text-ledger-500">{formatCurrencyAmount(values[`denomination_${denomination}`] ?? 0, currency)}</span></span>
            <input name={`denomination_${denomination}`} type="number" min="0" step="1" defaultValue="0" onChange={update(`denomination_${denomination}`, denomination)} className="mt-1 h-9 w-full rounded border border-ledger-200 px-2 text-sm dark:border-ledger-700 dark:bg-ink-950" />
          </label>
        ))}
        {customRows.map((rowId) => (
          <div key={rowId} className="col-span-3 grid grid-cols-2 gap-2">
            <label className="text-xs font-medium">Value<input name={`custom_denomination_value_${rowId}`} type="number" min="0.01" step="0.01" onChange={(event) => setValues((current) => ({ ...current, [`custom_${rowId}`]: Number(event.target.value || 0) * (Number((document.querySelector(`input[name="custom_denomination_quantity_${rowId}"]`) as HTMLInputElement | null)?.value || 0)) }))} className="mt-1 h-9 w-full rounded border border-ledger-200 px-2 text-sm dark:border-ledger-700 dark:bg-ink-950" required /></label>
            <label className="text-xs font-medium">Qty<input name={`custom_denomination_quantity_${rowId}`} type="number" min="0" step="1" defaultValue="0" onChange={(event) => setValues((current) => ({ ...current, [`custom_${rowId}`]: Number((document.querySelector(`input[name="custom_denomination_value_${rowId}"]`) as HTMLInputElement | null)?.value || 0) * Math.max(0, Math.floor(Number(event.target.value) || 0)) }))} className="mt-1 h-9 w-full rounded border border-ledger-200 px-2 text-sm dark:border-ledger-700 dark:bg-ink-950" /></label>
            <span className="col-span-2 text-right text-[11px] text-ledger-500">Amount: {formatCurrencyAmount(values[`custom_${rowId}`] ?? 0, currency)}</span>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => setCustomRows((rows) => [...rows, (rows.at(-1) ?? 0) + 1])} className="mt-3 rounded-md border border-[#1478dd] px-3 py-1.5 text-[10px] font-semibold text-[#1478dd] hover:bg-blue-50">
        + Add another denomination
      </button>
      <div className="mt-3 grid gap-2 border-t border-ledger-100 pt-3 dark:border-ledger-700 sm:grid-cols-3">
        <p className="col-span-full text-[10px] font-bold uppercase tracking-wide text-ledger-500">Live Cash Summary</p>
        <label className="text-xs font-semibold">Total Physical Cash<input name="actual_cash" value={total.toFixed(2)} readOnly className="mt-1 h-10 w-full rounded-md border border-ledger-200 bg-ledger-50 px-3 font-bold dark:border-ledger-700 dark:bg-ink-950" /></label>
        <div className="rounded-md bg-[#f0f7fd] p-2 text-xs"><span className="block text-ledger-500">Expected Cash</span><strong>{formatCurrencyAmount(expectedCash, currency)}</strong></div>
        <div className={`rounded-md p-2 text-xs ${Math.abs(variance) < 0.005 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}><span className="block">Live Variance</span><strong>{variance < 0 ? "- " : ""}{formatCurrencyAmount(Math.abs(variance), currency)}</strong></div>
      </div>
    </fieldset>
  );
}
