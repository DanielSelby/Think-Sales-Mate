import Link from "next/link";
import { Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import {
  AttendanceStatusLineChart,
  StudentGenderDonutChart,
  type AttendanceStatusPoint,
  type StudentGenderSlice,
} from "./dashboard-charts";

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

export async function AttendanceStatusCard({
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
  const header = <div>
    <h2 className="text-lg font-bold text-slate-950">Attendance by status</h2>
    <p className="mt-1 text-sm text-slate-500">Daily present, late, and absent counts across your selected campuses for the last seven days.</p>
  </div>;
  if (!canReadAttendance) {
    return <section data-education-dashboard-card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {header}<p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Your role does not include attendance reporting access.</p>
    </section>;
  }
  if (branchIds.length === 0) {
    return <section data-education-dashboard-card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {header}<p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Assign campus access to see attendance trends.</p>
    </section>;
  }

  const firstDay = new Date(`${today}T00:00:00.000Z`);
  firstDay.setUTCDate(firstDay.getUTCDate() - 6);
  const from = firstDay.toISOString().slice(0, 10);
  const supabase = await createClient();
  const countsByDate = new Map<string, { present: number; late: number; absent: number }>();
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from("education_attendance")
      .select("id, attendance_date, status")
      .eq("org_id", orgId).in("branch_id", branchIds)
      .gte("attendance_date", from).lte("attendance_date", today)
      .in("status", ["present", "late", "absent"])
      .order("attendance_date").order("id")
      .range(offset, offset + pageSize - 1);
    if (error) {
      console.error("Could not load Think Education dashboard attendance statuses:", error);
      return <section data-education-dashboard-card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        {header}<SectionError section="attendance status trends" />
      </section>;
    }
    const page = data ?? [];
    if (offset >= 100_000 && page.length > 0) {
      console.error("Think Education attendance chart exceeded its 100,000-record processing limit.");
      return <section data-education-dashboard-card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        {header}<p className="mt-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">Attendance volume exceeds the chart limit. Narrow your campus access to view this trend.</p>
      </section>;
    }
    for (const record of page) {
      const current = countsByDate.get(record.attendance_date) ?? { present: 0, late: 0, absent: 0 };
      if (record.status === "present") current.present += 1;
      if (record.status === "late") current.late += 1;
      if (record.status === "absent") current.absent += 1;
      countsByDate.set(record.attendance_date, current);
    }
    if (page.length < pageSize) break;
  }

  const trend: AttendanceStatusPoint[] = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${from}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + index);
    const dateKey = date.toISOString().slice(0, 10);
    const counts = countsByDate.get(dateKey) ?? { present: 0, late: 0, absent: 0 };
    return {
      date: dateKey,
      label: new Date(`${dateKey}T12:00:00.000Z`).toLocaleDateString(undefined, { weekday: "short" }),
      ...counts,
    };
  });

  return <section data-education-dashboard-card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      {header}
      <Link href={getProductAppPath("think-education", "/attendance")} className="text-sm font-semibold text-blue-700">Open attendance</Link>
    </div>
    <AttendanceStatusLineChart data={trend} />
  </section>;
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

export async function StudentGenderCard({
  orgId,
  branchIds,
  canReadStudents,
}: {
  orgId: string;
  branchIds: string[];
  canReadStudents: boolean;
}) {
  const header = <div className="flex items-start justify-between gap-3">
    <div>
      <h2 className="text-lg font-bold text-slate-950">Students by gender</h2>
      <p className="mt-1 text-sm text-slate-500">Active students in the selected campus scope.</p>
    </div>
    <Link href={getProductAppPath("think-education", "/students")} className="shrink-0 text-sm font-semibold text-blue-700">View students</Link>
  </div>;

  if (!canReadStudents) {
    return <article data-education-dashboard-card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {header}<p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Your role does not include student reporting access.</p>
    </article>;
  }
  if (branchIds.length === 0) {
    return <article data-education-dashboard-card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {header}<p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Assign campus access to see student gender distribution.</p>
    </article>;
  }

  const supabase = await createClient();
  const genderCounts = new Map<string, number>();
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from("education_students")
      .select("id, gender")
      .eq("org_id", orgId).in("branch_id", branchIds).eq("status", "active")
      .order("id").range(offset, offset + pageSize - 1);
    if (error) {
      console.error("Could not load Think Education student gender counts:", error);
      return <article data-education-dashboard-card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        {header}<SectionError section="student gender distribution" />
      </article>;
    }
    const page = data ?? [];
    if (offset >= 100_000 && page.length > 0) {
      console.error("Think Education student gender chart exceeded its 100,000-record processing limit.");
      return <article data-education-dashboard-card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        {header}<p className="mt-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">Student volume exceeds the chart limit. Narrow your campus access to view this distribution.</p>
      </article>;
    }
    for (const student of page) {
      const normalized = (student.gender ?? "").trim().toLowerCase();
      const group = normalized === "male" || normalized === "m" || normalized === "man"
        ? "Male"
        : normalized === "female" || normalized === "f" || normalized === "woman"
          ? "Female"
          : normalized ? "Other / self-described" : "Not recorded";
      genderCounts.set(group, (genderCounts.get(group) ?? 0) + 1);
    }
    if (page.length < pageSize) break;
  }

  const preferredOrder = ["Male", "Female", "Other / self-described", "Not recorded"];
  const genderData: StudentGenderSlice[] = preferredOrder.flatMap((name) => {
    const value = genderCounts.get(name) ?? 0;
    return value > 0 ? [{ name, value }] : [];
  });

  return <article data-education-dashboard-card data-education-student-gender className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    {header}
    <StudentGenderDonutChart data={genderData} />
  </article>;
}
