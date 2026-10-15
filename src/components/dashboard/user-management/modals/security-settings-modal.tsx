"use client";

import { X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SecuritySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SecuritySettingsModal({ isOpen, onClose }: SecuritySettingsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-ledger-200 bg-white p-6 shadow-2xl dark:border-ledger-700 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-ink-900 dark:text-white">
              Security policies
            </h2>
            <p className="mt-1 text-xs text-ledger-500 dark:text-ledger-400">
              These organization-wide policies are not currently persisted or enforced by the application.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-ledger-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-xs leading-5 text-ledger-700 dark:text-ledger-300">
            Session timeout, password complexity, account lockout, and organization-wide 2FA enforcement cannot be changed here yet. No settings have been saved.
          </p>
        </div>
        <div className="mt-5 flex justify-end">
          <Button type="button" variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}
