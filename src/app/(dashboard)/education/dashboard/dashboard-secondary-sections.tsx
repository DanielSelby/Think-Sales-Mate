import Link from "next/link";
import { Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import {
  AdmissionPipelineBarChart,
  AttendanceRateLineChart,
  AttendanceStatusLineChart,
  ExpenseCategoryBarChart,
  FeeAgingBarChart,
  StaffAttendanceRateLineChart,
  StudentEnrollmentOutcomeBarChart,
  type AdmissionPipelinePoint,
  type AttendanceRatePoint,
  type ExpenseCategoryPoint,
  type FeeAgingPoint,
  type StaffAttendanceRatePoint,
  type StudentEnrollmentOutcomePoint,
  type StudentEnrollmentPoint,
  StudentEnrollmentBarChart,
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

function getDateBucket(date: string, spanDays: number) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (spanDays <= 45) {
    return { date, label: parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" }) };
  }
  if (spanDays <= 180) {
    const weekday = parsed.getUTCDay() || 7;
    parsed.setUTCDate(parsed.getUTCDate() - weekday + 1);
    const bucket = parsed.toISOString().slice(0, 10);
    return { date: bucket, label: parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" }) };
  }
  parsed.setUTCDate(1);
  const bucket = parsed.toISOString().slice(0, 10);
  return { date: bucket, label: parsed.toLocaleDateString(undefined, { month: "short", year: "2-digit", timeZone: "UTC" }) };
}

function getAttendanceTrendBucket(date: string, spanDays: number) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (spanDays > 180) {
    parsed.setUTCDate(1);
    const bucket = parsed.toISOString().slice(0, 10);
    return { date: bucket, label: parsed.toLocaleDateString(undefined, { month: "short", year: "2-digit", timeZone: "UTC" }) };
  }
  const weekday = parsed.getUTCDay() || 7;
  parsed.setUTCDate(parsed.getUTCDate() - weekday + 1);
  const bucket = parsed.toISOString().slice(0, 10);
  return { date: bucket, label: parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" }) };
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
    <p className="mt-1 text-sm text-slate-500">Daily present, late, and absent counts for this week, Monday through Sunday.</p>
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
  const weekday = firstDay.getUTCDay() || 7;
  firstDay.setUTCDate(firstDay.getUTCDate() - weekday + 1);
  const from = firstDay.toISOString().slice(0, 10);
  const supabase = await createClient();
  const countsByDate = new Map<string, { present: number; late: number; absent: number }>();
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from("education_attendance")
      .select("id, attendance_date, status")
      .eq("org_id", orgId).in("branch_id", branchIds)
      .gte("attendance_date", from).lte("attendance_date", today)
      .not("student_id", "is", null)
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

  const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const trend: AttendanceStatusPoint[] = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${from}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + index);
    const dateKey = date.toISOString().slice(0, 10);
    const counts = countsByDate.get(dateKey) ?? { present: 0, late: 0, absent: 0 };
    return {
      date: dateKey,
      label: weekdayLabels[index],
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

export async function AttendanceRateCard({
  orgId,
  branchIds,
  from,
  to,
  canReadAttendance,
}: {
  orgId: string;
  branchIds: string[];
  from: string;
  to: string;
  canReadAttendance: boolean;
}) {
  const header = <div>
    <h2 className="text-lg font-bold text-slate-950">Attendance rate over time</h2>
    <p className="mt-1 text-sm text-slate-500">Weekly for ranges up to six months, monthly for longer ranges. Present marks as a share of recorded non-excused marks.</p>
  </div>;
  if (!canReadAttendance) {
    return <article data-education-dashboard-card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {header}<p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Your role does not include attendance reporting access.</p>
    </article>;
  }
  if (!branchIds.length) {
    return <article data-education-dashboard-card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {header}<p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Assign campus access to see attendance rates.</p>
    </article>;
  }

  const spanDays = Math.floor((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000) + 1;
  const countsByBucket = new Map<string, { present: number; late: number; absent: number; excused: number }>();
  const supabase = await createClient();
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from("education_attendance")
      .select("id, attendance_date, status")
      .eq("org_id", orgId).in("branch_id", branchIds)
      .gte("attendance_date", from).lte("attendance_date", to)
      .not("student_id", "is", null)
      .order("attendance_date").order("id")
      .range(offset, offset + pageSize - 1);
    if (error) {
      console.error("Could not load Think Education attendance rates:", error);
      return <article data-education-dashboard-card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        {header}<SectionError section="attendance rate trends" />
      </article>;
    }
    const page = data ?? [];
    if (offset >= 100_000 && page.length > 0) {
      console.error("Think Education attendance rate chart exceeded its 100,000-record processing limit.");
      return <article data-education-dashboard-card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        {header}<p className="mt-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">Attendance volume exceeds the chart limit. Narrow the date range to view this trend.</p>
      </article>;
    }
    for (const record of page) {
      const bucket = getAttendanceTrendBucket(record.attendance_date, spanDays);
      const counts = countsByBucket.get(bucket.date) ?? { present: 0, late: 0, absent: 0, excused: 0 };
      if (record.status === "present") counts.present += 1;
      if (record.status === "late") counts.late += 1;
      if (record.status === "absent") counts.absent += 1;
      if (record.status === "excused") counts.excused += 1;
      countsByBucket.set(bucket.date, counts);
    }
    if (page.length < pageSize) break;
  }

  const trend: AttendanceRatePoint[] = Array.from(countsByBucket, ([date, counts]) => {
    const eligible = counts.present + counts.late + counts.absent;
    return {
      date,
      label: getAttendanceTrendBucket(date, spanDays).label,
      rate: eligible ? Math.round((counts.present / eligible) * 1000) / 10 : null,
    };
  }).sort((a, b) => a.date.localeCompare(b.date));
  return <article data-education-dashboard-card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    {header}
    <AttendanceRateLineChart data={trend} />
  </article>;
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
  const unrecordedGenderCount = genderCounts.get("Not recorded") ?? 0;

  return <article data-education-dashboard-card data-education-student-gender className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    {header}
    <StudentGenderDonutChart data={genderData} />
    {unrecordedGenderCount > 0 && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
      Gender is not recorded for {unrecordedGenderCount.toLocaleString()} active student{unrecordedGenderCount === 1 ? "" : "s"}. Update their profiles or include gender when importing students.
    </p>}
  </article>;
}

  export async function StudentEnrollmentTrendCard({
    orgId,
    branchIds,
    from,
    to,
    canReadStudents,
  }: {
    orgId: string;
    branchIds: string[];
    from: string;
    to: string;
    canReadStudents: boolean;
  }) {
    const header = <div>
      <h2 className="text-lg font-bold text-slate-950">Enrollment trend</h2>
      <p className="mt-1 text-sm text-slate-500">Student enrollment records by enrollment date in the selected period.</p>
    </div>;
    if (!canReadStudents) {
      return <article data-education-dashboard-card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        {header}<p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Your role does not include student reporting access.</p>
      </article>;
    }
    if (!branchIds.length) {
      return <article data-education-dashboard-card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        {header}<p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Assign campus access to see enrollment trends.</p>
      </article>;
    }

    const supabase = await createClient();
    const countsByBucket = new Map<string, number>();
    const spanDays = Math.floor((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000) + 1;
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase.from("education_student_enrollments")
        .select("id, enrolled_on")
        .eq("org_id", orgId).in("branch_id", branchIds)
        .gte("enrolled_on", from).lte("enrolled_on", to)
        .order("enrolled_on").order("id")
        .range(offset, offset + pageSize - 1);
      if (error) {
        console.error("Could not load Think Education enrollment trends:", error);
        return <article data-education-dashboard-card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          {header}<SectionError section="student enrollment trends" />
        </article>;
      }
      const page = data ?? [];
      if (offset >= 100_000 && page.length > 0) {
        console.error("Think Education enrollment chart exceeded its 100,000-record processing limit.");
        return <article data-education-dashboard-card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          {header}<p className="mt-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">Enrollment volume exceeds the chart limit. Narrow the date range to view this trend.</p>
        </article>;
      }
      for (const enrollment of page) {
        const bucket = getDateBucket(enrollment.enrolled_on, spanDays);
        countsByBucket.set(bucket.date, (countsByBucket.get(bucket.date) ?? 0) + 1);
      }
      if (page.length < pageSize) break;
    }

    const trend: StudentEnrollmentPoint[] = Array.from(countsByBucket, ([date, count]) => ({
      date,
      count,
      label: getDateBucket(date, spanDays).label,
    })).sort((a, b) => a.date.localeCompare(b.date));
    return <article data-education-dashboard-card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {header}
      <StudentEnrollmentBarChart data={trend} />
    </article>;
  }

  export async function StudentEnrollmentOutcomeCard({
    orgId,
    branchIds,
    from,
    to,
    canReadStudents,
  }: {
    orgId: string;
    branchIds: string[];
    from: string;
    to: string;
    canReadStudents: boolean;
  }) {
    const header = <div>
      <h2 className="text-lg font-bold text-slate-950">Student retention &amp; progression</h2>
      <p className="mt-1 text-sm text-slate-500">Enrollments started in the selected period, grouped by their current record status. This is not a cohort retention rate.</p>
    </div>;
    if (!canReadStudents) {
      return <article data-education-dashboard-card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        {header}<p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Your role does not include student reporting access.</p>
      </article>;
    }
    if (!branchIds.length) {
      return <article data-education-dashboard-card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        {header}<p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Assign campus access to see enrollment outcomes.</p>
      </article>;
    }

    const outcomes = ["active", "completed", "transferred", "withdrawn"] as const;
    const counts = new Map<string, number>(outcomes.map((outcome) => [outcome, 0]));
    const supabase = await createClient();
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase.from("education_student_enrollments")
        .select("id, status")
        .eq("org_id", orgId).in("branch_id", branchIds)
        .gte("enrolled_on", from).lte("enrolled_on", to)
        .order("id").range(offset, offset + pageSize - 1);
      if (error) {
        console.error("Could not load Think Education enrollment outcomes:", error);
        return <article data-education-dashboard-card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          {header}<SectionError section="student enrollment outcomes" />
        </article>;
      }
      const page = data ?? [];
      if (offset >= 100_000 && page.length > 0) {
        console.error("Think Education enrollment outcome chart exceeded its 100,000-record processing limit.");
        return <article data-education-dashboard-card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          {header}<p className="mt-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">Enrollment volume exceeds the chart limit. Narrow the date range to view these outcomes.</p>
        </article>;
      }
      for (const enrollment of page) {
        if (counts.has(enrollment.status)) counts.set(enrollment.status, (counts.get(enrollment.status) ?? 0) + 1);
      }
      if (page.length < pageSize) break;
    }

    const chartData: StudentEnrollmentOutcomePoint[] = outcomes.map((outcome) => ({
      outcome: outcome[0].toUpperCase() + outcome.slice(1),
      count: counts.get(outcome) ?? 0,
    }));
    return <article data-education-dashboard-card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {header}
      <StudentEnrollmentOutcomeBarChart data={chartData} />
    </article>;
  }

  export async function AdmissionsPipelineCard({
    orgId,
    branchIds,
    from,
    to,
    canReadAdmissions,
  }: {
    orgId: string;
    branchIds: string[];
    from: string;
    to: string;
    canReadAdmissions: boolean;
  }) {
    const header = <div>
      <h2 className="text-lg font-bold text-slate-950">Admissions pipeline</h2>
      <p className="mt-1 text-sm text-slate-500">Applications grouped by current status, based on their application date.</p>
    </div>;
    if (!canReadAdmissions) {
      return <article data-education-dashboard-card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        {header}<p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Your role does not include admissions reporting access.</p>
      </article>;
    }
    if (!branchIds.length) {
      return <article data-education-dashboard-card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        {header}<p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Assign campus access to see the admissions pipeline.</p>
      </article>;
    }

    const stages = ["pending", "under_review", "admitted", "enrolled", "rejected", "withdrawn"] as const;
    const counts = new Map<string, number>(stages.map((stage) => [stage, 0]));
    const fromTimestamp = `${from}T00:00:00.000Z`;
    const toExclusive = new Date(Date.parse(`${to}T00:00:00.000Z`) + 86_400_000).toISOString();
    const supabase = await createClient();
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase.from("education_admissions")
        .select("id, status")
        .eq("org_id", orgId).in("branch_id", branchIds)
        .gte("applied_at", fromTimestamp).lt("applied_at", toExclusive)
        .order("id").range(offset, offset + pageSize - 1);
      if (error) {
        console.error("Could not load Think Education admission pipeline:", error);
        return <article data-education-dashboard-card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          {header}<SectionError section="admissions pipeline" />
        </article>;
      }
      const page = data ?? [];
      if (offset >= 100_000 && page.length > 0) {
        console.error("Think Education admissions chart exceeded its 100,000-record processing limit.");
        return <article data-education-dashboard-card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          {header}<p className="mt-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">Application volume exceeds the chart limit. Narrow the date range to view this pipeline.</p>
        </article>;
      }
      for (const application of page) {
        if (counts.has(application.status)) counts.set(application.status, (counts.get(application.status) ?? 0) + 1);
      }
      if (page.length < pageSize) break;
    }

    const chartData: AdmissionPipelinePoint[] = stages.map((stage) => ({
      stage: stage.replace("_", " "),
      count: counts.get(stage) ?? 0,
    }));
    return <article data-education-dashboard-card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {header}
      <AdmissionPipelineBarChart data={chartData} />
    </article>;
  }

  export async function ExpenseCategoryCard({
    orgId,
    branchIds,
    from,
    to,
    canViewExpenses,
  }: {
    orgId: string;
    branchIds: string[];
    from: string;
    to: string;
    canViewExpenses: boolean;
  }) {
    const header = <div>
      <h2 className="text-lg font-bold text-slate-950">Approved expenses by category</h2>
      <p className="mt-1 text-sm text-slate-500">Approved expenses dated in the selected period; amounts are in your organization currency.</p>
    </div>;
    if (!canViewExpenses) {
      return <article data-education-dashboard-card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        {header}<p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Your role does not include expense reporting access.</p>
      </article>;
    }
    if (!branchIds.length) {
      return <article data-education-dashboard-card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        {header}<p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Assign campus access to see expense categories.</p>
      </article>;
    }

    const amountByCategory = new Map<string, { label: string; amount: number }>();
    const supabase = await createClient();
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase.from("education_expenses")
        .select("id, category, amount")
        .eq("org_id", orgId).in("branch_id", branchIds).eq("status", "approved")
        .gte("expense_date", from).lte("expense_date", to)
        .order("id").range(offset, offset + pageSize - 1);
      if (error) {
        console.error("Could not load Think Education expenses by category:", error);
        return <article data-education-dashboard-card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          {header}<SectionError section="expense categories" />
        </article>;
      }
      const page = data ?? [];
      if (offset >= 100_000 && page.length > 0) {
        console.error("Think Education expense chart exceeded its 100,000-record processing limit.");
        return <article data-education-dashboard-card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          {header}<p className="mt-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">Expense volume exceeds the chart limit. Narrow the date range to view these categories.</p>
        </article>;
      }
      for (const expense of page) {
        const label = expense.category.trim() || "Uncategorized";
        const key = label.toLocaleLowerCase();
        const current = amountByCategory.get(key) ?? { label, amount: 0 };
        current.amount += Number(expense.amount);
        amountByCategory.set(key, current);
      }
      if (page.length < pageSize) break;
    }

    const categories = Array.from(amountByCategory.values()).sort((a, b) => b.amount - a.amount);
    const topCategories = categories.slice(0, 8).map(({ label, amount }) => ({ category: label, amount }));
    const otherAmount = categories.slice(8).reduce((total, category) => total + category.amount, 0);
    const chartData: ExpenseCategoryPoint[] = otherAmount > 0
      ? [...topCategories, { category: "Other categories", amount: otherAmount }]
      : topCategories;
    return <article data-education-dashboard-card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {header}
      <ExpenseCategoryBarChart data={chartData} />
    </article>;
  }

  export async function StaffAttendanceTrendCard({
    orgId,
    branchIds,
    from,
    to,
    canReadAttendance,
    canReadStaff,
  }: {
    orgId: string;
    branchIds: string[];
    from: string;
    to: string;
    canReadAttendance: boolean;
    canReadStaff: boolean;
  }) {
    const header = <div>
      <h2 className="text-lg font-bold text-slate-950">Staff attendance rate</h2>
      <p className="mt-1 text-sm text-slate-500">Weekly for ranges up to six months, monthly for longer ranges. Present and late marks as a share of recorded non-excused staff marks.</p>
    </div>;
    if (!canReadAttendance || !canReadStaff) {
      return <article data-education-dashboard-card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        {header}<p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Staff directory and attendance reporting access are required.</p>
      </article>;
    }
    if (!branchIds.length) {
      return <article data-education-dashboard-card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        {header}<p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Assign campus access to see staff attendance rates.</p>
      </article>;
    }

    const spanDays = Math.floor((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000) + 1;
    const countsByBucket = new Map<string, { present: number; late: number; absent: number; excused: number }>();
    const supabase = await createClient();
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase.from("education_attendance")
        .select("id, attendance_date, status")
        .eq("org_id", orgId).in("branch_id", branchIds)
        .gte("attendance_date", from).lte("attendance_date", to)
        .not("staff_id", "is", null).is("student_id", null)
        .order("attendance_date").order("id")
        .range(offset, offset + pageSize - 1);
      if (error) {
        console.error("Could not load Think Education staff attendance trends:", error);
        return <article data-education-dashboard-card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          {header}<SectionError section="staff attendance trends" />
        </article>;
      }
      const page = data ?? [];
      if (offset >= 100_000 && page.length > 0) {
        console.error("Think Education staff attendance chart exceeded its 100,000-record processing limit.");
        return <article data-education-dashboard-card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          {header}<p className="mt-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">Staff attendance volume exceeds the chart limit. Narrow the date range to view this trend.</p>
        </article>;
      }
      for (const record of page) {
        const bucket = getAttendanceTrendBucket(record.attendance_date, spanDays);
        const counts = countsByBucket.get(bucket.date) ?? { present: 0, late: 0, absent: 0, excused: 0 };
        if (record.status === "present") counts.present += 1;
        if (record.status === "late") counts.late += 1;
        if (record.status === "absent") counts.absent += 1;
        if (record.status === "excused") counts.excused += 1;
        countsByBucket.set(bucket.date, counts);
      }
      if (page.length < pageSize) break;
    }

    const trend: StaffAttendanceRatePoint[] = Array.from(countsByBucket, ([date, counts]) => {
      const eligible = counts.present + counts.late + counts.absent;
      return {
        date,
        label: getAttendanceTrendBucket(date, spanDays).label,
        rate: eligible ? Math.round(((counts.present + counts.late) / eligible) * 1000) / 10 : null,
      };
    }).sort((a, b) => a.date.localeCompare(b.date));
    return <article data-education-dashboard-card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {header}
      <StaffAttendanceRateLineChart data={trend} />
    </article>;
  }

  export async function FeeAgingCard({
    orgId,
    branchIds,
    today,
    canReadFeeAging,
  }: {
    orgId: string;
    branchIds: string[];
    today: string;
    canReadFeeAging: boolean;
  }) {
    const header = <div>
      <h2 className="text-lg font-bold text-slate-950">Outstanding fee aging</h2>
      <p className="mt-1 text-sm text-slate-500">Current unpaid fee balances by days past due. Amounts use your organization currency.</p>
    </div>;
    if (!canReadFeeAging) {
      return <article data-education-dashboard-card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        {header}<p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Finance, student, and academic reporting access is required for fee aging.</p>
      </article>;
    }
    if (!branchIds.length) {
      return <article data-education-dashboard-card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        {header}<p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Assign campus access to see fee aging.</p>
      </article>;
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("education_get_fee_aging_page", {
      p_org_id: orgId,
      p_branch_ids: branchIds,
      p_academic_year_id: null,
      p_as_of_date: today,
      p_limit: 1,
      p_offset: 0,
    });
    if (error) {
      console.error("Could not load Think Education fee aging:", error);
      return <article data-education-dashboard-card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        {header}<SectionError section="outstanding fee aging" />
      </article>;
    }

    const totals = data?.[0];
    const chartData: FeeAgingPoint[] = [
      { bucket: "Not overdue", amount: Number(totals?.total_not_due ?? 0) },
      { bucket: "1–30 days", amount: Number(totals?.total_days_1_to_30 ?? 0) },
      { bucket: "31–60 days", amount: Number(totals?.total_days_31_to_60 ?? 0) },
      { bucket: "61–90 days", amount: Number(totals?.total_days_61_to_90 ?? 0) },
      { bucket: "Over 90 days", amount: Number(totals?.total_over_90 ?? 0) },
    ];
    return <article data-education-dashboard-card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {header}
      <FeeAgingBarChart data={chartData} />
    </article>;
  }
