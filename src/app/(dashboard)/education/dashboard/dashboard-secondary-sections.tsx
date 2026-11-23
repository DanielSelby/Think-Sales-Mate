import Link from "next/link";
import { Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";

type Campus = {
  id: string;
  name: string;
  code: string | null;
  city: string | null;
  region: string | null;
};

function SectionError({ section }: { section: string }) {
  return <p className="mt-4 rounded-lg bg-rose-50 p-4 text-sm text-rose-700">
    Could not load {section}. Refresh the dashboard to try again.
  </p>;
}

export async function AttendanceTrendSection({
  orgId,
  branchIds,
  today,
  canReadAttendance,
}: {
  orgId: string;
  branchIds: string[];
  today: string;
  canReadAttendance: boolean;
}) {
  if (!canReadAttendance) {
    return <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Your role does not include attendance reporting access.</p>;
  }
  if (branchIds.length === 0) {
    return <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Assign campus access to see attendance trends.</p>;
  }

  const firstDay = new Date(`${today}T00:00:00.000Z`);
  firstDay.setUTCDate(firstDay.getUTCDate() - 6);
  const from = firstDay.toISOString().slice(0, 10);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("education_get_dashboard_attendance_trend", {
    p_org_id: orgId,
    p_branch_ids: branchIds,
    p_from: from,
    p_to: today,
  });
  if (error) {
    console.error("Could not load Think Education dashboard attendance trend:", error);
    return <SectionError section="the attendance trend" />;
  }

  const rows = data ?? [];
  const rowsByDate = new Map(rows.map((row) => [row.attendance_date, row]));
  const trend = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${from}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + index);
    const dateKey = date.toISOString().slice(0, 10);
    const row = rowsByDate.get(dateKey);
    const total = Number(row?.total_count ?? 0);
    const present = Number(row?.present_count ?? 0);
    return { date: dateKey, total, present, rate: total ? Math.round((present / total) * 100) : null };
  });

  return trend.every((day) => day.total === 0)
    ? <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No attendance has been recorded in the last seven days.</p>
    : <div className="mt-5 grid grid-cols-7 gap-2 sm:gap-4">
      {trend.map((day) => <div key={day.date} className="flex min-w-0 flex-col items-center gap-2">
        <span className="text-xs font-semibold tabular-nums text-slate-700">{day.rate === null ? "—" : `${day.rate}%`}</span>
        <div className="flex h-32 w-full items-end justify-center rounded-lg bg-slate-50 p-2" role="img" aria-label={`${day.date}: ${day.present} present out of ${day.total} marked`}>
          <span className="w-full rounded-t-md bg-blue-600" style={{ height: `${day.rate ?? 0}%`, minHeight: day.rate === null ? 0 : "0.375rem" }} />
        </div>
        <span className="text-center text-[11px] text-slate-500">{new Date(`${day.date}T12:00:00.000Z`).toLocaleDateString(undefined, { weekday: "short" })}</span>
      </div>)}
    </div>;
}

export async function StudentDistributionSection({
  orgId,
  campuses,
  branchIds,
  studentCount,
  canReadStudents,
}: {
  orgId: string;
  campuses: Campus[];
  branchIds: string[];
  studentCount: number;
  canReadStudents: boolean;
}) {
  if (!canReadStudents) {
    return <p className="mt-5 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Your role does not include student reporting access.</p>;
  }
  if (campuses.length === 0) {
    return <p className="mt-5 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Assign campus access to see student distribution.</p>;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("education_get_dashboard_student_distribution", {
    p_org_id: orgId,
    p_branch_ids: branchIds,
  });
  if (error) {
    console.error("Could not load Think Education dashboard student distribution:", error);
    return <SectionError section="student distribution" />;
  }

  const rows = data ?? [];
  const counts = new Map(rows.map((row) => [row.branch_id, Number(row.student_count)]));
  return <ul className="mt-4 divide-y divide-slate-100">
    {campuses.map((campus) => {
      const count = counts.get(campus.id) ?? 0;
      return <li key={campus.id} className="flex items-center justify-between gap-3 py-3">
        <span className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700"><Building2 className="h-4 w-4" /></span>
          <span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-900">{campus.name}</span>
            <span className="text-xs text-slate-500">{[campus.code, campus.city, campus.region].filter(Boolean).join(" · ") || "Campus"}</span>
            <span className="mt-2 block h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <span className="block h-full rounded-full bg-blue-600" style={{ width: `${studentCount ? Math.round((count / studentCount) * 100) : 0}%` }} />
            </span>
          </span>
        </span>
        <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
          {count.toLocaleString()} students
        </span>
      </li>;
    })}
  </ul>;
}

export function AttendanceTrendCard({
  orgId,
  branchIds,
  today,
  canReadAttendance,
}: {
  orgId: string;
  branchIds: string[];
  today: string;
  canReadAttendance: boolean;
}) {
  return <section data-education-dashboard-card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold text-slate-950">Attendance trend</h2>
        <p className="mt-1 text-sm text-slate-500">Daily present rate across your selected campuses for the last seven days.</p>
      </div>
      <Link href={getProductAppPath("think-education", "/attendance")} className="text-sm font-semibold text-blue-700">Open attendance</Link>
    </div>
    <AttendanceTrendSection
      orgId={orgId}
      branchIds={branchIds}
      today={today}
      canReadAttendance={canReadAttendance}
    />
  </section>;
}

export function StudentDistributionCard({
  orgId,
  campuses,
  branchIds,
  studentCount,
  canReadStudents,
}: {
  orgId: string;
  campuses: Campus[];
  branchIds: string[];
  studentCount: number;
  canReadStudents: boolean;
}) {
  return <article data-education-dashboard-card data-education-student-distribution className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold text-slate-950">Student distribution by campus</h2>
        <p className="mt-1 text-sm text-slate-500">Active students in the selected campus scope.</p>
      </div>
      <Link href={getProductAppPath("think-education", "/students")} className="shrink-0 text-sm font-semibold text-blue-700">View students</Link>
    </div>
    <StudentDistributionSection
      orgId={orgId}
      campuses={campuses}
      branchIds={branchIds}
      studentCount={studentCount}
      canReadStudents={canReadStudents}
    />
  </article>;
}
