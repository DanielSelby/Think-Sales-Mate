"use client";

export function PrintInvoiceButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg bg-ledger-900 px-4 py-2 text-sm font-medium text-white hover:bg-ledger-700 print:hidden dark:bg-white dark:text-ink-900"
    >
      Print / Save PDF
    </button>
  );
}
