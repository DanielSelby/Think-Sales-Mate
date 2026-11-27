"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Legend,
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

export type StudentEnrollmentPoint = {
  date: string;
  label: string;
  count: number;
};

export type AdmissionPipelinePoint = {
  stage: string;
  count: number;
};

export type FeeCollectionCampusPoint = {
  campus: string;
  due: number;
  collected: number;
};

export type FeeAgingPoint = {
  bucket: string;
  amount: number;
};

export type ClassCapacityPoint = {
  name: string;
  campus: string;
  enrolled: number;
  capacity: number;
  utilization: number;
};

export type AttendanceRatePoint = {
  date: string;
  label: string;
  rate: number | null;
};

export type StudentEnrollmentOutcomePoint = {
  outcome: string;
  count: number;
};

export type ExpenseCategoryPoint = {
  category: string;
  amount: number;
};

export type StaffAttendanceRatePoint = {
  date: string;
  label: string;
  rate: number | null;
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

export function StudentEnrollmentBarChart({ data }: { data: StudentEnrollmentPoint[] }) {
  if (!data.some((point) => point.count > 0)) {
    return <div className="mt-4 flex h-56 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-500">
      No student enrollments started in this date range.
    </div>;
  }

  return <div className="mt-4 h-56 w-full">
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
        <YAxis allowDecimals={false} width={42} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
        <Tooltip
          labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ""}
          formatter={(value): [string, string | number] => [Number(value).toLocaleString(), "Enrollments"]}
          contentStyle={{ borderRadius: 10, borderColor: "#e2e8f0", fontSize: 12 }}
        />
        <Bar dataKey="count" name="Enrollments" fill="#3b82f6" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  </div>;
}

export function AdmissionPipelineBarChart({ data }: { data: AdmissionPipelinePoint[] }) {
  if (!data.some((point) => point.count > 0)) {
    return <div className="mt-4 flex h-56 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-500">
      No admission applications were created in this date range.
    </div>;
  }

  return <div className="mt-4 h-56 w-full">
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="stage" width={94} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
        <Tooltip formatter={(value) => [Number(value).toLocaleString(), "Applications"]} contentStyle={{ borderRadius: 10, borderColor: "#e2e8f0", fontSize: 12 }} />
        <Bar dataKey="count" name="Applications" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  </div>;
}

