import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ArrowRightLeft, BookOpen, Building2, CalendarCheck, ClipboardCheck, FileText, GraduationCap, TrendingUp, Users } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canPermission, canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import { grantOwnEducationOrganizationScope } from "../actions";

type Metric = { label: string; value: number | string | null; icon: typeof Users; tint: string };

export default async function ThinkEducationDashboardPage() {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_dashboard", "dashboard", "overview", "view")) {
    redirect("/dashboard?accessDenied=think-education");
  }

  const supabase = await createClient();
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const branchIds = campuses.map((campus) => campus.id);
  const [
    canReadStudents,
    canReadStaff,
    canReadAdmissions,
    canReadAttendance,
    canReadAcademics,
    canReadExaminations,
    canReadResults,
    canReadTimetables,
    canReadPromotion,
    canViewExpenseRecords,
    canApproveExpenses,
    canReadLibraryCirculation,
    canViewLeaveRequests,
    canApproveLeaveRequests,
    canViewTransfers,
    canEditTransfers,
    canApproveTransfers,
  ] = await Promise.all([
    canPermission("education_students", "view"),
    canPermission("education_staff", "view"),
    canPermission("education_admissions", "view"),
    canPermission("education_attendance", "view"),
    canPermission("education_academics", "view"),
    canPermission("education_examinations", "view"),
    canPermission("education_results", "view"),
    canPermission("education_timetables", "view"),
    canPermission("education_promotion", "view"),
    canTabPermission("education_expenses", "expenses", "records", "view"),
    canTabPermission("education_expenses", "expenses", "records", "approve"),
    canTabPermission("education_library", "library", "circulation", "view"),
    canTabPermission("education_staff", "staff", "leave", "view"),
    canTabPermission("education_staff", "staff", "leave", "approve"),
    canTabPermission("education_transfers", "transfers", "requests", "view"),
    canTabPermission("education_transfers", "transfers", "requests", "edit"),
    canTabPermission("education_transfers", "transfers", "requests", "approve"),
  ]);
  const canReviewExpenses = canViewExpenseRecords && canApproveExpenses;
  const canReviewLeave = canViewLeaveRequests && canApproveLeaveRequests;
  const canReviewTransfers = canViewTransfers && canEditTransfers && canApproveTransfers && branchIds.length > 1;
  const today = new Date().toISOString().slice(0, 10);
  const zeroCount = Promise.resolve({ count: 0, error: null });
  const [
    { count: studentCount, error: studentsError },
    { count: staffCount, error: staffError },
    { count: admissionCount, error: admissionsError },
    { count: presentCount, error: presentError },
    { count: attendanceCount, error: attendanceError },
    { count: pendingExpenseCount, error: pendingExpensesError },
    { count: overdueLibraryCount, error: overdueLibraryError },
    { count: pendingLeaveCount, error: pendingLeaveError },
    { count: pendingTransferCount, error: pendingTransferError },
  ] = await Promise.all([
    canReadStudents && branchIds.length
      ? supabase.from("education_students").select("id", { count: "exact", head: true })
        .eq("org_id", context.orgId).in("branch_id", branchIds).eq("status", "active")
      : zeroCount,
    canReadStaff && branchIds.length
      ? supabase.from("education_staff").select("id", { count: "exact", head: true })
        .eq("org_id", context.orgId).in("branch_id", branchIds).eq("status", "active")
      : zeroCount,
    canReadAdmissions && branchIds.length
      ? supabase.from("education_admissions").select("id", { count: "exact", head: true })
        .eq("org_id", context.orgId).in("branch_id", branchIds).in("status", ["pending", "under_review"])
      : zeroCount,
    canReadAttendance && branchIds.length
      ? supabase.from("education_attendance").select("id", { count: "exact", head: true })
        .eq("org_id", context.orgId).in("branch_id", branchIds).eq("attendance_date", today).eq("status", "present")
      : zeroCount,
    canReadAttendance && branchIds.length
      ? supabase.from("education_attendance").select("id", { count: "exact", head: true })
        .eq("org_id", context.orgId).in("branch_id", branchIds).eq("attendance_date", today)
      : zeroCount,
    canReviewExpenses && branchIds.length
      ? supabase.from("education_expenses").select("id", { count: "exact", head: true })
        .eq("org_id", context.orgId).in("branch_id", branchIds).eq("status", "pending_approval")
      : zeroCount,
    canReadLibraryCirculation && branchIds.length
      ? supabase.from("education_library_loans").select("id", { count: "exact", head: true })
        .eq("org_id", context.orgId).in("branch_id", branchIds).is("returned_on", null).lt("due_on", today)
      : zeroCount,
    canReviewLeave && branchIds.length
      ? supabase.from("education_staff_leave_requests").select("id", { count: "exact", head: true })
        .eq("org_id", context.orgId).in("branch_id", branchIds).eq("status", "pending")
      : zeroCount,
    canReviewTransfers
      ? supabase.from("education_student_transfers").select("id", { count: "exact", head: true })
        .eq("org_id", context.orgId)
        .in("source_branch_id", branchIds)
        .in("destination_branch_id", branchIds)
        .eq("status", "pending")
      : zeroCount,
  ]);
  const queryError = studentsError ?? staffError ?? admissionsError ?? presentError ?? attendanceError
    ?? pendingExpensesError ?? overdueLibraryError ?? pendingLeaveError ?? pendingTransferError;
  if (queryError) throw new Error(`Could not load Think Education dashboard: ${queryError.message}`);

  const attendanceTrendDates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${today}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() - (6 - index));
    return date.toISOString().slice(0, 10);
  });
  const attendanceTrend = canReadAttendance && branchIds.length
    ? await Promise.all(attendanceTrendDates.map(async (date) => {
      const [totalResult, presentResult] = await Promise.all([
        supabase.from("education_attendance").select("id", { count: "exact", head: true })
          .eq("org_id", context.orgId).in("branch_id", branchIds).eq("attendance_date", date),
        supabase.from("education_attendance").select("id", { count: "exact", head: true })
          .eq("org_id", context.orgId).in("branch_id", branchIds).eq("attendance_date", date).eq("status", "present"),
      ]);
      if (totalResult.error) throw new Error(`Could not load attendance trend for ${date}: ${totalResult.error.message}`);
      if (presentResult.error) throw new Error(`Could not load present attendance for ${date}: ${presentResult.error.message}`);
      const total = totalResult.count ?? 0;
      const present = presentResult.count ?? 0;
      return { date, total, present, rate: total ? Math.round((present / total) * 100) : null };
    }))
    : [];
  const studentDistribution = canReadStudents
    ? await Promise.all(campuses.map(async (campus) => {
      const { count, error } = await supabase.from("education_students")
        .select("id", { count: "exact", head: true })
        .eq("org_id", context.orgId).eq("branch_id", campus.id).eq("status", "active");
      if (error) throw new Error(`Could not load student count for ${campus.name}: ${error.message}`);
      return { campus, count: count ?? 0 };
    }))
    : [];
  const attendanceRate = attendanceCount
    ? Math.round(((presentCount ?? 0) / attendanceCount) * 1000) / 10
    : null;
  const metrics: Metric[] = [
    { label: "Active students", value: canReadStudents ? studentCount ?? 0 : "Restricted", icon: GraduationCap, tint: "bg-blue-50 text-blue-700" },
    { label: "Active staff", value: canReadStaff ? staffCount ?? 0 : "Restricted", icon: Users, tint: "bg-violet-50 text-violet-700" },
    { label: "Campuses in your access", value: campuses.length, icon: Building2, tint: "bg-emerald-50 text-emerald-700" },
    { label: "Attendance today", value: !canReadAttendance ? "Restricted" : attendanceRate, icon: CalendarCheck, tint: "bg-amber-50 text-amber-700" },
  ];

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

    <section aria-label="Education overview metrics" data-education-metrics className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map(({ label, value, icon: Icon, tint }) => <article key={label} className="rounded-xl border p-4 shadow-sm" style={{ borderColor: "var(--theme-header-border-light, #dbeafe)", backgroundColor: "var(--theme-surface, #fff)" }}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm" style={{ color: "var(--theme-text-muted, #4b5563)" }}>{label}</p>
            <p className="mt-2 text-2xl font-bold" style={{ color: "var(--theme-text, #111827)" }}>
              {value === null ? "—" : label === "Attendance today" && typeof value === "number" ? `${value}%` : typeof value === "number" ? value.toLocaleString() : value}
            </p>
          </div>
          <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ backgroundColor: tint.includes("bg-blue") ? "rgba(59,130,246,0.10)" : tint.includes("bg-violet") ? "rgba(139,92,246,0.10)" : tint.includes("bg-emerald") ? "rgba(16,185,129,0.10)" : "rgba(245,158,11,0.12)", color: "var(--theme-primary, #2563eb)" }}><Icon className="h-5 w-5" /></span>
        </div>
      </article>)}
    </section>

    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Attendance trend</h2>
          <p className="mt-1 text-sm text-slate-500">Daily present rate across your assigned campuses for the last seven days.</p>
        </div>
        <Link href={getProductAppPath("think-education", "/attendance")} className="text-sm font-semibold text-blue-700">Open attendance</Link>
      </div>
      {!canReadAttendance ? <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Your role does not include attendance reporting access.</p>
        : branchIds.length === 0 ? <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Assign campus access to see attendance trends.</p>
          : attendanceTrend.every((day) => day.total === 0) ? <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No attendance has been recorded in the last seven days.</p>
            : <div className="mt-5 grid grid-cols-7 gap-2 sm:gap-4">
              {attendanceTrend.map((day) => <div key={day.date} className="flex min-w-0 flex-col items-center gap-2">
                <span className="text-xs font-semibold tabular-nums text-slate-700">{day.rate === null ? "—" : `${day.rate}%`}</span>
                <div className="flex h-32 w-full items-end justify-center rounded-lg bg-slate-50 p-2" role="img" aria-label={`${day.date}: ${day.present} present out of ${day.total} marked`}>
                  <span className="w-full rounded-t-md bg-blue-600" style={{ height: `${day.rate ?? 0}%`, minHeight: day.rate === null ? 0 : "0.375rem" }} />
                </div>
                <span className="text-center text-[11px] text-slate-500">{new Date(`${day.date}T12:00:00.000Z`).toLocaleDateString(undefined, { weekday: "short" })}</span>
              </div>)}
            </div>}
    </section>

    {(canReviewExpenses || canReadLibraryCirculation || canReviewLeave || canReviewTransfers) && <section className="space-y-3">
      <div>
        <h2 className="text-lg font-bold text-slate-950">Needs attention</h2>
        <p className="mt-1 text-sm text-slate-500">Pending items across the campuses you can access.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {canReviewExpenses && <Link href={getProductAppPath("think-education", "/expenses?status=pending_approval")} className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 transition hover:border-amber-300 hover:bg-amber-100">
          <span>
            <span className="block text-sm font-semibold text-amber-950">Expenses awaiting approval</span>
            <span className="mt-1 block text-sm text-amber-800">Review pending expense records</span>
          </span>
          <span className="flex items-center gap-2 text-amber-900"><span className="text-2xl font-bold">{(pendingExpenseCount ?? 0).toLocaleString()}</span><ClipboardCheck className="h-5 w-5" /></span>
        </Link>}
        {canReadLibraryCirculation && <Link href={getProductAppPath("think-education", "/library")} className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 transition hover:border-rose-300 hover:bg-rose-100">
          <span>
            <span className="block text-sm font-semibold text-rose-950">Overdue library loans</span>
            <span className="mt-1 block text-sm text-rose-800">Open the circulation list to follow up</span>
          </span>
          <span className="flex items-center gap-2 text-rose-900"><span className="text-2xl font-bold">{(overdueLibraryCount ?? 0).toLocaleString()}</span><BookOpen className="h-5 w-5" /></span>
        </Link>}
        {canReviewLeave && <Link href={getProductAppPath("think-education", "/staff/leave?status=pending")} className="flex items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4 transition hover:border-violet-300 hover:bg-violet-100">
          <span>
            <span className="block text-sm font-semibold text-violet-950">Staff leave awaiting approval</span>
            <span className="mt-1 block text-sm text-violet-800">Review pending leave requests</span>
          </span>
          <span className="flex items-center gap-2 text-violet-900"><span className="text-2xl font-bold">{(pendingLeaveCount ?? 0).toLocaleString()}</span><CalendarCheck className="h-5 w-5" /></span>
        </Link>}
        {canReviewTransfers && <Link href={getProductAppPath("think-education", "/transfers")} className="flex items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 transition hover:border-blue-300 hover:bg-blue-100">
          <span>
            <span className="block text-sm font-semibold text-blue-950">Student transfers awaiting review</span>
            <span className="mt-1 block text-sm text-blue-800">Both campuses are within your assigned access</span>
          </span>
          <span className="flex items-center gap-2 text-blue-900"><span className="text-2xl font-bold">{(pendingTransferCount ?? 0).toLocaleString()}</span><ArrowRightLeft className="h-5 w-5" /></span>
        </Link>}
      </div>
    </section>}

    <section className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
      <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Student distribution by campus</h2>
            <p className="mt-1 text-sm text-slate-500">Active students across campuses within your assigned data scope.</p>
          </div>
          <Link href={getProductAppPath("think-education", "/students")} className="shrink-0 text-sm font-semibold text-blue-700">View students</Link>
        </div>
        {!canReadStudents ? <p className="mt-5 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Your role does not include student reporting access.</p>
          : campuses.length === 0 ? <p className="mt-5 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Assign campus access to see student distribution.</p>
            : <ul className="mt-4 divide-y divide-slate-100">
              {studentDistribution.map(({ campus, count }) => <li key={campus.id} className="flex items-center justify-between gap-3 py-3">
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
              </li>)}
            </ul>}
      </article>

      <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-950">Quick actions</h2>
        <p className="mt-1 text-sm text-slate-500">Open the education workflows available to your role.</p>
        {canReadAdmissions && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {admissionCount ?? 0} admission applications need review
        </p>}
        <div className="mt-4 grid grid-cols-2 gap-3">
          {[
            { label: "Manage campuses", href: "/organization", icon: Building2, allowed: true },
            { label: "Student records", href: "/students", icon: GraduationCap, allowed: canReadStudents },
            { label: "Staff directory", href: "/staff", icon: Users, allowed: canReadStaff },
            { label: "Admissions", href: "/admissions", icon: Users, allowed: canReadAdmissions },
            { label: "Academic setup", href: "/academics", icon: BookOpen, allowed: canReadAcademics },
            { label: "View attendance", href: "/attendance", icon: CalendarCheck, allowed: canReadAttendance },
            { label: "Timetables", href: "/timetables", icon: CalendarCheck, allowed: canReadTimetables },
            { label: "Examinations", href: "/examinations", icon: CalendarCheck, allowed: canReadExaminations },
            { label: "Results", href: "/results", icon: FileText, allowed: canReadResults },
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
