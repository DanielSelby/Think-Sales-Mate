"use client";
export function InvoicePrintButton() {
  return <button type="button" onClick={() => window.print()} className="print:hidden rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Save as PDF</button>;
}
