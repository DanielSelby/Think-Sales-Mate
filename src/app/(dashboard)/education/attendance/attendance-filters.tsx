"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type AttendanceFiltersProps = {
  attendancePath: string;
  attendanceDate: string;
  campuses: Array<{ id: string; name: string }>;
  classes: Array<{ id: string; name: string }>;
  canExport: boolean;
  canViewClasses: boolean;
  selectedBranch: string;
  selectedClass: string;
  selectedStatus: string;
  search: string;
  totalCount: number;
};

type FilterValues = {
  search: string;
  branch: string;
  date: string;
  status: string;
  class: string;
};

function createFilterParams(filters: FilterValues) {
  const params = new URLSearchParams({ date: filters.date });
  const search = filters.search.trim().slice(0, 80);
  if (search) params.set("search", search);
  if (filters.branch) params.set("branch", filters.branch);
  if (filters.status) params.set("status", filters.status);
  if (filters.class) params.set("class", filters.class);
  return params;
}

export function AttendanceFilters({
  attendancePath,
  attendanceDate,
  campuses,
  classes,
  canExport,
  canViewClasses,
  selectedBranch,
  selectedClass,
  selectedStatus,
  search,
  totalCount,
}: AttendanceFiltersProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [searchValue, setSearchValue] = useState(search);
  const [branchValue, setBranchValue] = useState(selectedBranch);
  const [dateValue, setDateValue] = useState(attendanceDate);
  const [statusValue, setStatusValue] = useState(selectedStatus);
  const [classValue, setClassValue] = useState(selectedClass);
  const filterValues = useRef<FilterValues>({
    search,
    branch: selectedBranch,
    date: attendanceDate,
    status: selectedStatus,
    class: selectedClass,
  });
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
  }, []);

  const navigateToFilters = (next: FilterValues) => {
    const query = createFilterParams(next).toString();
    startTransition(() => router.replace(`${attendancePath}?${query}`, { scroll: false }));
  };

  const handleSearchChange = (value: string) => {
    const next = { ...filterValues.current, search: value };
    filterValues.current = next;
    setSearchValue(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => navigateToFilters(next), 300);
  };

  const handleFilterChange = (key: "branch" | "date" | "status" | "class", value: string) => {
    const next = { ...filterValues.current, [key]: value };
    filterValues.current = next;
    if (searchTimer.current) {
      clearTimeout(searchTimer.current);
      searchTimer.current = null;
    }
    if (key === "branch") setBranchValue(value);
    else if (key === "date") setDateValue(value);
    else if (key === "status") setStatusValue(value);
    else setClassValue(value);
    navigateToFilters(next);
  };

  const exportHref = `/api/education/attendance/export?${createFilterParams({
    search: searchValue,
    branch: branchValue,
    date: dateValue,
    status: statusValue,
    class: classValue,
  }).toString()}`;

  return <section
    aria-busy={isPending}
    className="grid gap-3 border-b border-slate-200 bg-slate-50/70 p-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 md:p-5"
  >
    <label className="text-sm font-medium text-slate-700">Search students
      <input
        value={searchValue}
        onChange={(event) => handleSearchChange(event.currentTarget.value)}
        maxLength={80}
        placeholder="Name or student number"
        className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal"
      />
    </label>
    <label className="text-sm font-medium text-slate-700">Campus
      <select
        value={branchValue}
        onChange={(event) => handleFilterChange("branch", event.currentTarget.value)}
        className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal"
      >
        <option value="">All assigned campuses</option>
        {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
      </select>
    </label>
    <label className="text-sm font-medium text-slate-700">Attendance date
      <input
        type="date"
        value={dateValue}
        onChange={(event) => handleFilterChange("date", event.currentTarget.value)}
        className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal"
      />
    </label>
    <label className="text-sm font-medium text-slate-700">Status
      <select
        value={statusValue}
        onChange={(event) => handleFilterChange("status", event.currentTarget.value)}
        className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal"
      >
        <option value="">All statuses</option>
        <option value="present">Present</option>
        <option value="absent">Absent</option>
        <option value="late">Late</option>
        <option value="excused">Excused</option>
      </select>
    </label>
    {canViewClasses && <label className="text-sm font-medium text-slate-700">Class
      <select
        value={classValue}
        onChange={(event) => handleFilterChange("class", event.currentTarget.value)}
        className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal"
      >
        <option value="">All classes</option>
        {classes.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name}</option>)}
      </select>
    </label>}
    {canExport && totalCount > 0 && <a
      href={exportHref}
      className="self-end rounded-lg border border-slate-300 bg-white px-4 py-2 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50"
    >
      Export CSV
    </a>}
  </section>;
}
