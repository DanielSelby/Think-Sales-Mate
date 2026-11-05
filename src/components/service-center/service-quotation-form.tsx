"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createServiceQuotation } from "@/app/(dashboard)/service-center/actions";
import type { ServiceJobStatus } from "@/types/database";

type QuotationJobOption = {
  id: string;
  job_number: string;
  status: ServiceJobStatus;
};

type QuotationLine = {
  id: number;
  description: string;
  quantity: string;
  unitPrice: string;
};

const inputClass = "w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 text-sm dark:border-ledger-600 dark:bg-ink-800";

export function ServiceQuotationForm({
  jobs,
  currency,
}: {
  jobs: QuotationJobOption[];
  currency: string;
}) {
  const router = useRouter();
  const [lines, setLines] = useState<QuotationLine[]>([{ id: 1, description: "", quantity: "1", unitPrice: "" }]);
  const [nextLineId, setNextLineId] = useState(2);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function updateLine(id: number, field: keyof Omit<QuotationLine, "id">, value: string) {
    setLines((current) => current.map((line) => line.id === id ? { ...line, [field]: value } : line));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setError(null);
    setNotice(null);
    setIsPending(true);
    try {
      const result = await createServiceQuotation(new FormData(form));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      form.reset();
      setLines([{ id: nextLineId, description: "", quantity: "1", unitPrice: "" }]);
      setNextLineId((id) => id + 1);
      setNotice("Estimate created as a draft.");
      router.refresh();
    } catch (cause) {
      console.error("Service quotation creation failed:", cause);
      setError("The estimate could not be created. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-ledger-200 bg-white p-5 dark:border-ledger-700 dark:bg-ink-900">
      <div>
        <h3 className="font-semibold text-ledger-900 dark:text-white">Prepare a repair estimate</h3>
        <p className="mt-1 text-sm text-ledger-500 dark:text-ledger-400">
          Save a draft, then send a plain-text summary through a configured provider or record a message you sent yourself. Customer decisions are still recorded by staff.
        </p>
      </div>
      {(error || notice) && (
        <p role={error ? "alert" : "status"} className={`rounded-lg border px-3 py-2 text-sm ${error ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200" : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"}`}>
          {error ?? notice}
        </p>
      )}
      <label className="block space-y-1 text-sm text-ledger-700 dark:text-ledger-200">
        <span>Service job</span>
        <select name="quotationJobId" required disabled={isPending || !jobs.length} className={inputClass}>
          <option value="">Select a job ready for an estimate</option>
          {jobs.map((job) => <option key={job.id} value={job.id}>{job.job_number}</option>)}
        </select>
      </label>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-ledger-700 dark:text-ledger-200">Estimate items</span>
          <button type="button" disabled={isPending || lines.length >= 50} onClick={() => {
            setLines((current) => [...current, { id: nextLineId, description: "", quantity: "1", unitPrice: "" }]);
            setNextLineId((id) => id + 1);
          }} className="text-sm font-medium text-amber-700 hover:text-amber-800 disabled:opacity-50 dark:text-amber-300">
            Add item
          </button>
        </div>
        {lines.map((line, index) => (
          <div key={line.id} className="grid gap-2 rounded-lg border border-ledger-200 p-3 dark:border-ledger-700 sm:grid-cols-[minmax(0,1fr)_110px_150px_auto]">
            <label className="space-y-1 text-xs text-ledger-600 dark:text-ledger-300">
              <span>Description</span>
              <input name="itemDescription" required maxLength={200} value={line.description} onChange={(event) => updateLine(line.id, "description", event.target.value)} disabled={isPending} className={inputClass} />
            </label>
            <label className="space-y-1 text-xs text-ledger-600 dark:text-ledger-300">
              <span>Quantity</span>
              <input name="itemQuantity" type="number" min="0.01" max="10000" step="0.01" required value={line.quantity} onChange={(event) => updateLine(line.id, "quantity", event.target.value)} disabled={isPending} className={inputClass} />
            </label>
            <label className="space-y-1 text-xs text-ledger-600 dark:text-ledger-300">
              <span>Unit price ({currency})</span>
              <input name="itemUnitPrice" type="number" min="0" max="100000000" step="0.01" required value={line.unitPrice} onChange={(event) => updateLine(line.id, "unitPrice", event.target.value)} disabled={isPending} className={inputClass} />
            </label>
            <button type="button" aria-label={`Remove estimate line ${index + 1}`} disabled={isPending || lines.length === 1} onClick={() => setLines((current) => current.filter((entry) => entry.id !== line.id))} className="self-end rounded-lg px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-40 dark:text-red-300 dark:hover:bg-red-950/30">
              Remove
            </button>
          </div>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm text-ledger-700 dark:text-ledger-200">
          <span>Tax rate (%)</span>
          <input name="quotationTaxRate" type="number" min="0" max="100" step="0.01" defaultValue="0" disabled={isPending} className={inputClass} />
        </label>
        <label className="space-y-1 text-sm text-ledger-700 dark:text-ledger-200">
          <span>Notes for the estimate (optional)</span>
          <input name="quotationNotes" maxLength={2000} disabled={isPending} className={inputClass} />
        </label>
      </div>
      <button type="submit" disabled={isPending || !jobs.length} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">
        {isPending ? "Saving..." : "Save estimate draft"}
      </button>
      {!jobs.length && <p className="text-sm text-ledger-500 dark:text-ledger-400">Move a job to Inspection or Awaiting quotation before creating an estimate.</p>}
    </form>
  );
}
