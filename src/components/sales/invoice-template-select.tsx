"use client";

import type { SalesInvoiceTemplate } from "@/lib/sales/invoice-format";

function isSalesInvoiceTemplate(value: string): value is SalesInvoiceTemplate {
  return value === "standard" || value === "think-sales" || value === "retail";
}

export function InvoiceTemplateSelect({ value, onChange }: {
  value: SalesInvoiceTemplate;
  onChange: (template: SalesInvoiceTemplate) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-xs font-medium text-ledger-500">
      Invoice template
      <select
        aria-label="Invoice template"
        value={value}
        onChange={(event) => {
          const selected = event.target.value;
          if (isSalesInvoiceTemplate(selected)) onChange(selected);
        }}
        className="h-9 rounded-md border border-ledger-200 bg-white px-2 text-xs text-ink-900 dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
      >
        <option value="standard">Standard</option>
        <option value="think-sales">ThinkSales branded</option>
        <option value="retail">Retail POS</option>
      </select>
    </label>
  );
}
