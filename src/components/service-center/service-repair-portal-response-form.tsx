"use client";

import { useState, useTransition } from "react";
import {
  respondToServiceRepairPortal,
  type ServiceRepairPortalActionState,
} from "@/app/service-repair/[token]/actions";

export function ServiceRepairPortalResponseForm({ token }: { token: string }) {
  const [state, setState] = useState<ServiceRepairPortalActionState>({ status: "idle" });
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  if (state.status === "success") {
    return (
      <p role="status" className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
        {state.message}
      </p>
    );
  }

  function submitDecision(decision: "approved" | "rejected") {
    const formData = new FormData();
    formData.set("token", token);
    formData.set("decision", decision);
    formData.set("note", note);
    startTransition(async () => {
      setState(await respondToServiceRepairPortal({ status: "idle" }, formData));
    });
  }

  return (
    <div className="mt-6 border-t border-ledger-200 pt-6 dark:border-ledger-700">
      <label className="block text-sm font-medium text-ledger-800 dark:text-ledger-200" htmlFor="portal-response-note">
        Note for the service center (optional)
      </label>
      <textarea
        id="portal-response-note"
        name="note"
        maxLength={500}
        rows={3}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        disabled={isPending}
        className="mt-2 w-full rounded-lg border border-ledger-300 bg-white p-3 text-sm text-ledger-900 outline-none focus:border-sky-500 dark:border-ledger-600 dark:bg-ink-800 dark:text-white"
      />
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => submitDecision("approved")}
          disabled={isPending}
          className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {isPending ? "Saving..." : "Approve estimate"}
        </button>
        <button
          type="button"
          onClick={() => submitDecision("rejected")}
          disabled={isPending}
          className="rounded-lg border border-alert px-4 py-2.5 text-sm font-medium text-alert hover:bg-alert/5 disabled:opacity-50"
        >
          {isPending ? "Saving..." : "Decline estimate"}
        </button>
      </div>
      {state.status === "error" && (
        <p role="alert" className="mt-3 text-sm text-alert">{state.message}</p>
      )}
    </div>
  );
}
