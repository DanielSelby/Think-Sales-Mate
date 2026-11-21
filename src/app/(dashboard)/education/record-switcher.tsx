"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
  const [queryState, setQueryState] = useState({ search, value: search });
  const query = queryState.search === search ? queryState.value : search;
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const normalizedQuery = query.trim().slice(0, 80);
    if (normalizedQuery === search) return;

    const timeout = setTimeout(() => {
      const params = new URLSearchParams();
      if (tab) params.set("tab", tab);
      if (normalizedQuery) params.set("switchSearch", normalizedQuery);
      const queryString = params.toString();
      router.replace(`${searchPath}${queryString ? `?${queryString}` : ""}`, { scroll: false });
    }, 250);
    return () => clearTimeout(timeout);
  }, [query, router, search, searchPath, tab]);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const searchTerm = query.trim().toLocaleLowerCase();
  const currentRecords = searchTerm && searchTerm !== search.toLocaleLowerCase()
    ? records.filter((record) => record.label.toLocaleLowerCase().includes(searchTerm))
    : records;
  const visibleRecords = currentRecords.slice(0, 8);

  return <section
    ref={containerRef}
    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
  >
    <label className="block max-w-2xl text-sm font-medium text-slate-700">
      Search {recordType}s
      <span className="relative mt-1 block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="education-record-search-results"
          value={query}
          maxLength={80}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQueryState({ search, value: event.target.value });
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
            if (event.key === "Enter" && open && visibleRecords.length === 1) {
              event.preventDefault();
              router.push(visibleRecords[0].href);
            }
          }}
          placeholder={`Name or ${recordType === "student" ? "student" : "staff"} number`}
          className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
      </span>
    </label>
    {open && <div
      id="education-record-search-results"
      role="listbox"
      aria-label={`${recordType} search results`}
      className="mt-2 max-h-72 max-w-2xl overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
    >
      {visibleRecords.length ? visibleRecords.map((record) => <Link
        key={record.id}
        href={record.href}
        role="option"
        aria-selected="false"
        onClick={() => setOpen(false)}
        className="block px-3 py-2 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-900"
      >{record.label}</Link>) : <p className="px-3 py-3 text-sm text-slate-500">
        {query.trim() ? `No ${recordType}s match "${query.trim()}".` : `No ${recordType} records found.`}
      </p>}
    </div>}
    {records.length === 50 && <p className="mt-2 max-w-2xl text-xs text-slate-500">Showing the first 50 matches. Refine the search to find another record.</p>}
  </section>;
}
