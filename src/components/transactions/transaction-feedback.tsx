"use client";

import { useEffect, useRef } from "react";
import { Check, CircleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function TransactionFeedback({
  kind,
  message,
  onClose,
  actionLabel,
  onAction,
}: {
  kind: "success" | "error" | "warning";
  message: string;
  onClose: () => void;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const success = kind === "success";
  const warning = kind === "warning";
  const error = kind === "error";
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (error) return;
    const timeout = window.setTimeout(() => onCloseRef.current(), 4500);
    return () => window.clearTimeout(timeout);
  }, [error, message]);

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[120] w-[min(28rem,calc(100vw-2rem))] sm:right-6 sm:top-6" aria-live={error ? "assertive" : "polite"}>
      <div
        role={error ? "alert" : "status"}
        className="pointer-events-auto flex items-start gap-3 overflow-hidden rounded-2xl border border-white/70 bg-white/95 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.24),0_5px_0_rgba(15,23,42,0.08)] backdrop-blur-md animate-in slide-in-from-top-3 fade-in duration-200 dark:border-slate-700 dark:bg-ink-900/95"
      >
        <div className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white shadow-[0_5px_0_rgba(15,23,42,0.12),0_10px_18px_rgba(15,23,42,0.16)] [transform:perspective(400px)_rotateX(7deg)]", success ? "bg-gradient-to-br from-emerald-400 to-emerald-700" : warning ? "bg-gradient-to-br from-amber-400 to-amber-700" : "bg-gradient-to-br from-rose-400 to-rose-700")}>
          {success ? <Check className="h-5 w-5" strokeWidth={2.5} /> : <CircleAlert className="h-5 w-5" strokeWidth={2.5} />}
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <h2 className="text-sm font-bold text-ink-900 dark:text-white">{success ? "Action completed" : warning ? "Please note" : "Action needs attention"}</h2>
          <p className="mt-1 text-sm leading-5 text-ledger-600 dark:text-ledger-300">{message}</p>
          {actionLabel && onAction && (
            <button type="button" onClick={onAction} className="mt-2 text-sm font-semibold text-blue-700 hover:underline dark:text-blue-300">
              {actionLabel}
            </button>
          )}
        </div>
        <button type="button" aria-label="Dismiss notification" onClick={onClose} className="shrink-0 rounded-lg p-1 text-ledger-400 hover:bg-ledger-50 hover:text-ink-900 dark:hover:bg-white/[0.06] dark:hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
