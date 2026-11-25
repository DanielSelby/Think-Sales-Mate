import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ArrowRight, BookOpen, Building2, CalendarCheck, ClipboardCheck, FileText, GraduationCap, TrendingUp, Users, Wallet } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { formatCurrencyAmount } from "@/lib/currency";
import { getOrganizationCurrencyConfig } from "@/lib/currency/settings";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canPermission, canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import { grantOwnEducationOrganizationScope } from "../actions";
import { DashboardFilters } from "./dashboard-filters";
import {
  AttendanceStatusCard,
  StudentDistributionCard,
  StudentGenderCard,
} from "./dashboard-secondary-sections";

type Metric = { label: string; value: number | string | null; icon: typeof Users; tint: string };
type DashboardParams = Record<string, string | string[] | undefined>;

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export default async function ThinkEducationDashboardPage({
  searchParams,
}: {
  searchParams: Promise<DashboardParams>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_dashboard", "dashboard", "overview", "view")) {
    redirect("/dashboard?accessDenied=think-education");
  }

  const params = await searchParams;
  const supabase = await createClient();
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const today = new Date().toISOString().slice(0, 10);
  const defaultFrom = `${today.slice(0, 7)}-01`;
  const requestedFrom = typeof params.from === "string" ? params.from : "";
  const requestedTo = typeof params.to === "string" ? params.to : "";
  let from = isValidDate(requestedFrom) ? requestedFrom : defaultFrom;
  let to = isValidDate(requestedTo) ? requestedTo : today;
  if (from > to) {
    from = defaultFrom;
    to = today;
  }
  const requestedBranch = typeof params.branch === "string" ? params.branch : "";
  const selectedBranch = campuses.some((campus) => campus.id === requestedBranch) ? requestedBranch : "";
  const selectedCampuses = selectedBranch ? campuses.filter((campus) => campus.id === selectedBranch) : campuses;
  const branchIds = selectedCampuses.map((campus) => campus.id);
  const fromTimestamp = `${from}T00:00:00.000Z`;
  const toExclusiveTimestamp = `${shiftDate(to, 1)}T00:00:00.000Z`;
  const [
    canReadStudents,
    canReadStaff,
    canReadGuardians,
    canReadAdmissions,
    canReadAttendance,
    canReadAcademics,
    canReadExaminations,
    canReadResults,
    canReadTimetables,
    canReadPromotion,
    canViewExpenseRecords,
    canReadFeePayments,
    canReadFeeCharges,
  ] = await Promise.all([
    canPermission("education_students", "view"),
    canPermission("education_staff", "view"),
    canTabPermission("education_guardians", "guardians", "directory", "view"),
    canPermission("education_admissions", "view"),
    canPermission("education_attendance", "view"),
    canPermission("education_academics", "view"),
    canPermission("education_examinations", "view"),
    canPermission("education_results", "view"),
    canPermission("education_timetables", "view"),
    canPermission("education_promotion", "view"),
    canTabPermission("education_expenses", "expenses", "records", "view"),
    canTabPermission("education_finance", "finance", "payments", "view"),
    canTabPermission("education_finance", "finance", "charges", "view"),
  ]);
  const financeSummaryPromise = Promise.all([
    supabase.rpc("education_get_dashboard_finance_summary", {
      p_org_id: context.orgId,
      p_branch_ids: branchIds,
      p_from: fromTimestamp,
      p_to_exclusive: toExclusiveTimestamp,
      p_include_fees: canReadFeePayments && canReadFeeCharges,
      p_include_expenses: canViewExpenseRecords,
    }),
    getOrganizationCurrencyConfig(),
  ]);
  const todayFinanceSummaryPromise = canReadFeePayments && canReadFeeCharges && branchIds.length
    ? supabase.rpc("education_get_dashboard_finance_summary", {
      p_org_id: context.orgId,
      p_branch_ids: branchIds,
      p_from: `${today}T00:00:00.000Z`,
      p_to_exclusive: `${shiftDate(today, 1)}T00:00:00.000Z`,
      p_include_fees: true,
      p_include_expenses: false,
    })
    : Promise.resolve({ data: [], error: null });
  const parentCountPromise = (async () => {
    if (!canReadGuardians || !branchIds.length) return 0;
    const guardianIds = new Set<string>();
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from("education_student_guardians")
        .select("id, guardian_id")
        .eq("org_id", context.orgId)
        .in("branch_id", branchIds)
        .eq("status", "verified")
        .order("id")
        .range(offset, offset + 999);
      if (error) throw new Error(`Could not count Think Education parents: ${error.message}`);
      if (offset === 100_000 && (data?.length ?? 0) > 0) {
        throw new Error("The number of guardian relationships exceeds the dashboard processing limit.");
      }
      for (const relationship of data ?? []) guardianIds.add(relationship.guardian_id);
      if ((data?.length ?? 0) < 1000) return guardianIds.size;
    }
  })();
  const zeroCount = Promise.resolve({ count: 0, error: null });
  const [
    { count: studentCount, error: studentsError },
    { count: staffCount, error: staffError },
    { count: teacherCount, error: teachersError },
    { count: classCount, error: classesError },
    { count: subjectCount, error: subjectsError },
    { count: totalAdmissionCount, error: admissionsError },
    { count: presentCount, error: presentError },
    { count: attendanceCount, error: attendanceError },
    [financeSummaryResult, currencyConfig],
    todayFinanceSummaryResult,
    parentCount,
  ] = await Promise.all([
    canReadStudents && branchIds.length
      ? supabase.from("education_students").select("id", { count: "exact", head: true })
        .eq("org_id", context.orgId).in("branch_id", branchIds).eq("status", "active")
      : zeroCount,
    canReadStaff && branchIds.length
      ? supabase.from("education_staff").select("id", { count: "exact", head: true })
        .eq("org_id", context.orgId).in("branch_id", branchIds).eq("status", "active")
      : zeroCount,
    canReadStaff && branchIds.length
      ? supabase.from("education_staff").select("id", { count: "exact", head: true })
        .eq("org_id", context.orgId).in("branch_id", branchIds)
        .eq("staff_category", "teaching").eq("status", "active")
      : zeroCount,
    canReadAcademics && branchIds.length
      ? supabase.from("education_classes").select("id", { count: "exact", head: true })
        .eq("org_id", context.orgId).in("branch_id", branchIds).eq("status", "active")
      : zeroCount,
    canReadAcademics
      ? supabase.from("education_subjects").select("id", { count: "exact", head: true })
        .eq("org_id", context.orgId).eq("status", "active")
      : zeroCount,
    canReadAdmissions && branchIds.length
      ? supabase.from("education_admissions").select("id", { count: "exact", head: true })
        .eq("org_id", context.orgId).in("branch_id", branchIds)
        .gte("applied_at", fromTimestamp).lt("applied_at", toExclusiveTimestamp)
      : zeroCount,
    canReadAttendance && branchIds.length
      ? supabase.from("education_attendance").select("id", { count: "exact", head: true })
        .eq("org_id", context.orgId).in("branch_id", branchIds).eq("attendance_date", today).eq("status", "present")
      : zeroCount,
    canReadAttendance && branchIds.length
      ? supabase.from("education_attendance").select("id", { count: "exact", head: true })
        .eq("org_id", context.orgId).in("branch_id", branchIds).eq("attendance_date", today)
      : zeroCount,
    financeSummaryPromise,
    todayFinanceSummaryPromise,
    parentCountPromise,
  ]);
  const queryError = studentsError ?? staffError ?? teachersError ?? classesError ?? subjectsError
    ?? admissionsError ?? presentError ?? attendanceError;
  if (queryError) throw new Error(`Could not load Think Education dashboard: ${queryError.message}`);

  const feeStatsByCampus = new Map(branchIds.map((branchId) => [branchId, {
    paidInRange: 0,
    billedInRange: 0,
    paidAgainstRangeCharges: 0,
    outstanding: 0,
  }]));
  if (financeSummaryResult.error) {
    throw new Error(`Could not load Think Education dashboard finance summary: ${financeSummaryResult.error.message}`);
  }
  let totalFeePaid = 0;
  let totalExpenses = 0;
  for (const row of financeSummaryResult.data ?? []) {
    const campusStats = feeStatsByCampus.get(row.branch_id);
    if (!campusStats) continue;
    campusStats.paidInRange = Number(row.paid_in_range);
    campusStats.billedInRange = Number(row.billed_in_range);
    campusStats.paidAgainstRangeCharges = Number(row.paid_against_range_charges);
    campusStats.outstanding = Number(row.outstanding);
    totalFeePaid += campusStats.paidInRange;
    totalExpenses += Number(row.expenses);
  }
  if (todayFinanceSummaryResult.error) {
    throw new Error(`Could not load today's Think Education collections: ${todayFinanceSummaryResult.error.message}`);
  }
  const todayCollections = (todayFinanceSummaryResult.data ?? [])
    .reduce((total, row) => total + Number(row.paid_in_range), 0);
  const formatMoney = (amount: number) => formatCurrencyAmount(amount, currencyConfig);
  const totalOutstandingFees = Array.from(feeStatsByCampus.values())
    .reduce((total, stats) => total + stats.outstanding, 0);
  const attendanceRate = attendanceCount
    ? Math.round(((presentCount ?? 0) / attendanceCount) * 1000) / 10
    : null;
  const metrics: Metric[] = [
    { label: "Active students", value: canReadStudents ? studentCount ?? 0 : "Restricted", icon: GraduationCap, tint: "bg-blue-50 text-blue-700" },
    { label: "Active staff", value: canReadStaff ? staffCount ?? 0 : "Restricted", icon: Users, tint: "bg-violet-50 text-violet-700" },
    { label: "Active Teachers", value: canReadStaff ? teacherCount ?? 0 : "Restricted", icon: Users, tint: "bg-violet-50 text-violet-700" },
    { label: "Classes", value: canReadAcademics ? classCount ?? 0 : "Restricted", icon: BookOpen, tint: "bg-blue-50 text-blue-700" },
    { label: "Subjects", value: canReadAcademics ? subjectCount ?? 0 : "Restricted", icon: BookOpen, tint: "bg-emerald-50 text-emerald-700" },
    { label: "Parents", value: canReadGuardians ? parentCount : "Restricted", icon: Users, tint: "bg-amber-50 text-amber-700" },
    { label: "Campuses in your access", value: campuses.length, icon: Building2, tint: "bg-emerald-50 text-emerald-700" },
    { label: "Attendance today", value: !canReadAttendance ? "Restricted" : attendanceRate, icon: CalendarCheck, tint: "bg-amber-50 text-amber-700" },
    { label: "Total fee paid", value: !canReadFeePayments || !canReadFeeCharges ? "Restricted" : formatMoney(totalFeePaid), icon: Wallet, tint: "bg-emerald-50 text-emerald-700" },
    { label: "Today's collections", value: !canReadFeePayments || !canReadFeeCharges ? "Restricted" : formatMoney(todayCollections), icon: Wallet, tint: "bg-emerald-50 text-emerald-700" },
    { label: "Outstanding fees", value: !canReadFeePayments || !canReadFeeCharges ? "Restricted" : formatMoney(totalOutstandingFees), icon: Wallet, tint: "bg-amber-50 text-amber-700" },
    { label: "Approved expenses", value: !canViewExpenseRecords ? "Restricted" : formatMoney(totalExpenses), icon: ClipboardCheck, tint: "bg-rose-50 text-rose-700" },
    { label: "Total admissions", value: !canReadAdmissions ? "Restricted" : totalAdmissionCount ?? 0, icon: Users, tint: "bg-blue-50 text-blue-700" },
  ];
  const campusFeeRows = selectedCampuses.map((campus) => {
    const stats = feeStatsByCampus.get(campus.id);
    const collectionRate = stats && stats.billedInRange > 0
      ? Math.round((stats.paidAgainstRangeCharges / stats.billedInRange) * 1000) / 10
      : null;
    return { campus, stats, collectionRate };
  });

  return <main className="mx-auto max-w-[1500px] space-y-4 p-3 md:p-5">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--theme-primary, #2563eb)" }}>Think Education</p>
        <h1 className="mt-1 text-2xl font-bold" style={{ color: "var(--theme-text, #111827)" }}>Welcome to Think Education</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--theme-text-muted, #4b5563)" }}>{context.orgName} · organization overview for campuses you are authorized to access.</p>
      </div>
      <Link href={getProductAppPath("think-education", "/organization")} className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95" style={{ backgroundColor: "var(--theme-primary, #2563eb)" }}>
        Organization &amp; campuses <ArrowRight className="h-4 w-4" />
      </Link>
    </header>

    <DashboardFilters
      key={`${from}:${to}:${selectedBranch}`}
      action={getProductAppPath("think-education", "/dashboard")}
      from={from}
      to={to}
      branch={selectedBranch}
      campuses={campuses}
    />

    {branchIds.length === 0 && <section className="rounded-xl border p-5" style={{ borderColor: "rgba(37,99,235,0.22)", backgroundColor: "var(--theme-primary-pale, #eff6ff)" }}>
      <h2 className="font-semibold" style={{ color: "var(--theme-primary, #1d4ed8)" }}>Campus access has not been configured</h2>
      <p className="mt-1 max-w-3xl text-sm" style={{ color: "var(--theme-primary, #1d4ed8)" }}>
        No organization-wide or branch-specific Think Education access is assigned to your account. Access is deliberately not inferred from your role.
      </p>
      {context.role === "owner" && <form action={grantOwnEducationOrganizationScope} className="mt-4">
        <button type="submit" className="rounded-lg px-4 py-2 text-sm font-semibold text-white hover:opacity-95" style={{ backgroundColor: "var(--theme-primary, #2563eb)" }}>
          Grant me access to all campuses
        </button>
      </form>}
    </section>}

    <section aria-label="Education overview metrics" data-education-metrics data-education-dashboard-metrics className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map(({ label, value, icon: Icon, tint }) => {
        const iconTone = tint.includes("bg-violet") ? "violet"
          : tint.includes("bg-emerald") ? "emerald"
            : tint.includes("bg-amber") ? "amber"
              : tint.includes("bg-rose") ? "rose"
                : "blue";
        const iconBackground = iconTone === "violet" ? "rgba(139,92,246,0.10)"
          : iconTone === "emerald" ? "rgba(16,185,129,0.10)"
            : iconTone === "amber" ? "rgba(245,158,11,0.12)"
              : iconTone === "rose" ? "rgba(244,63,94,0.10)"
                : "rgba(59,130,246,0.10)";
        return <article key={label} className="rounded-xl border p-4 shadow-sm" style={{ borderColor: "var(--theme-header-border-light, #dbeafe)", backgroundColor: "var(--theme-surface, #fff)" }}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm" style={{ color: "var(--theme-text-muted, #4b5563)" }}>{label}</p>
              <p className="mt-2 text-2xl font-bold" style={{ color: "var(--theme-text, #111827)" }}>
                {value === null ? "—" : label === "Attendance today" && typeof value === "number" ? `${value}%` : typeof value === "number" ? value.toLocaleString() : value}
              </p>
            </div>
            <span
              data-education-metric-icon
              data-icon-tone={iconTone}
              className="grid h-11 w-11 place-items-center rounded-xl"
              style={{ backgroundColor: iconBackground, color: "var(--theme-primary, #2563eb)" }}
            >
              <Icon className="h-5 w-5" />
            </span>
          </div>
        </article>;
      })}
    </section>

    <section aria-label="Education student and attendance charts" className="grid gap-4 lg:grid-cols-2">
      <Suspense fallback={<article aria-label="Student gender chart loading" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-950">Students by gender</h2>
        <p className="mt-1 text-sm text-slate-500">Active students in the selected campus scope.</p>
        <div className="mt-4 h-56 animate-pulse rounded-lg bg-slate-100" />
      </article>}>
        <StudentGenderCard
          orgId={context.orgId}
          branchIds={branchIds}
          canReadStudents={canReadStudents}
        />
      </Suspense>
      <Suspense fallback={<article aria-label="Attendance chart loading" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-950">Attendance by status</h2>
        <p className="mt-1 text-sm text-slate-500">Daily present, late, and absent counts for the last seven days.</p>
        <div className="mt-4 h-56 animate-pulse rounded-lg bg-slate-100" />
      </article>}>
        <AttendanceStatusCard
          orgId={context.orgId}
          branchIds={branchIds}
          today={today}
          canReadAttendance={canReadAttendance}
        />
      </Suspense>
    </section>

    {canReadFeePayments && canReadFeeCharges &&     <section aria-label="Campus-by-campus fee breakdown" data-education-fee-breakdown data-education-dashboard-card className="overflow-hidden rounded-xl border p-5 shadow-sm" style={{ borderColor: "var(--theme-header-border-light, #dbeafe)", backgroundColor: "var(--theme-surface, #fff)" }}>
      <div>
        <h2 className="text-lg font-bold" style={{ color: "var(--theme-text, #111827)" }}>Campus-by-campus fee breakdown</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--theme-text-muted, #4b5563)" }}>
          Payments show receipts in the selected date range. Collection rate shows payments to date against fees charged in that range; outstanding is the current balance of all open fees.
        </p>
      </div>
      {campusFeeRows.length === 0 ? <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No assigned campuses are available for this breakdown.</p>
        : <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3 font-semibold">Campus</th>
                <th className="px-3 py-3 text-right font-semibold">Fees billed</th>
                <th className="px-3 py-3 text-right font-semibold">Fee paid in range</th>
                <th className="px-3 py-3 text-right font-semibold">Current outstanding</th>
                <th className="px-3 py-3 text-right font-semibold">Collection rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {campusFeeRows.map(({ campus, stats, collectionRate }) => <tr key={campus.id}>
                <td className="px-3 py-3 font-semibold text-slate-900">{campus.name}</td>
                <td className="px-3 py-3 text-right tabular-nums text-slate-700">{formatMoney(stats?.billedInRange ?? 0)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-slate-700">{formatMoney(stats?.paidInRange ?? 0)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-slate-700">{formatMoney(stats?.outstanding ?? 0)}</td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums text-slate-900">{collectionRate === null ? "—" : `${collectionRate}%`}</td>
              </tr>)}
            </tbody>
          </table>
        </div>}
    </section>}

    <section className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
      <Suspense fallback={<article aria-label="Student distribution loading" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-950">Student distribution by campus</h2>
        <p className="mt-1 text-sm text-slate-500">Active students in the selected campus scope.</p>
        <div className="mt-5 h-48 animate-pulse rounded-lg bg-slate-100" />
      </article>}>
        <StudentDistributionCard
          orgId={context.orgId}
          campuses={selectedCampuses}
          branchIds={branchIds}
          studentCount={studentCount ?? 0}
          canReadStudents={canReadStudents}
        />
      </Suspense>

      <article data-education-dashboard-card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-950">Quick actions</h2>
        <p className="mt-1 text-sm text-slate-500">Open the education workflows available to your role.</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {[
            { label: "Approvals & attention", href: "/approvals", icon: ClipboardCheck, allowed: true },
            { label: "Manage campuses", href: "/organization", icon: Building2, allowed: true },
            { label: "Student records", href: "/students", icon: GraduationCap, allowed: canReadStudents },
            { label: "Staff directory", href: "/staff", icon: Users, allowed: canReadStaff },
            { label: "Admissions", href: "/admissions", icon: Users, allowed: canReadAdmissions },
            { label: "Academic setup", href: "/academics", icon: BookOpen, allowed: canReadAcademics },
            { label: "View attendance", href: "/attendance", icon: CalendarCheck, allowed: canReadAttendance },
            { label: "Timetables", href: "/timetables", icon: CalendarCheck, allowed: canReadTimetables },
            { label: "Examinations", href: "/examinations", icon: CalendarCheck, allowed: canReadExaminations },
            { label: "Results", href: "/results", icon: FileText, allowed: canReadResults },
            { label: "Campus comparison", href: "/reports/campus-comparison", icon: TrendingUp, allowed: branchIds.length > 0 },
            { label: "Promotion & graduation", href: "/promotion", icon: TrendingUp, allowed: canReadPromotion },
          ].filter((item) => item.allowed).map(({ label, href, icon: Icon }) => <Link key={href} href={getProductAppPath("think-education", href)} className="rounded-xl border border-slate-200 p-3 transition hover:border-blue-300 hover:bg-blue-50">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-blue-50 text-blue-700"><Icon className="h-4 w-4" /></span>
            <span className="mt-2 block text-sm font-semibold text-slate-800">{label}</span>
          </Link>)}
        </div>
      </article>
    </section>
  </main>;
}
