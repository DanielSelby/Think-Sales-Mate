"use client";

import { ChevronDown, Landmark } from "lucide-react";

interface BranchSelectorProps {
  selectedLocationId: string | null;
  locations: Array<{ id: string; name: string }>;
  isBranchScoped: boolean;
  selectedUserId?: string;
}

export function BranchSelector({ selectedLocationId, locations, isBranchScoped, selectedUserId }: BranchSelectorProps) {
  return (
    <form
      method="get"
      className="flex h-10 items-center gap-2 rounded-lg border border-[#d5e2ef] bg-white px-3 text-xs font-medium text-[#31577c] shadow-sm dark:border-ledger-700 dark:bg-ink-900"
    >
      {selectedUserId && <input type="hidden" name="user_id" value={selectedUserId} />}
      <Landmark className="h-4 w-4 text-[#2087e5]" />
      <select
        name="location_id"
        defaultValue={selectedLocationId ?? ""}
        onChange={(event) => event.currentTarget.form?.submit()}
        className="max-w-[150px] bg-transparent outline-none"
      >
        <option value="">{isBranchScoped ? "All assigned branches" : "All branches"}</option>
        {locations.map((location) => (
          <option key={location.id} value={location.id}>
            {location.name}
          </option>
        ))}
      </select>
      <ChevronDown className="h-3 w-3" />
    </form>
  );
}