export function FeeCollectionsByCampusChart({ data }: { data: FeeCollectionCampusPoint[] }) {
  if (!data.some((point) => point.due > 0 || point.collected > 0)) {
    return <div className="mt-4 flex h-56 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-500">
      No fee charges or collections were recorded in this date range.
    </div>;
  }

  return <div className="mt-4 h-56 w-full">
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
        <XAxis dataKey="campus" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
        <YAxis width={72} tickFormatter={(value) => Number(value).toLocaleString()} tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} />
        <Tooltip formatter={(value, name) => [Number(value).toLocaleString(), name]} contentStyle={{ borderRadius: 10, borderColor: "#e2e8f0", fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="due" name="Fees due" fill="#3b82f6" radius={[3, 3, 0, 0]} />
        <Bar dataKey="collected" name="Collections" fill="#16a34a" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  </div>;
}

export function FeeAgingBarChart({ data }: { data: FeeAgingPoint[] }) {
  if (!data.some((point) => point.amount > 0)) {
    return <div className="mt-4 flex h-56 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-500">
      No outstanding fee balances were found in this campus scope.
    </div>;
  }

  return <div className="mt-4 h-56 w-full">
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
        <XAxis type="number" tickFormatter={(value) => Number(value).toLocaleString()} tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="bucket" width={100} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
        <Tooltip formatter={(value) => [Number(value).toLocaleString(), "Outstanding"]} contentStyle={{ borderRadius: 10, borderColor: "#e2e8f0", fontSize: 12 }} />
        <Bar dataKey="amount" name="Outstanding" fill="#f59e0b" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  </div>;
}

export function ClassCapacityBarChart({ data }: { data: ClassCapacityPoint[] }) {
    const chartData = data.slice(0, 12);
    if (!chartData.length) {
      return <div className="mt-4 flex h-56 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-500">
        No active classes with configured capacity were found in this campus scope.
      </div>;
    }

    return <div className="mt-4 h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="name" width={104} tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} />
          <Tooltip
            labelFormatter={(_, payload) => {
              const point = payload?.[0]?.payload as ClassCapacityPoint | undefined;
              return point
                ? `${point.name} · ${point.campus} (${point.utilization.toFixed(1)}%)`
                : "";
            }}
            formatter={(value, name) => [Number(value).toLocaleString(), name]}
            contentStyle={{ borderRadius: 10, borderColor: "#e2e8f0", fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="capacity" name="Capacity" fill="#cbd5e1" radius={[0, 4, 4, 0]} />
          <Bar dataKey="enrolled" name="Enrolled" radius={[0, 4, 4, 0]}>
            {chartData.map((point) => <Cell
              key={`${point.campus}:${point.name}`}
              fill={point.utilization >= 100 ? "#e11d48" : point.utilization >= 90 ? "#f59e0b" : "#3b82f6"}
            />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>;
  }

export function AttendanceRateLineChart({ data }: { data: AttendanceRatePoint[] }) {
    if (!data.some((point) => point.rate !== null)) {
      return <div className="mt-4 flex h-56 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-500">
        No student attendance records were recorded in this date range.
      </div>;
    }

    return <div className="mt-4 h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
          <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} width={48} tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} />
          <Tooltip
            labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ""}
            formatter={(value) => [`${Number(value).toFixed(1)}%`, "Present rate"]}
            contentStyle={{ borderRadius: 10, borderColor: "#e2e8f0", fontSize: 12 }}
          />
          <Line dataKey="rate" name="Present rate" type="monotone" stroke="#16a34a" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>;
  }

export function StudentEnrollmentOutcomeBarChart({ data }: { data: StudentEnrollmentOutcomePoint[] }) {
    if (!data.some((point) => point.count > 0)) {
      return <div className="mt-4 flex h-56 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-500">
        No student enrollments were started in this date range.
      </div>;
    }

    const outcomeColor: Record<string, string> = {
      Active: "#3b82f6",
      Completed: "#16a34a",
      Transferred: "#f59e0b",
      Withdrawn: "#e11d48",
    };
    return <div className="mt-4 h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="outcome" width={94} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
          <Tooltip formatter={(value) => [Number(value).toLocaleString(), "Enrollments"]} contentStyle={{ borderRadius: 10, borderColor: "#e2e8f0", fontSize: 12 }} />
          <Bar dataKey="count" name="Enrollments" radius={[0, 4, 4, 0]}>
            {data.map((point) => <Cell key={point.outcome} fill={outcomeColor[point.outcome] ?? "#64748b"} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>;
  }

export function ExpenseCategoryBarChart({ data }: { data: ExpenseCategoryPoint[] }) {
    if (!data.some((point) => point.amount > 0)) {
      return <div className="mt-4 flex h-56 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-500">
        No approved expenses were recorded in this date range.
      </div>;
    }

    return <div className="mt-4 h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
          <XAxis type="number" tickFormatter={(value) => Number(value).toLocaleString()} tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="category" width={112} tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} />
          <Tooltip formatter={(value) => [Number(value).toLocaleString(), "Approved expenses"]} contentStyle={{ borderRadius: 10, borderColor: "#e2e8f0", fontSize: 12 }} />
          <Bar dataKey="amount" name="Approved expenses" fill="#e11d48" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>;
  }

export function StaffAttendanceRateLineChart({ data }: { data: StaffAttendanceRatePoint[] }) {
    if (!data.some((point) => point.rate !== null)) {
      return <div className="mt-4 flex h-56 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-500">
        No staff attendance records were recorded in this date range.
      </div>;
    }

    return <div className="mt-4 h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
          <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} width={48} tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} />
          <Tooltip
            labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ""}
            formatter={(value) => [`${Number(value).toFixed(1)}%`, "Attendance rate"]}
            contentStyle={{ borderRadius: 10, borderColor: "#e2e8f0", fontSize: 12 }}
          />
          <Line dataKey="rate" name="Attendance rate" type="monotone" stroke="#8b5cf6" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>;
  }

