"use client";

import { useMemo, useState } from "react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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

function createPeriods(period: Period, now: Date): Bucket[] {
  const year = now.getUTCFullYear();

  if (period === "days") {
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(Date.UTC(year, now.getUTCMonth(), now.getUTCDate()));
      const daysSinceMonday = (date.getUTCDay() + 6) % 7;
      date.setUTCDate(date.getUTCDate() - daysSinceMonday + index);
      const key = dateKey(date);
      return {
        key,
        label: new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: "UTC" }).format(date),
        total: 0,
        present: 0,
      };
    });
  }

  if (period === "months") {
    return Array.from({ length: 12 }, (_, index) => {
      const date = new Date(Date.UTC(year, index, 1));
      const key = dateKey(date).slice(0, 7);
      return { key, label: new Intl.DateTimeFormat(undefined, { month: "short", timeZone: "UTC" }).format(date), total: 0, present: 0 };
    });
  }

  if (period === "quarter") {
    return Array.from({ length: 4 }, (_, index) => {
      const quarter = index + 1;
      return { key: `${year}-Q${quarter}`, label: `Q${quarter}`, total: 0, present: 0 };
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
  const chartData = buckets.map((bucket) => ({
    ...bucket,
    rate: bucket.total ? (bucket.present / bucket.total) * 100 : null,
  }));

  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-slate-950">Attendance trend</h2>
        <p className="mt-1 text-xs text-slate-500">Present as a share of recorded sessions for each period.</p>
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
    <div className="mt-4 h-64 w-full" role="img" aria-label="Student attendance rate trend chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 12, left: -12, bottom: 4 }}>
          <XAxis
            dataKey="label"
            orientation="bottom"
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickLine={false}
            axisLine={{ stroke: "#cbd5e1" }}
            interval={0}
          />
          <YAxis
            domain={[0, 100]}
            tickFormatter={(value) => `${value}%`}
            width={48}
            tick={{ fontSize: 10, fill: "#64748b" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            labelFormatter={(label) => String(label ?? "")}
            formatter={(value): [string, string] => [
              value == null ? "No records" : `${Number(value).toFixed(1)}%`,
              "Attendance rate",
            ]}
            contentStyle={{ borderRadius: 10, borderColor: "#e2e8f0", fontSize: 12 }}
          />
          <Line
            dataKey="rate"
            name="Attendance rate"
            type="monotone"
            stroke="#2563eb"
            strokeWidth={2.5}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  </section>;
}
