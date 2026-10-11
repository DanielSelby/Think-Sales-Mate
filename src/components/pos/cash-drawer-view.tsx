"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownToLine, ArrowUpFromLine, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { recordPosCashMovement } from "@/app/(dashboard)/pos/actions";
import { TransactionFeedback } from "@/components/transactions/transaction-feedback";

export function CashDrawerView({ registerSessionId }: { registerSessionId: string; currency: string }) {
  const router = useRouter();
  const [type, setType] = useState<"cash_in" | "cash_out" | "paid_out">("cash_in");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setFeedback(null);
    startTransition(async () => {
      const result = await recordPosCashMovement({
        registerSessionId,
        type,
        amount: Number(amount),
        reason,
        reference,
      });
      if (!result.ok) {
        setFeedback({ kind: "error", message: result.error ?? "Could not record this movement." });
        return;
      }
      setAmount("");
      setReason("");
      setReference("");
      setFeedback(result.error
        ? { kind: "error", message: result.error }
        : { kind: "success", message: "Cash movement recorded." });
      router.refresh();
    });
  }

  return (
    <section className="h-fit rounded-xl border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900">
      <h2 className="font-semibold text-ink-900 dark:text-white">Record Cash Movement</h2>
      <p className="mt-1 text-xs text-ledger-500 dark:text-ledger-400">Movements are attached to this open register session. Record a business expense in Expenses instead of also recording it as a paid-out movement.</p>
      {feedback && <TransactionFeedback kind={feedback.kind} message={feedback.message} onClose={() => setFeedback(null)} />}
      <div className="mt-4 grid grid-cols-3 gap-1 rounded-lg bg-ledger-50 p-1 dark:bg-white/[0.04]">
        {(["cash_in", "cash_out", "paid_out"] as const).map((value) => (
          <button type="button" key={value} onClick={() => setType(value)} className={`rounded-md px-2 py-2 text-xs font-semibold capitalize ${type === value ? "bg-white text-ink-900 shadow-sm dark:bg-ink-800 dark:text-white" : "text-ledger-500 dark:text-ledger-400"}`}>{value.replaceAll("_", " ")}</button>
        ))}
      </div>
      <label className="mt-3 block text-xs font-semibold text-ledger-600 dark:text-ledger-300">
        Amount
        <input type="number" min="0.01" step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-ledger-200 bg-white px-3 text-sm text-ink-900 dark:border-ledger-700 dark:bg-ink-950 dark:text-white" />
      </label>
      <label className="mt-3 block text-xs font-semibold text-ledger-600 dark:text-ledger-300">
        Reason
        <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={240} className="mt-1 h-10 w-full rounded-md border border-ledger-200 bg-white px-3 text-sm text-ink-900 dark:border-ledger-700 dark:bg-ink-950 dark:text-white" placeholder="Required" />
      </label>
      <label className="mt-3 block text-xs font-semibold text-ledger-600 dark:text-ledger-300">
        Reference (optional)
        <input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={120} className="mt-1 h-10 w-full rounded-md border border-ledger-200 bg-white px-3 text-sm text-ink-900 dark:border-ledger-700 dark:bg-ink-950 dark:text-white" />
      </label>
      <Button type="button" className="mt-4 w-full" disabled={pending || !amount || !reason.trim()} onClick={submit}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : type === "cash_in" ? <ArrowDownToLine className="h-4 w-4" /> : <ArrowUpFromLine className="h-4 w-4" />}
        {pending ? "Recording..." : "Record Movement"}
      </Button>
    </section>
  );
}
