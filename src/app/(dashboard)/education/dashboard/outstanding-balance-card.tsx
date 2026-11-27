"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Wallet } from "lucide-react";

type OutstandingStudent = {
  id: string;
  name: string;
  balance: string;
};

export function OutstandingBalanceCard({
  value,
  href,
  students,
  canViewStudents,
}: {
  value: string;
  href?: string;
  students: OutstandingStudent[];
  canViewStudents: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return <article
    data-outstanding-balance-card
    className={`relative min-w-0 overflow-visible rounded-xl border border-rose-200 bg-rose-50 p-4 shadow-sm${isOpen ? " z-20" : ""}`}
  >
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm leading-5 text-slate-600">Outstanding fees</p>
        <p className="mt-2 text-xl font-bold text-slate-950">{value}</p>
        <p className="mt-1 text-[11px] leading-4 text-slate-600">
          {canViewStudents ? "View students with pending balances" : "Student-level fee aging access is required"}
        </p>
        {href && <Link href={href} className="mt-1 inline-block text-[11px] font-semibold text-blue-700 hover:text-blue-900">
          Open fee details
        </Link>}
      </div>
      <div className="flex flex-col items-center gap-2">
        <span data-education-metric-icon data-icon-tone="rose" className="grid h-11 w-11 place-items-center rounded-xl bg-rose-100 text-rose-700">
          <Wallet className="h-5 w-5" aria-hidden="true" />
        </span>
        <button
          type="button"
          aria-label={isOpen ? "Hide outstanding student balances" : "View outstanding student balances"}
          aria-expanded={isOpen}
          aria-controls="outstanding-student-balances"
          disabled={!canViewStudents}
          onClick={() => setIsOpen((open) => !open)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-rose-700 transition hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isOpen ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
    </div>

    {isOpen && <div
      id="outstanding-student-balances"
      className="absolute left-0 top-[calc(100%+0.5rem)] z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-xl"
    >
      <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold">Students with pending balances</h2>
      {students.length ? <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto">
        {students.map((student) => <li key={student.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
          <span className="min-w-0 truncate font-medium">{student.name}</span>
          <span className="shrink-0 font-semibold tabular-nums">{student.balance}</span>
        </li>)}
      </ul> : <p className="px-4 py-4 text-sm text-slate-600">No students currently have an outstanding balance.</p>}
      {href && <div className="border-t border-slate-200 px-4 py-3">
        <Link href={href} className="text-sm font-semibold text-blue-700 hover:text-blue-900">
          View full outstanding list
        </Link>
      </div>}
    </div>}
  </article>;
}
