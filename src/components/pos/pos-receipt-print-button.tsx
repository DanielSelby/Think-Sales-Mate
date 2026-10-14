"use client";

import { useState } from "react";
import { Printer } from "lucide-react";
import { getInvoiceData } from "@/app/(dashboard)/pos/actions";
import { buildBrandedInvoiceHtml, waitForInvoiceImages } from "@/lib/sales/invoice-template";
import { useInvoiceFormat, useInvoiceTemplate } from "@/lib/sales/invoice-format";

export function PosReceiptPrintButton({ saleId, userId }: { saleId: string; userId: string }) {
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invoiceFormat] = useInvoiceFormat(userId);
  const [savedInvoiceTemplate] = useInvoiceTemplate(userId);

  async function printReceipt() {
    setError(null);
    const printWindow = window.open("", "_blank", "width=850,height=950");
    if (!printWindow) {
      setError("Allow pop-ups to print this receipt.");
      return;
    }
    setPrinting(true);
    try {
      const data = await getInvoiceData(saleId);
      if (!data) throw new Error("This POS receipt is unavailable or you do not have access to it.");
      printWindow.document.write(buildBrandedInvoiceHtml({
        ...data,
        invoiceTemplate: savedInvoiceTemplate ?? data.invoiceTemplate,
        printFormat: invoiceFormat,
      }));
      printWindow.document.close();
      await waitForInvoiceImages(printWindow);
      printWindow.focus();
      printWindow.print();
    } catch (cause) {
      printWindow.close();
      setError(cause instanceof Error ? cause.message : "Could not print this POS receipt.");
    } finally {
      setPrinting(false);
    }
  }

  return (
    <span className="relative">
      <button
        type="button"
        onClick={printReceipt}
        disabled={printing}
        aria-label="Print POS receipt"
        title={error ?? "Print receipt"}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ledger-500 hover:bg-ledger-100 hover:text-ink-900 disabled:opacity-50 dark:text-ledger-300 dark:hover:bg-ink-700 dark:hover:text-white"
      >
        <Printer className="h-4 w-4" />
      </button>
      {error && <span role="status" className="absolute right-0 top-full z-20 mt-1 w-56 rounded-lg bg-rose-600 p-2 text-xs text-white shadow-lg">{error}</span>}
    </span>
  );
}
