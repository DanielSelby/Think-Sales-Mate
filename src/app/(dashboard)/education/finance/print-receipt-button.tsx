"use client";

import { Printer } from "lucide-react";

export default function PrintReceiptButton({ label = "Print receipt" }: { label?: string }) {
  return <button
    type="button"
    onClick={() => window.print()}
    className="print:hidden inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
  >
    <Printer className="h-4 w-4" />
    {label}
  </button>;
}
