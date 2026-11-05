"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendServiceQuotation } from "@/app/(dashboard)/service-center/actions";

const CHANNELS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "sms", label: "SMS" },
  { value: "email", label: "Email" },
] as const;

export function ServiceQuotationDelivery({ quotationId }: { quotationId: string }) {
  const router = useRouter();
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]["value"]>("whatsapp");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function sendEstimate(formData: FormData) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await sendServiceQuotation(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(`Estimate sent to ${result.recipient} via ${result.provider}.`);
      router.refresh();
    });
  }

  return (
    <form action={sendEstimate} className="mt-4 rounded-lg border border-sky-200 bg-sky-50/60 p-3 dark:border-sky-900 dark:bg-sky-950/20">
      <input type="hidden" name="quotationId" value={quotationId} />
      <p className="text-xs text-ledger-600 dark:text-ledger-300">
        Send the estimate with a secure link customers can use to review, approve, or decline it. Link expires after 30 days. Sending is manual; provider charges may apply.
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="text-xs text-ledger-600 dark:text-ledger-300">
          Channel
          <select
            name="quotationChannel"
            value={channel}
            onChange={(event) => {
              const selected = CHANNELS.find((option) => option.value === event.target.value);
              if (selected) setChannel(selected.value);
            }}
            disabled={isPending}
            className="mt-1 block rounded border border-ledger-300 bg-white px-2 py-1.5 dark:border-ledger-600 dark:bg-ink-800"
          >
            {CHANNELS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <button type="submit" disabled={isPending} className="rounded bg-sky-700 px-3 py-2 text-xs font-medium text-white hover:bg-sky-800 disabled:opacity-50">
          {isPending ? "Sending..." : "Send estimate and portal link"}
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-alert">{error}</p>}
      {notice && <p role="status" className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">{notice}</p>}
    </form>
  );
}
