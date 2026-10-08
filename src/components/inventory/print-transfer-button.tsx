"use client";

import { useEffect } from "react";
import { Printer } from "lucide-react";

function printTransfer() {
  const clearPrintMode = () => document.body.classList.remove("stock-transfer-printing");
  document.body.classList.add("stock-transfer-printing");
  window.addEventListener("afterprint", clearPrintMode, { once: true });
  window.print();
}

export function PrintTransferButton({ autoPrint = false }: { autoPrint?: boolean }) {
  useEffect(() => {
    if (!autoPrint) return;
    const timeoutId = window.setTimeout(printTransfer, 500);
    return () => window.clearTimeout(timeoutId);
  }, [autoPrint]);

  return (
    <button
      type="button"
      onClick={printTransfer}
      className="inline-flex items-center gap-2 rounded-lg border border-ledger-200 bg-white px-3 py-2 text-sm font-semibold text-ledger-700 shadow-sm hover:bg-ledger-50 print:hidden dark:border-ledger-700 dark:bg-ink-900 dark:text-ledger-200 dark:hover:bg-white/[0.05]"
    >
      <Printer className="h-4 w-4" />
      Print transfer slip
    </button>
  );
}
