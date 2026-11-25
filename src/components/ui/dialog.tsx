"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function Dialog({ open, onClose, title, description, children, className }: DialogProps) {
  React.useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-ink-950/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className={cn(
          "relative w-full max-w-md rounded-card border border-ledger-100 bg-white p-6 shadow-card-hover dark:border-ledger-700 dark:bg-ink-900",
          className
        )}
      >
        <header
          data-theme-modal-header
          className="-mx-6 -mt-6 mb-4 flex items-start justify-between gap-4 rounded-t-[inherit] border-b px-6 py-4"
        >
          <div className="min-w-0">
            <h2 id="dialog-title" className="font-display text-lg font-semibold">
              {title}
            </h2>
            {description && <p className="mt-1 text-sm">{description}</p>}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-md p-1 text-white/85 hover:bg-white/15 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div>{children}</div>
      </div>
    </div>
  );
}