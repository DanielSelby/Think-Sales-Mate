"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface DashboardFiltersProps {
  action: string;
  from: string;
  to: string;
  branch: string;
  campuses: Array<{ id: string; name: string }>;
}

export function DashboardFilters({ action, from, to, branch, campuses }: DashboardFiltersProps) {
  const router = useRouter();
  const [fromValue, setFromValue] = useState(from);
  const [toValue, setToValue] = useState(to);
  const [branchValue, setBranchValue] = useState(branch);

  function applyFilters(nextFrom: string, nextTo: string, nextBranch: string) {
    if (!nextFrom || !nextTo || nextFrom > nextTo) return;
    const params = new URLSearchParams({ from: nextFrom, to: nextTo });
    if (nextBranch) params.set("branch", nextBranch);
    router.replace(`${action}?${params.toString()}`, { scroll: false });
  }

  return (
    <section className="rounded-xl border p-4 shadow-sm" style={{ borderColor: "var(--theme-header-border-light, #dbeafe)", backgroundColor: "var(--theme-surface, #fff)" }}>
      <div className="grid gap-3 md:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_minmax(220px,1fr)]">
        <label className="text-sm font-medium" style={{ color: "var(--theme-text, #111827)" }}>
          From
          <input
            type="date"
            value={fromValue}
            max={toValue}
            onChange={(event) => {
              setFromValue(event.target.value);
              applyFilters(event.target.value, toValue, branchValue);
            }}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal text-slate-900"
          />
        </label>
        <label className="text-sm font-medium" style={{ color: "var(--theme-text, #111827)" }}>
          To
          <input
            type="date"
            value={toValue}
            min={fromValue}
            onChange={(event) => {
              setToValue(event.target.value);
              applyFilters(fromValue, event.target.value, branchValue);
            }}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal text-slate-900"
          />
        </label>
        <label className="text-sm font-medium" style={{ color: "var(--theme-text, #111827)" }}>
          Campus
          <select
            value={branchValue}
            onChange={(event) => {
              setBranchValue(event.target.value);
              applyFilters(fromValue, toValue, event.target.value);
            }}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal text-slate-900"
          >
            <option value="">All assigned campuses</option>
            {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
        </label>
      </div>
      <p className="mt-3 text-xs" style={{ color: "var(--theme-text-muted, #4b5563)" }}>
        Fee payments, expenses, and admissions use the selected dates. Current outstanding fees show unpaid balances for the selected campus scope.
      </p>
    </section>
  );
}
