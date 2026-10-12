"use client";

import { useState } from "react";
import { updateCashClosingBranchSchedule } from "./actions";

const shiftOptions = [
  { id: "full_day", label: "Full day" },
  { id: "morning", label: "Morning" },
  { id: "afternoon", label: "Afternoon" },
  { id: "night", label: "Night / overnight" },
] as const;

type ShiftWindows = Record<string, { start: string; end: string }>;
const defaultWindows: ShiftWindows = {
  morning: { start: "06:00", end: "14:00" },
  afternoon: { start: "14:00", end: "22:00" },
  night: { start: "22:00", end: "06:00" },
};

export function BranchScheduleEditor({
  locationId,
  requiredShifts,
  shiftWindows,
  timeZoneOverride,
  organizationTimeZone,
}: {
  locationId: string;
  requiredShifts: string[];
  shiftWindows: ShiftWindows;
  timeZoneOverride: string | null;
  organizationTimeZone: string;
}) {
  const [selectedShifts, setSelectedShifts] = useState(requiredShifts);
  const [windows, setWindows] = useState<ShiftWindows>({ ...defaultWindows, ...shiftWindows });
  const [selectedTimeZone, setSelectedTimeZone] = useState(timeZoneOverride ?? "");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const toggleShift = (shift: string) => {
    setSelectedShifts((current) => {
      if (shift === "full_day") return current.includes(shift) ? [] : [shift];
      const withoutFullDay = current.filter((value) => value !== "full_day");
      return withoutFullDay.includes(shift)
        ? withoutFullDay.filter((value) => value !== shift)
        : [...withoutFullDay, shift];
    });
  };

  const saveSchedule = async () => {
    setMessage("");
    setIsSaving(true);
    try {
      const result = await updateCashClosingBranchSchedule({
        locationId,
        requiredShifts: selectedShifts,
        shiftWindows: windows,
        timeZone: selectedTimeZone.trim() || null,
      });
      setMessage("error" in result ? result.error : "Schedule saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save this branch schedule.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-[10px] font-medium text-[#1478dd]">Configure required closings</summary>
      <div className="mt-2 space-y-2 rounded-md bg-[#f5f9fc] p-2 dark:bg-white/[0.03]">
        <p className="text-[10px] text-ledger-500">Overnight shifts belong to the date they start. End times earlier than start times finish the next day.</p>
        <label className="block text-[10px] font-medium text-ledger-600">
          Branch timezone override (IANA)
          <input value={selectedTimeZone} onChange={(event) => setSelectedTimeZone(event.target.value)} placeholder={`Organization default: ${organizationTimeZone}`} className="ml-2 h-7 rounded border px-2 text-[10px] dark:border-ledger-700 dark:bg-ink-900" />
          <span className="mt-1 block font-normal text-ledger-500">Leave blank to use the organization timezone ({organizationTimeZone}).</span>
        </label>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {shiftOptions.map((option) => (
            <label key={option.id} className="flex items-center gap-1 text-[10px] text-ledger-600">
              <input
                type="checkbox"
                checked={selectedShifts.includes(option.id)}
                onChange={() => toggleShift(option.id)}
              />
              {option.label}
            </label>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {shiftOptions.filter((option) => option.id !== "full_day" && selectedShifts.includes(option.id)).map((option) => (
            <fieldset key={option.id} className="rounded border border-ledger-200 p-2 dark:border-ledger-700">
              <legend className="px-1 text-[10px] font-semibold capitalize text-ledger-600">{option.label}</legend>
              <div className="flex items-center gap-1 text-[10px] text-ledger-500">
                <input type="time" aria-label={`${option.label} start time`} value={windows[option.id]?.start ?? ""} onChange={(event) => setWindows((current) => ({ ...current, [option.id]: { ...current[option.id], start: event.target.value } }))} className="min-w-0 rounded border px-1 py-0.5 dark:border-ledger-700 dark:bg-ink-900" />
                to
                <input type="time" aria-label={`${option.label} end time`} value={windows[option.id]?.end ?? ""} onChange={(event) => setWindows((current) => ({ ...current, [option.id]: { ...current[option.id], end: event.target.value } }))} className="min-w-0 rounded border px-1 py-0.5 dark:border-ledger-700 dark:bg-ink-900" />
              </div>
            </fieldset>
          ))}
        </div>
        <button
          type="button"
          disabled={isSaving || selectedShifts.length === 0}
          onClick={() => void saveSchedule()}
          className="rounded bg-[#1478dd] px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-50"
        >
          {isSaving ? "Saving…" : "Save schedule"}
        </button>
        {message && <p role="status" className={`text-[10px] ${message === "Schedule saved." ? "text-emerald-700" : "text-red-600"}`}>{message}</p>}
      </div>
    </details>
  );
}
