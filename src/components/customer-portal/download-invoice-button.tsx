"use client";

import { Download } from "lucide-react";

export function DownloadInvoiceButton({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
      <Download className="h-4 w-4" /> Download Invoice PDF
    </a>
  );
}
