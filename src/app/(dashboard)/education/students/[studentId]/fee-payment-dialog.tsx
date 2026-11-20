"use client";

import { useEffect, useRef, useState } from "react";
import { CreditCard, Loader2, X } from "lucide-react";
import { useFormStatus } from "react-dom";
import { recordEducationFeePayment } from "../../actions";
import { EDUCATION_FEE_PAYMENT_METHODS } from "@/lib/education/fee-payment-methods";
import { formatCurrencyAmount, type CurrencyConfig } from "@/lib/currency";

function SaveFeePaymentButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} aria-busy={pending} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-wait disabled:opacity-70">
    {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
    {pending ? "Saving payment..." : "Save payment"}
  </button>;
}

export function FeePaymentDialog({
  chargeId,
  charges,
  studentId,
  studentName,
  chargeDescription,
  balance,
  currencyConfig,
  returnToFinance = false,
  returnToPayments = false,
  buttonLabel = "Record payment",
}: {
  chargeId?: string;
  charges?: Array<{ id: string; description: string; balance: number; studentId?: string; studentName?: string }>;
  studentId: string;
  studentName: string;
  chargeDescription?: string;
  balance?: number;
  currencyConfig: CurrencyConfig;
  returnToFinance?: boolean;
  returnToPayments?: boolean;
  buttonLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [selectedChargeId, setSelectedChargeId] = useState(chargeId ?? charges?.[0]?.id ?? "");
  const dialogRef = useRef<HTMLElement>(null);
  const selectedCharge = charges?.find((charge) => charge.id === selectedChargeId);
  const activeChargeId = chargeId ?? selectedCharge?.id ?? "";
  const activeStudentId = selectedCharge?.studentId ?? studentId;
  const activeStudentName = selectedCharge?.studentName ?? studentName;
  const activeDescription = selectedCharge?.description ?? chargeDescription ?? "";
  const activeBalance = selectedCharge?.balance ?? balance ?? 0;
  const dialogTitleId = `fee-payment-title-${chargeId ?? "selected"}`;
  const formatMoney = (amount: number) => formatCurrencyAmount(amount, currencyConfig);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.querySelector<HTMLInputElement>("input[name='amount']")?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return <>
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-800"
    >
      <CreditCard className="h-3.5 w-3.5" /> {buttonLabel}
    </button>
    {open && <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={dialogTitleId}
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={dialogTitleId} className="text-lg font-bold">Record fee payment</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{activeStudentName}{activeDescription ? ` · ${activeDescription}` : ""}</p>
            <p className="mt-1 text-sm font-semibold">Balance due: {formatMoney(activeBalance)}</p>
          </div>
          <button type="button" aria-label="Close payment dialog" onClick={() => setOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form action={recordEducationFeePayment} className="mt-5 grid gap-3">
          <input type="hidden" name="charge_id" value={activeChargeId} />
          <input type="hidden" name="student_id" value={activeStudentId} />
          {(returnToFinance || returnToPayments) && <input type="hidden" name="return_to" value={returnToPayments ? "payments" : "finance"} />}
          {charges && (
            <label className="text-sm font-medium">Fee charge
              <select required value={selectedChargeId} onChange={(event) => setSelectedChargeId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100">
                {charges.map((charge) => <option key={charge.id} value={charge.id}>{charge.studentName ? `${charge.studentName} · ` : ""}{charge.description} · {formatMoney(charge.balance)} due</option>)}
              </select>
            </label>
          )}
          <label className="text-sm font-medium">Payment amount ({currencyConfig.symbol})
            <input required name="amount" type="number" min="0.01" max={activeBalance.toFixed(currencyConfig.decimalPlaces)} step={10 ** -currencyConfig.decimalPlaces} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100" />
          </label>
          <label className="text-sm font-medium">Payment method
            <select required name="payment_method" defaultValue="cash" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100">
              {EDUCATION_FEE_PAYMENT_METHODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">Reference (optional)
            <input name="reference" maxLength={120} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100" />
          </label>
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">Cancel</button>
            <SaveFeePaymentButton />
          </div>
        </form>
      </section>
    </div>}
  </>;
}
