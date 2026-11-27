"use client";

import { useMemo, useState } from "react";

type AttendanceRecord = {
  attendance_date: string;
  status: string;
};

type Period = "days" | "months" | "quarter" | "yearly";

type Bucket = {
  key: string;
  label: string;
  total: number;
  present: number;
};

const PERIOD_OPTIONS: Array<{ value: Period; label: string }> = [
  { value: "days", label: "Days" },
  { value: "months", label: "Months" },
  { value: "quarter", label: "Qtr" },
  { value: "yearly", label: "Yearly" },
];

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDay(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatMonth(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}-01T00:00:00.000Z`));
}

function createPeriods(period: Period, now: Date): Bucket[] {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();

  if (period === "days") {
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(Date.UTC(year, month, now.getUTCDate() - 6 + index));
      const key = dateKey(date);
      return { key, label: formatDay(key), total: 0, present: 0 };
    });
  }

  if (period === "months") {
    return Array.from({ length: 12 }, (_, index) => {
      const date = new Date(Date.UTC(year, month - 11 + index, 1));
      const key = dateKey(date).slice(0, 7);
      return { key, label: formatMonth(key), total: 0, present: 0 };
    });
  }

  if (period === "quarter") {
    const currentQuarter = Math.floor(month / 3);
    return Array.from({ length: 4 }, (_, index) => {
      const date = new Date(Date.UTC(year, currentQuarter * 3 - 9 + index * 3, 1));
      const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
      const key = `${date.getUTCFullYear()}-Q${quarter}`;
      return { key, label: `Q${quarter} · ${date.getUTCFullYear()}`, total: 0, present: 0 };
    });
  }

  return Array.from({ length: 5 }, (_, index) => {
    const periodYear = year - 4 + index;
    return { key: String(periodYear), label: String(periodYear), total: 0, present: 0 };
  });
}

function bucketKey(value: string, period: Period): string | null {
  const date = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (period === "days") return date;
  if (period === "months") return date.slice(0, 7);
  const year = Number(date.slice(0, 4));
  if (period === "yearly") return String(year);
  const month = Number(date.slice(5, 7));
  return `${year}-Q${Math.ceil(month / 3)}`;
}

export function AttendanceTrend({ records, today }: { records: AttendanceRecord[]; today: string }) {
  const [period, setPeriod] = useState<Period>("months");
  const buckets = useMemo(() => {
    const items = createPeriods(period, new Date(`${today}T00:00:00.000Z`));
    const bucketByKey = new Map(items.map((item) => [item.key, item]));
    for (const record of records) {
      const key = bucketKey(record.attendance_date, period);
      const bucket = key ? bucketByKey.get(key) : undefined;
      if (!bucket) continue;
      bucket.total += 1;
      if (record.status === "present") bucket.present += 1;
    }
    return items;
  }, [period, records, today]);

  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-slate-950">Attendance trend</h2>
        <p className="mt-1 text-xs text-slate-500">Present as a share of recorded sessions. Days: last 7; months: last 12; Qtr: last 4; yearly: last 5 calendar years.</p>
      </div>
      <div role="group" aria-label="Attendance trend period" className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
        {PERIOD_OPTIONS.map((option) => <button
          key={option.value}
          type="button"
          aria-pressed={period === option.value}
          onClick={() => setPeriod(option.value)}
          className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${
            period === option.value
              ? "bg-blue-700 text-white shadow-sm"
              : "text-slate-600 hover:bg-white hover:text-slate-950"
          }`}
        >{option.label}</button>)}
      </div>
    </div>
    <ul className="mt-4 max-h-80 space-y-3 overflow-y-auto">
      {buckets.map((bucket) => {
        const rate = bucket.total ? (bucket.present / bucket.total) * 100 : null;
        return <li key={bucket.key} className="grid grid-cols-[88px_minmax(0,1fr)_58px] items-center gap-3 text-xs">
          <span className="truncate text-slate-500">{bucket.label}</span>
          <span
            role="img"
            className="h-2 overflow-hidden rounded-full bg-slate-100"
            aria-label={rate === null ? `${bucket.label}: no attendance records` : `${bucket.label}: ${rate.toFixed(1)}% attendance`}
            title={rate === null ? "No attendance records" : `${bucket.present} present of ${bucket.total} records`}
          >
            <span className="block h-full rounded-full bg-blue-600" style={{ width: `${rate ?? 0}%` }} />
          </span>
          <span className="text-right font-medium text-slate-700">{rate === null ? "—" : `${rate.toFixed(0)}%`}</span>
        </li>;
      })}
    </ul>
  </section>;
}
