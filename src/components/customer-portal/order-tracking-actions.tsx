"use client";

import { useState } from "react";
import { CheckCircle2, MessageSquare } from "lucide-react";
import { confirmOrderReceived } from "@/app/order/[orgSlug]/track/[token]/actions";

export function OrderTrackingActions({ token, canConfirm, alreadyReceived }: { token: string; canConfirm: boolean; alreadyReceived: boolean }) {
  const [feedback, setFeedback] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const result = await confirmOrderReceived(token, feedback);
    setBusy(false);
    if (result.error) setMessage(result.error);
    else {
      setMessage("Thank you. Your order has been marked as received.");
      window.setTimeout(() => window.location.reload(), 700);
    }
  }

  if (alreadyReceived) return <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800"><CheckCircle2 className="mr-2 inline h-4 w-4" />Order received confirmation submitted.</div>;
  if (!canConfirm) return null;
  return (
    <div className="rounded-xl border border-ledger-200 bg-white p-5 shadow-sm dark:border-ledger-700 dark:bg-ink-900">
      <h2 className="flex items-center gap-2 text-sm font-bold text-ink-900 dark:text-white"><MessageSquare className="h-4 w-4 text-signal" /> Confirm delivery and leave feedback</h2>
      <textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} maxLength={1000} rows={3} placeholder="Tell us about your delivery (optional)" className="mt-3 w-full rounded-xl border border-ledger-200 p-3 text-sm outline-none focus:border-signal dark:border-ledger-700 dark:bg-ink-950" />
      {message && <p className="mt-2 text-xs font-semibold text-amber-700">{message}</p>}
      <button type="button" disabled={busy} onClick={() => void submit()} className="mt-3 inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{busy ? "Saving..." : "Order Received"}</button>
    </div>
  );
}
