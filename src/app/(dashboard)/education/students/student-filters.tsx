"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

const STUDENT_STATUSES = ["active", "on_hold", "graduated", "transferred", "withdrawn", "archived"] as const;

interface StudentFiltersProps {
  action: string;
  search: string;
  branch: string;
  status: string;
  pageSize: string;
  campuses: Array<{ id: string; name: string }>;
  canExport: boolean;
  csvHref: string;
  exportFilename: string;
}

export function StudentFilters({
  action,
  search: initialSearch,
  branch: initialBranch,
  status: initialStatus,
  pageSize: initialPageSize,
  campuses,
  canExport,
  csvHref,
  exportFilename,
}: StudentFiltersProps) {
  const router = useRouter();
  const [search, setSearch] = useState(initialSearch);
  const [branch, setBranch] = useState(initialBranch);
  const [status, setStatus] = useState(initialStatus);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
  }, []);

  function applyFilters(nextSearch: string, nextBranch: string, nextStatus: string, nextPageSize: string) {
    const params = new URLSearchParams();
    if (nextSearch.trim()) params.set("search", nextSearch.trim());
    if (nextBranch) params.set("branch", nextBranch);
    if (nextStatus !== "active") params.set("status", nextStatus);
    if (nextPageSize !== "10") params.set("pageSize", nextPageSize);
    const query = params.toString();
    router.replace(query ? `${action}?${query}` : action, { scroll: false });
  }

  function updateSearch(value: string) {
    setSearch(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      applyFilters(value, branch, status, pageSize);
    }, 350);
  }

  function updateBranch(value: string) {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    setBranch(value);
    applyFilters(search, value, status, pageSize);
  }

  function updateStatus(value: string) {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    setStatus(value);
    applyFilters(search, branch, value, pageSize);
  }

  function updatePageSize(value: string) {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    setPageSize(value);
    applyFilters(search, branch, status, value);
  }

  return (
    <form
      method="get"
      action={action}
      onSubmit={(event) => {
        event.preventDefault();
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        applyFilters(search, branch, status, pageSize);
      }}
      className="grid gap-3 border-b border-slate-200 bg-slate-50/70 p-4 md:grid-cols-[minmax(220px,1fr)_200px_220px_140px_auto] md:p-5"
    >
      <label className="relative block">
        <span className="sr-only">Search by student name or number</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          name="search"
          value={search}
          maxLength={80}
          onChange={(event) => updateSearch(event.target.value)}
          placeholder="Search name or student number"
          className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
      </label>
      <select
        name="branch"
        value={branch}
        onChange={(event) => updateBranch(event.target.value)}
        className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
      >
        <option value="">All assigned campuses</option>
        {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
      </select>
      <select
        name="status"
        value={status}
        onChange={(event) => updateStatus(event.target.value)}
        className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
      >
        {STUDENT_STATUSES.map((item) => <option key={item} value={item}>{item.replace("_", " ")}</option>)}
      </select>
      <label className="sr-only" htmlFor="student-page-size">Rows per page</label>
      <select
        id="student-page-size"
        name="pageSize"
        value={pageSize}
        onChange={(event) => updatePageSize(event.target.value)}
        aria-label="Rows per page"
        className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
      >
        <option value="10">10 rows</option>
        <option value="50">50 rows</option>
        <option value="100">100 rows</option>
        <option value="all">All rows (up to 250)</option>
      </select>
      {canExport && <a href={csvHref} download={exportFilename} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Export CSV</a>}
      <p className="text-xs text-slate-500 md:col-span-full">Search updates after you pause typing. The all-rows view is capped; use Export CSV for the complete filtered result.</p>
    </form>
  );
}
