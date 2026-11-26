"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Printer, Search } from "lucide-react";
import {
  EDUCATION_STUDENT_STATUSES,
  type EducationStudentStatus,
} from "@/lib/education/student-directory";

interface StudentFiltersProps {
  action: string;
  search: string;
  gender: string;
  branch: string;
  classId: string;
  classes: Array<{ id: string; name: string }>;
  status: string;
  statusCounts: Record<EducationStudentStatus, number>;
  pageSize: string;
  campuses: Array<{ id: string; name: string }>;
  canExport: boolean;
  csvHref: string;
  printHref: string;
  exportFilename: string;
}

export function StudentFilters({
  action,
  search: initialSearch,
  gender: initialGender,
  branch: initialBranch,
  classId: initialClassId,
  classes,
  status: initialStatus,
  statusCounts,
  pageSize: initialPageSize,
  campuses,
  canExport,
  csvHref,
  printHref,
  exportFilename,
}: StudentFiltersProps) {
  const router = useRouter();
  const [search, setSearch] = useState(initialSearch);
  const [gender, setGender] = useState(initialGender);
  const [branch, setBranch] = useState(initialBranch);
  const [classId, setClassId] = useState(initialClassId);
  const [status, setStatus] = useState(initialStatus);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
  }, []);

  function applyFilters(
    nextSearch: string,
    nextGender: string,
    nextBranch: string,
    nextClassId: string,
    nextStatus: string,
    nextPageSize: string,
  ) {
    const params = new URLSearchParams();
    if (nextSearch.trim()) params.set("search", nextSearch.trim());
    if (nextGender.trim()) params.set("gender", nextGender.trim());
    if (nextBranch) params.set("branch", nextBranch);
    if (nextClassId) params.set("class", nextClassId);
    if (nextStatus !== "active") params.set("status", nextStatus);
    if (nextPageSize !== "10") params.set("pageSize", nextPageSize);
    const query = params.toString();
    router.replace(query ? `${action}?${query}` : action, { scroll: false });
  }

  function updateSearch(value: string) {
    setSearch(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      applyFilters(value, gender, branch, classId, status, pageSize);
    }, 350);
  }

  function updateGender(value: string) {
    setGender(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      applyFilters(search, value, branch, classId, status, pageSize);
    }, 350);
  }

  function updateBranch(value: string) {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    setBranch(value);
    setClassId("");
    applyFilters(search, gender, value, "", status, pageSize);
  }

  function updateClass(value: string) {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    setClassId(value);
    applyFilters(search, gender, branch, value, status, pageSize);
  }

  function updateStatus(value: string) {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    setStatus(value);
    applyFilters(search, gender, branch, classId, value, pageSize);
  }

  function updatePageSize(value: string) {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    setPageSize(value);
    applyFilters(search, gender, branch, classId, status, value);
  }

  const allCount = EDUCATION_STUDENT_STATUSES.reduce((total, item) => total + statusCounts[item], 0);
  const statusOptions = [
    { value: "all", count: allCount },
    ...EDUCATION_STUDENT_STATUSES.map((item) => ({ value: item, count: statusCounts[item] })),
  ];

  return <>
    <form
      method="get"
      action={action}
      onSubmit={(event) => {
        event.preventDefault();
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        applyFilters(search, gender, branch, classId, status, pageSize);
      }}
      className="grid gap-3 border-b border-slate-200 bg-slate-50/70 p-4 md:grid-cols-[minmax(220px,1fr)_180px_180px_180px_140px_auto] md:p-5"
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
      <label>
        <span className="sr-only">Filter by class</span>
        <select
          name="class"
          value={classId}
          onChange={(event) => updateClass(event.target.value)}
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
        >
          <option value="">All classes</option>
          {classes.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name}</option>)}
        </select>
      </label>
      <label>
        <span className="sr-only">Filter by gender</span>
        <input
          type="search"
          name="gender"
          value={gender}
          maxLength={50}
          onChange={(event) => updateGender(event.target.value)}
          placeholder="Gender contains..."
          aria-label="Filter by gender"
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
      </label>
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
      {canExport && <>
        <a href={csvHref} download={exportFilename} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Export CSV</a>
        <a href={printHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          <Printer className="h-4 w-4" /> Print / Save PDF
        </a>
      </>}
      <p className="text-xs text-slate-500 md:col-span-full">Search updates after you pause typing. The all-rows view is capped; use Export CSV for the complete filtered result.</p>
    </form>
    <div className="overflow-x-auto border-b border-slate-200 px-4 py-3 md:px-5">
      <div className="flex min-w-max gap-2" aria-label="Filter students by status">
        {statusOptions.map((item) => <button
          key={item.value}
          type="button"
          aria-pressed={status === item.value}
          onClick={() => updateStatus(item.value)}
          className={`rounded-full border px-3 py-1.5 text-sm font-medium capitalize transition ${
            status === item.value
              ? "border-blue-700 bg-blue-700 text-white"
              : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700"
          }`}
        >
          {item.value === "all" ? "All students" : item.value.replace("_", " ")}
          <span className={`ml-2 text-xs ${status === item.value ? "text-blue-100" : "text-slate-400"}`}>{item.count.toLocaleString()}</span>
        </button>)}
      </div>
    </div>
  </>;
}
