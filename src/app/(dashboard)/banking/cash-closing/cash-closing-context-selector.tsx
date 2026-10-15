"use client";

import { useRouter } from "next/navigation";

type LocationOption = { id: string; name: string };

export function CashClosingContextSelector({
  date,
  locationId,
  locations,
  shift,
}: {
  date: string;
  locationId: string;
  locations: LocationOption[];
  shift: string;
}) {
  const router = useRouter();

  function updateContext(name: "business_date" | "location_id" | "close_shift", value: string) {
    const params = new URLSearchParams(window.location.search);
    params.set("tab", "today");
    if (value) params.set(name, value);
    else params.delete(name);
    router.replace(`/banking/cash-closing?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="mb-4 grid gap-3 rounded-xl border border-[#dce8f2] bg-white p-4 shadow-sm dark:border-ledger-700 dark:bg-ink-900 sm:grid-cols-3">
      <label className="text-xs font-medium text-ledger-600 dark:text-ledger-300">
        Business date
        <input
          type="date"
          value={date}
          onChange={(event) => updateContext("business_date", event.target.value)}
          className="mt-1 h-10 w-full rounded-md border border-ledger-200 px-3 dark:border-ledger-700 dark:bg-ink-950"
        />
      </label>
      <label className="text-xs font-medium text-ledger-600 dark:text-ledger-300">
        Branch
        <select
          value={locationId}
          onChange={(event) => updateContext("location_id", event.target.value)}
          className="mt-1 h-10 w-full rounded-md border border-ledger-200 px-3 dark:border-ledger-700 dark:bg-ink-950"
        >
          <option value="">All accessible branches</option>
          {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
        </select>
      </label>
      <label className="text-xs font-medium text-ledger-600 dark:text-ledger-300">
        Shift
        <select
          value={shift}
          onChange={(event) => updateContext("close_shift", event.target.value)}
          className="mt-1 h-10 w-full rounded-md border border-ledger-200 px-3 dark:border-ledger-700 dark:bg-ink-950"
        >
          <option value="full_day">Full day</option>
          <option value="morning">Morning</option>
          <option value="afternoon">Afternoon</option>
          <option value="night">Night / overnight</option>
        </select>
      </label>
    </div>
  );
}
