"use client";

import type { InvoiceFormat } from "@/lib/sales/invoice-format";

function isInvoiceFormat(value: string): value is InvoiceFormat {
  return value === "a4" || value === "thermal-80mm" || value === "thermal-58mm";
}

export function InvoiceFormatSelect({ value, onChange }: {
  value: InvoiceFormat;
  onChange: (format: InvoiceFormat) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-xs font-medium text-ledger-500">
      Invoice format
      <select
        aria-label="Invoice format"
        value={value}
        onChange={(event) => {
          const selected = event.target.value;
          if (isInvoiceFormat(selected)) onChange(selected);
        }}
        className="h-9 rounded-md border border-ledger-200 bg-white px-2 text-xs text-ink-900 dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
      >
        <option value="a4">A4</option>
        <option value="thermal-80mm">Thermal 80 mm</option>
        <option value="thermal-58mm">Thermal 58 mm</option>
      </select>
    </label>
  );
}
