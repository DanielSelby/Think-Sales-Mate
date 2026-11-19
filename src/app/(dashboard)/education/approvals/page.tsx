import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen, ClipboardCheck, GraduationCap, Users, Wallet } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";

export default async function EducationApprovalsPage() {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");

  const [
    canEditAdmissions,
    canApproveAdmissionsAction,
    canViewExpenses,
    canApproveExpenses,
    canViewLeave,
    canApproveLeave,
    canViewTransfers,
    canEditTransfers,
    canApproveTransfers,
    canViewLibrary,
    { campuses },
  ] = await Promise.all([
    canTabPermission("education_admissions", "admissions", "applications", "edit"),
    canTabPermission("education_admissions", "admissions", "applications", "approve"),
    canTabPermission("education_expenses", "expenses", "records", "view"),
    canTabPermission("education_expenses", "expenses", "records", "approve"),
    canTabPermission("education_staff", "staff", "leave", "view"),
    canTabPermission("education_staff", "staff", "leave", "approve"),
    canTabPermission("education_transfers", "transfers", "requests", "view"),
    canTabPermission("education_transfers", "transfers", "requests", "edit"),
    canTabPermission("education_transfers", "transfers", "requests", "approve"),
    canTabPermission("education_library", "library", "circulation", "view"),
    getAccessibleEducationCampuses(context.orgId, context.userId),
  ]);
  const branchIds = campuses.map((campus) => campus.id);
  const canReviewAdmissions = canEditAdmissions && canApproveAdmissionsAction;
  const canReviewExpenses = canViewExpenses && canApproveExpenses;
  const canReviewLeave = canViewLeave && canApproveLeave;
  const canReviewTransfers = canViewTransfers && canEditTransfers && canApproveTransfers && branchIds.length > 1;

  if (!canReviewAdmissions && !canReviewExpenses && !canReviewLeave
    && !canReviewTransfers && !canViewLibrary) {
    redirect("/dashboard?accessDenied=think-education.approvals");
  }

  const supabase = await createClient();
  const zeroCount = Promise.resolve({ count: 0, error: null });
  const [
    admissionsResult,
    expensesResult,
    leaveResult,
    transfersResult,
    libraryResult,
  ] = await Promise.all([
    canReviewAdmissions && branchIds.length
      ? supabase.from("education_admissions").select("id", { count: "exact", head: true })
        .eq("org_id", context.orgId).in("branch_id", branchIds).in("status", ["pending", "under_review"])
      : zeroCount,
    canReviewExpenses && branchIds.length
      ? supabase.from("education_expenses").select("id", { count: "exact", head: true })
        .eq("org_id", context.orgId).in("branch_id", branchIds).eq("status", "pending_approval")
      : zeroCount,
    canReviewLeave && branchIds.length
      ? supabase.from("education_staff_leave_requests").select("id", { count: "exact", head: true })
        .eq("org_id", context.orgId).in("branch_id", branchIds).eq("status", "pending")
      : zeroCount,
    canReviewTransfers && branchIds.length
      ? supabase.from("education_student_transfers").select("id", { count: "exact", head: true })
        .eq("org_id", context.orgId).in("source_branch_id", branchIds)
        .in("destination_branch_id", branchIds).eq("status", "pending")
      : zeroCount,
    canViewLibrary && branchIds.length
      ? supabase.from("education_library_loans").select("id", { count: "exact", head: true })
        .eq("org_id", context.orgId).in("branch_id", branchIds)
        .is("returned_on", null).lt("due_on", new Date().toISOString().slice(0, 10))
      : zeroCount,
  ]);
  const queryError = admissionsResult.error ?? expensesResult.error ?? leaveResult.error
    ?? transfersResult.error ?? libraryResult.error;
  if (queryError) throw new Error(`Could not load Think Education approvals: ${queryError.message}`);

  const approvals = [
    ...(canReviewAdmissions ? [{
      label: "Admissions awaiting review",
      description: "Review pending and in-review student applications.",
      count: admissionsResult.count ?? 0,
      href: "/admissions",
      icon: GraduationCap,
      iconClass: "text-amber-700",
    }] : []),
    ...(canReviewExpenses ? [{
      label: "Expenses awaiting approval",
      description: "Review pending campus expense records.",
      count: expensesResult.count ?? 0,
      href: "/expenses?status=pending_approval",
      icon: Wallet,
      iconClass: "text-rose-700",
    }] : []),
    ...(canReviewLeave ? [{
      label: "Staff leave awaiting approval",
      description: "Review pending staff leave requests.",
      count: leaveResult.count ?? 0,
      href: "/staff/leave?status=pending",
      icon: Users,
      iconClass: "text-violet-700",
    }] : []),
    ...(canReviewTransfers ? [{
      label: "Student transfers awaiting review",
      description: "Review transfers between campuses in your access scope.",
      count: transfersResult.count ?? 0,
      href: "/transfers",
      icon: ArrowRight,
      iconClass: "text-blue-700",
    }] : []),
  ];

  const followUps = canViewLibrary ? [{
    label: "Overdue library loans",
    description: "Follow up on loans that have passed their due date.",
    count: libraryResult.count ?? 0,
    href: "/library",
    icon: BookOpen,
  }] : [];

  return <main className="mx-auto max-w-[1200px] space-y-5 p-4 md:p-6">
    <header>
      <Link href={getProductAppPath("think-education", "/dashboard")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-950">Approvals &amp; attention</h1>
      <p className="mt-1 text-sm text-slate-600">Pending decisions and follow-up items across your assigned campuses.</p>
    </header>

    {approvals.length > 0 && <section className="space-y-3">
      <h2 className="text-lg font-semibold text-slate-950">Approvals</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {approvals.map(({ label, description, count, href, icon: Icon, iconClass }) => <Link
          key={label}
          href={getProductAppPath("think-education", href)}
          className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:bg-blue-50/40"
        >
          <span>
            <span className="flex items-center gap-2 font-semibold text-slate-950"><Icon className={`h-5 w-5 ${iconClass}`} />{label}</span>
            <span className="mt-1 block text-sm text-slate-600">{description}</span>
          </span>
          <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-lg font-bold tabular-nums text-slate-800">{count.toLocaleString()}</span>
        </Link>)}
      </div>
    </section>}

    {followUps.length > 0 && <section className="space-y-3">
      <h2 className="text-lg font-semibold text-slate-950">Follow-up</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {followUps.map(({ label, description, count, href, icon: Icon }) => <Link
          key={label}
          href={getProductAppPath("think-education", href)}
          className="flex items-center justify-between gap-4 rounded-xl border border-rose-200 bg-rose-50 p-5 transition hover:border-rose-300 hover:bg-rose-100"
        >
          <span>
            <span className="flex items-center gap-2 font-semibold text-rose-950"><Icon className="h-5 w-5" />{label}</span>
            <span className="mt-1 block text-sm text-rose-800">{description}</span>
          </span>
          <span className="shrink-0 rounded-full bg-white/70 px-3 py-1 text-lg font-bold tabular-nums text-rose-900">{count.toLocaleString()}</span>
        </Link>)}
      </div>
    </section>}

    {approvals.length === 0 && followUps.length === 0 && <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
      There are no approval or follow-up queues available for your campus access.
    </p>}
  </main>;
}
