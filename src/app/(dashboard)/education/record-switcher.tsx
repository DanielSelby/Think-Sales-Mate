"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

export type EducationRecordSwitchOption = {
  id: string;
  label: string;
  href: string;
};

export function EducationRecordSwitcher({
  recordType,
  searchPath,
  search,
  tab,
  records,
}: {
  recordType: "student" | "staff";
  searchPath: string;
  search: string;
  tab?: string;
  records: EducationRecordSwitchOption[];
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState("");

  return <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[minmax(240px,1fr)_minmax(240px,1fr)]">
    <form method="get" action={searchPath} className="flex items-end gap-2">
      {tab && <input type="hidden" name="tab" value={tab} />}
      <label className="min-w-0 flex-1 text-sm font-medium text-slate-700">
        Search {recordType}s
        <span className="relative mt-1 block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            name="switchSearch"
            defaultValue={search}
            maxLength={80}
            placeholder={`Name or ${recordType === "student" ? "student" : "staff"} number`}
            className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </span>
      </label>
      <button type="submit" className="shrink-0 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100">
        Search
      </button>
    </form>
    <label className="text-sm font-medium text-slate-700">
      Select {recordType}
      <select
        value={selectedId}
        onChange={(event) => {
          const nextId = event.target.value;
          setSelectedId(nextId);
          const record = records.find((item) => item.id === nextId);
          if (record) router.push(record.href);
        }}
        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal"
      >
        <option value="">{records.length ? `Choose from ${records.length} result${records.length === 1 ? "" : "s"}` : "No matching records"}</option>
        {records.map((record) => <option key={record.id} value={record.id}>{record.label}</option>)}
      </select>
    </label>
    {records.length === 50 && <p className="text-xs text-slate-500 sm:col-span-2">Showing the first 50 results. Refine the search to find another record.</p>}
  </section>;
}
