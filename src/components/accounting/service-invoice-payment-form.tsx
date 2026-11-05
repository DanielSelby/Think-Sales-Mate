"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { formatCurrencyAmount, type CurrencyConfig } from "@/lib/currency";
import { recordServiceInvoicePayment } from "@/app/(dashboard)/accounting/invoices/actions";

const PAYMENT_METHODS = ["Cash", "Card", "Bank Transfer", "Mobile Money", "Other"] as const;

export function ServiceInvoicePaymentForm({
  invoiceId,
  balanceDue,
  currencyConfig,
}: {
  invoiceId: string;
  balanceDue: number;
  currencyConfig: CurrencyConfig;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(balanceDue.toFixed(2));
  const [paymentMethod, setPaymentMethod] = useState<(typeof PAYMENT_METHODS)[number]>("Cash");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await recordServiceInvoicePayment({
        invoiceId,
        amount: Number(amount),
        paymentMethod,
        paymentDate,
        notes,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.push(`/accounting/invoices/${invoiceId}/receipts/${result.paymentId}`);
      router.refresh();
    });
  }

  return (
    <section className="rounded-xl border border-ledger-200 bg-white p-6 shadow-sm dark:border-ledger-700 dark:bg-ink-900 print:hidden">
      <h2 className="text-lg font-semibold text-ink-900 dark:text-white">Record a payment</h2>
      <p className="mt-1 text-sm text-ledger-500 dark:text-ledger-400">
        Remaining balance: {formatCurrencyAmount(balanceDue, currencyConfig)}. A receipt will be created for this payment.
      </p>
      <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
        <label className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
          Payment amount
          <input
            type="number"
            min="0.01"
            max={balanceDue}
            step="0.01"
            required
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="mt-1 block w-full rounded-lg border border-ledger-200 bg-white px-3 py-2 text-ink-900 dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
          />
        </label>
        <label className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
          Payment method
          <select
            value={paymentMethod}
            onChange={(event) => {
              const selectedMethod = PAYMENT_METHODS.find((method) => method === event.target.value);
              if (selectedMethod) setPaymentMethod(selectedMethod);
            }}
            className="mt-1 block w-full rounded-lg border border-ledger-200 bg-white px-3 py-2 text-ink-900 dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
          >
            {PAYMENT_METHODS.map((method) => <option key={method}>{method}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
          Payment date
          <input
            type="date"
            max={new Date().toISOString().slice(0, 10)}
            required
            value={paymentDate}
            onChange={(event) => setPaymentDate(event.target.value)}
            className="mt-1 block w-full rounded-lg border border-ledger-200 bg-white px-3 py-2 text-ink-900 dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
          />
        </label>
        <label className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
          Notes <span className="font-normal text-ledger-400">(optional)</span>
          <input
            type="text"
            maxLength={500}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="mt-1 block w-full rounded-lg border border-ledger-200 bg-white px-3 py-2 text-ink-900 dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
          />
        </label>
        {error && <p role="alert" className="rounded-md bg-alert-soft px-3 py-2 text-sm text-alert sm:col-span-2">{error}</p>}
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={isPending || !amount || Number(amount) <= 0 || Number(amount) > balanceDue}
            className="rounded-lg bg-ledger-900 px-4 py-2 text-sm font-medium text-white hover:bg-ledger-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-ink-900"
          >
            {isPending ? "Recording payment…" : "Record payment"}
          </button>
        </div>
      </form>
      <p className="mt-3 text-xs text-ledger-400 dark:text-ledger-500">
        This records the payment against the repair invoice; it does not create a bank deposit or process an online payment.
      </p>
    </section>
  );
}
