"use client";

import { useState } from "react";
import { acknowledgeMissedCashClosing } from "./actions";

export function MissedClosingAcknowledgement({
  locationId,
  closingDate,
  shift,
}: {
  locationId: string;
  closingDate: string;
  shift: string;
}) {
  const [message, setMessage] = useState("");
  const [isAcknowledged, setIsAcknowledged] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const acknowledge = async () => {
    setMessage("");
    setIsSaving(true);
    try {
      const result = await acknowledgeMissedCashClosing({ locationId, closingDate, shift });
      if ("error" in result) {
        setMessage(result.error);
      } else {
        setIsAcknowledged(true);
        setMessage("Missed closing acknowledged.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not acknowledge this missed closing.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={isSaving || isAcknowledged}
        onClick={() => void acknowledge()}
        className="rounded border border-amber-300 px-2 py-1 text-[10px] font-semibold text-amber-800 disabled:opacity-60"
      >
        {isSaving ? "Saving…" : isAcknowledged ? "Acknowledged" : "Acknowledge"}
      </button>
      {message && <span role="status" className="max-w-48 text-[10px] text-ledger-500">{message}</span>}
    </span>
  );
}
