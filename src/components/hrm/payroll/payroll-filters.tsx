"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export interface PayrollFilters {
  month?: string;
  year?: string;
  branch?: string;
  department?: string;
  status?: string;
  payroll_type?: string;
  employee?: string;
}

export function PayrollFilters({
  filters,
  monthOptions,
  yearOptions,
  branches,
  departmentOptions,
}: {
  filters: PayrollFilters;
  monthOptions: string[];
  yearOptions: string[];
  branches: { id: string; name: string }[];
  departmentOptions: string[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentQuery = searchParams.toString();
  const [values, setValues] = useState<PayrollFilters>(filters);
  const isInitialRender = useRef(true);

  useEffect(() => {
    if (isInitialRender.current) {
      isInitialRender.current = false;
      return;
    }
    const timeoutId = window.setTimeout(() => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(values)) {
        if (value?.trim()) params.set(key, value.trim());
      }
      const query = params.toString();
      if (query === currentQuery) return;
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }, values.employee !== filters.employee ? 300 : 0);

    return () => window.clearTimeout(timeoutId);
  }, [currentQuery, filters.employee, pathname, router, values]);

  function setFilter(key: keyof PayrollFilters, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  const fieldClass = "mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-ledger-700 dark:bg-ink-950";
  const labelClass = "text-[10px] font-semibold text-slate-500";

  return (
    <div className="grid gap-3 rounded-xl border border-[#dce8f2] bg-white p-3 shadow-sm dark:border-ledger-700 dark:bg-ink-900 md:grid-cols-3 xl:grid-cols-7">
      <label className={labelClass}>
        Payroll Month
        <select value={values.month ?? ""} onChange={(event) => setFilter("month", event.target.value)} className={fieldClass}>
          <option value="">All months</option>
          {monthOptions.map((month) => <option key={month} value={month}>{new Date(`${month}-01T00:00:00Z`).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" })}</option>)}
        </select>
      </label>
      <label className={labelClass}>
        Payroll Year
        <select value={values.year ?? ""} onChange={(event) => setFilter("year", event.target.value)} className={fieldClass}>
          <option value="">All years</option>
          {yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
        </select>
      </label>
      <label className={labelClass}>
        Branch
        <select value={values.branch ?? ""} onChange={(event) => setFilter("branch", event.target.value)} className={fieldClass}>
          <option value="">All branches</option>
          {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </select>
      </label>
      <label className={labelClass}>
        Department
        <select value={values.department ?? ""} onChange={(event) => setFilter("department", event.target.value)} className={fieldClass}>
          <option value="">All departments</option>
          {departmentOptions.map((department) => <option key={department} value={department}>{department}</option>)}
        </select>
      </label>
      <label className={labelClass}>
        Payment Status
        <select value={values.status ?? ""} onChange={(event) => setFilter("status", event.target.value)} className={fieldClass}>
          <option value="">All statuses</option>
          <option value="paid">Paid</option>
          <option value="pending">Pending</option>
          <option value="partially_paid">Partially Paid</option>
          <option value="processing">Processing</option>
        </select>
      </label>
      <label className={labelClass}>
        Payroll Type
        <select value={values.payroll_type ?? ""} onChange={(event) => setFilter("payroll_type", event.target.value)} className={fieldClass}>
          <option value="">All types</option>
          <option value="Monthly">Monthly</option>
          <option value="Weekly">Weekly</option>
          <option value="Contract">Contract</option>
        </select>
      </label>
      <div className={labelClass}>
        Search Employee
        <div className="relative mt-1">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            value={values.employee ?? ""}
            onChange={(event) => setFilter("employee", event.target.value)}
            placeholder="Name or employee ID..."
            className="h-9 w-full rounded-md border border-slate-200 bg-white pl-8 pr-2 text-xs dark:border-ledger-700 dark:bg-ink-950"
          />
        </div>
      </div>
      <div className="flex items-end">
        <button type="button" onClick={() => setValues({})} className="inline-flex h-9 items-center rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-600 dark:border-ledger-700 dark:text-slate-300">
          Clear Filters
        </button>
      </div>
    </div>
  );
}
