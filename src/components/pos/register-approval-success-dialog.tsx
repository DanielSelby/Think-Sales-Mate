"use client";

import { CheckCircle2, ClipboardCheck } from "lucide-react";

export function RegisterApprovalSuccessDialog({
  open,
  onContinue,
  onStay,
  stayLabel,
}: {
  open: boolean;
  onContinue: () => void;
  onStay: () => void;
  stayLabel: string;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink-950/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="register-approval-title">
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white text-ink-900 shadow-2xl">
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 px-6 py-7 text-center text-white">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white/20">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h2 id="register-approval-title" className="mt-3 font-display text-xl font-bold">Register close approved</h2>
          <p className="mt-1 text-sm text-white/85">The approval has been recorded successfully.</p>
        </div>
        <div className="p-6">
          <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-900">
            <ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <p className="text-sm leading-5">Would you like to continue to End of Day Accounts to complete the day’s reconciliation?</p>
          </div>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onStay} className="rounded-xl border border-ledger-200 px-4 py-2.5 text-sm font-semibold text-ledger-700 hover:bg-ledger-50">
              {stayLabel}
            </button>
            <button type="button" onClick={onContinue} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
              <ClipboardCheck className="h-4 w-4" /> Go to End of Day
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
