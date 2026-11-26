"use client";

import { Printer } from "lucide-react";

export function StudentReportCardPrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800"
    >
      <Printer className="h-4 w-4" />
      Print / Save as PDF
    </button>
  );
}
