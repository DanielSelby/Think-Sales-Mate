"use client";

import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function TransactionFeedback({
  kind,
  message,
  onClose,
}: {
  kind: "success" | "error";
  message: string;
  onClose: () => void;
}) {
  const success = kind === "success";
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-900/35 p-4 backdrop-blur-sm" role="alertdialog" aria-modal="true">
      <div className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-white/70 bg-white p-7 text-center shadow-[0_30px_90px_rgba(16,38,31,0.3)] dark:bg-ink-900">
        <div className={cn("mx-auto flex h-20 w-20 items-center justify-center rounded-[26px] text-white shadow-[0_14px_28px_rgba(0,0,0,0.2)]", success ? "bg-gradient-to-br from-emerald-400 to-emerald-700" : "bg-gradient-to-br from-rose-400 to-rose-700")}>
          {success ? <Check className="h-10 w-10" strokeWidth={2.5} /> : <X className="h-10 w-10" strokeWidth={2.5} />}
        </div>
        <h2 className="mt-5 text-xl font-bold text-ink-900 dark:text-white">{success ? "Transaction successful" : "Transaction needs attention"}</h2>
        <p className="mt-2 text-sm leading-6 text-ledger-500 dark:text-ledger-300">{message}</p>
        <button type="button" onClick={onClose} className={cn("mt-6 w-full rounded-xl px-4 py-3 text-sm font-bold text-white", success ? "bg-emerald-700" : "bg-rose-700")}>
          {success ? "Continue" : "Correct and try again"}
        </button>
      </div>
    </div>
  );
}
