"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type StudentGenderSlice = {
  name: string;
  value: number;
};

export type AttendanceStatusPoint = {
  date: string;
  label: string;
  present: number;
  late: number;
  absent: number;
};

const GENDER_COLORS = ["#3b82f6", "#ec4899", "#8b5cf6", "#94a3b8"];

export function StudentGenderDonutChart({ data }: { data: StudentGenderSlice[] }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const activeIndex = selected ?? hovered;
  const total = data.reduce((sum, item) => sum + item.value, 0);

  if (!total) {
    return <div className="mt-4 flex h-56 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-500">
      No active students with gender data in this campus scope.
    </div>;
  }

  return <div className="mt-4 grid items-center gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(130px,0.8fr)]">
    <div className="relative mx-auto h-56 w-full max-w-[250px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius="58%"
            outerRadius="88%"
            paddingAngle={2}
            stroke="none"
            onMouseEnter={(_, index) => setHovered(index)}
            onMouseLeave={() => setHovered(null)}
            onClick={(_, index) => setSelected((current) => current === index ? null : index)}
          >
            {data.map((item, index) => {
              const isActive = activeIndex === index;
              return <Cell
                key={item.name}
                fill={GENDER_COLORS[index % GENDER_COLORS.length]}
                opacity={activeIndex !== null && !isActive ? 0.35 : 1}
                style={{
                  cursor: "pointer",
                  transform: isActive ? "scale(1.05)" : "scale(1)",
                  transformOrigin: "center",
                  transition: "all 250ms ease-out",
                  filter: isActive ? "drop-shadow(0 4px 8px rgba(0,0,0,0.16))" : "none",
                }}
              />;
            })}
          </Pie>
          <Tooltip formatter={(value, name) => [Number(value).toLocaleString(), name]} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {activeIndex === null ? "Active students" : data[activeIndex]?.name}
        </span>
        <span className="mt-1 text-xl font-bold tabular-nums text-slate-900">
          {(activeIndex === null ? total : data[activeIndex]?.value ?? 0).toLocaleString()}
        </span>
        <span className="mt-0.5 text-xs text-slate-500">
          {activeIndex === null
            ? `${data.length} groups`
            : `${((data[activeIndex]?.value ?? 0) / total * 100).toFixed(1)}% of total`}
        </span>
      </div>
    </div>
    <div className="space-y-1.5">
      {data.map((item, index) => {
        const isActive = activeIndex === index;
        const percentage = total ? (item.value / total) * 100 : 0;
        return <button
          key={item.name}
          type="button"
          aria-pressed={selected === index}
          onMouseEnter={() => setHovered(index)}
          onMouseLeave={() => setHovered(null)}
          onFocus={() => setHovered(index)}
          onBlur={() => setHovered(null)}
          onClick={() => setSelected((current) => current === index ? null : index)}
          className="w-full rounded-lg px-2 py-2 text-left transition hover:bg-slate-50"
          style={{ opacity: activeIndex !== null && !isActive ? 0.5 : 1 }}
        >
          <span className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: GENDER_COLORS[index % GENDER_COLORS.length] }} />
              <span className="truncate text-xs font-medium text-slate-700">{item.name}</span>
            </span>
            <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-700">{item.value.toLocaleString()}</span>
          </span>
          <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-slate-100">
            <span className="block h-full rounded-full transition-all" style={{
              width: `${percentage}%`,
              backgroundColor: GENDER_COLORS[index % GENDER_COLORS.length],
            }} />
          </span>
        </button>;
      })}
    </div>
  </div>;
}

export function AttendanceStatusLineChart({ data }: { data: AttendanceStatusPoint[] }) {
  const hasAttendance = data.some((day) => day.present + day.late + day.absent > 0);

  if (!hasAttendance) {
    return <div className="mt-4 flex h-56 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-500">
      No present, late, or absent attendance has been recorded in the last seven days.
    </div>;
  }

  return <div className="mt-4 h-56 w-full">
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
        <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
        <YAxis allowDecimals={false} width={42} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
        <Tooltip
          labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ""}
          formatter={(value, name) => [Number(value).toLocaleString(), name]}
          contentStyle={{ borderRadius: 10, borderColor: "#e2e8f0", fontSize: 12 }}
        />
        <Line dataKey="present" name="Present" type="monotone" stroke="#16a34a" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
        <Line dataKey="late" name="Late" type="monotone" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
        <Line dataKey="absent" name="Absent" type="monotone" stroke="#ef4444" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  </div>;
}
