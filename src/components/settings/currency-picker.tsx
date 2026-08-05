"use client";

import { useState, useTransition } from "react";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { updateCurrency } from "@/app/(dashboard)/settings/organization/actions";

export function CurrencyPicker({ currentCurrency, canManage }: { currentCurrency: string; canManage: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const currency = e.target.value;
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateCurrency(currency);
      if (result?.error) setError(result.error);
      else setSaved(true);
    });
  }

  return (
    <div className="rounded-card border border-ledger-100 bg-white p-6 shadow-card dark:border-ledger-700 dark:bg-ink-900">
      <h2 className="font-display text-lg font-semibold text-ledger-900 dark:text-white">Currency</h2>
      <p className="mt-1 text-sm text-ledger-500 dark:text-ledger-400">
        Applies to every amount shown across the whole workspace — dashboard, sales, invoices, payroll, everything.
      </p>

      <div className="mt-4 flex items-center gap-3">
        <select
          defaultValue={currentCurrency}
          onChange={handleChange}
          disabled={!canManage || isPending}
          className="h-10 w-full max-w-xs rounded-md border border-ledger-200 bg-white px-3 text-sm disabled:opacity-50 dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
        >
          {SUPPORTED_CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
        {isPending && <span className="text-xs text-ledger-400">Saving…</span>}
        {saved && !isPending && <span className="text-xs text-signal">Saved</span>}
      </div>

      {error && <p className="mt-2 rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">{error}</p>}
      {!canManage && <p className="mt-2 text-xs text-ledger-400">Only admins and owners can change the currency.</p>}
    </div>
  );
}