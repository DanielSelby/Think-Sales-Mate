import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen, ChevronDown, GraduationCap, Users, Wallet } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";

const APPROVALS_PAGE_SIZE = 500;

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
  const admissionRows: Array<{
    id: string;
    branch_id: string;
    application_number: string;
    applicant_first_name: string;
    applicant_last_name: string;
    applied_at: string;
  }> = [];
  const expenseRows: Array<{
    id: string;
    branch_id: string;
    expense_number: number;
    category: string;
    vendor: string | null;
    description: string;
    amount: number;
    expense_date: string;
    created_at: string;
  }> = [];
  const leaveRows: Array<{
    id: string;
    branch_id: string;
    staff_id: string;
    leave_type: string;
    starts_on: string;
    ends_on: string;
    reason: string;
    created_at: string;
  }> = [];
  const transferRows: Array<{
    id: string;
    student_id: string;
    source_branch_id: string;
    destination_branch_id: string;
    effective_on: string;
    reason: string;
    created_at: string;
  }> = [];
  const loadAdmissions = async () => {
    if (!canReviewAdmissions || !branchIds.length) return;
    for (let from = 0; ; from += APPROVALS_PAGE_SIZE) {
      const { data, error } = await supabase.from("education_admissions")
        .select("id, branch_id, application_number, applicant_first_name, applicant_last_name, applied_at")
        .eq("org_id", context.orgId).in("branch_id", branchIds).in("status", ["pending", "under_review"])
        .order("applied_at", { ascending: false }).range(from, from + APPROVALS_PAGE_SIZE - 1);
      if (error) throw new Error(`Could not load pending admissions: ${error.message}`);
      const page = data ?? [];
      admissionRows.push(...page);
      if (page.length < APPROVALS_PAGE_SIZE) return;
    }
  };
  const loadExpenses = async () => {
    if (!canReviewExpenses || !branchIds.length) return;
    for (let from = 0; ; from += APPROVALS_PAGE_SIZE) {
      const { data, error } = await supabase.from("education_expenses")
        .select("id, branch_id, expense_number, category, vendor, description, amount, expense_date, created_at")
        .eq("org_id", context.orgId).in("branch_id", branchIds).eq("status", "pending_approval")
        .order("created_at", { ascending: false }).range(from, from + APPROVALS_PAGE_SIZE - 1);
      if (error) throw new Error(`Could not load pending expenses: ${error.message}`);
      const page = data ?? [];
      expenseRows.push(...page);
      if (page.length < APPROVALS_PAGE_SIZE) return;
    }
  };
  const loadLeave = async () => {
    if (!canReviewLeave || !branchIds.length) return;
    for (let from = 0; ; from += APPROVALS_PAGE_SIZE) {
      const { data, error } = await supabase.from("education_staff_leave_requests")
        .select("id, branch_id, staff_id, leave_type, starts_on, ends_on, reason, created_at")
        .eq("org_id", context.orgId).in("branch_id", branchIds).eq("status", "pending")
        .order("created_at", { ascending: false }).range(from, from + APPROVALS_PAGE_SIZE - 1);
      if (error) throw new Error(`Could not load pending leave requests: ${error.message}`);
      const page = data ?? [];
      leaveRows.push(...page);
      if (page.length < APPROVALS_PAGE_SIZE) return;
    }
  };
  const loadTransfers = async () => {
    if (!canReviewTransfers || !branchIds.length) return;
    for (let from = 0; ; from += APPROVALS_PAGE_SIZE) {
      const { data, error } = await supabase.from("education_student_transfers")
        .select("id, student_id, source_branch_id, destination_branch_id, effective_on, reason, created_at")
        .eq("org_id", context.orgId).in("source_branch_id", branchIds)
        .in("destination_branch_id", branchIds).eq("status", "pending")
        .order("created_at", { ascending: false }).range(from, from + APPROVALS_PAGE_SIZE - 1);
      if (error) throw new Error(`Could not load pending student transfers: ${error.message}`);
      const page = data ?? [];
      transferRows.push(...page);
      if (page.length < APPROVALS_PAGE_SIZE) return;
    }
  };
  const [libraryResult] = await Promise.all([
    canViewLibrary && branchIds.length
      ? supabase.from("education_library_loans").select("id", { count: "exact", head: true })
        .eq("org_id", context.orgId).in("branch_id", branchIds)
        .is("returned_on", null).lt("due_on", new Date().toISOString().slice(0, 10))
      : Promise.resolve({ count: 0, error: null }),
    loadAdmissions(),
    loadExpenses(),
    loadLeave(),
    loadTransfers(),
  ]);
  if (libraryResult.error) throw new Error(`Could not load overdue library loans: ${libraryResult.error.message}`);
  const leaveStaffIds = Array.from(new Set(leaveRows.map((row) => row.staff_id)));
  const transferStudentIds = Array.from(new Set(transferRows.map((row) => row.student_id)));
  const [
    { data: leaveStaff, error: leaveStaffError },
    { data: transferStudents, error: transferStudentsError },
  ] = await Promise.all([
    leaveStaffIds.length
      ? supabase.from("education_staff").select("id, first_name, last_name").eq("org_id", context.orgId).in("id", leaveStaffIds)
      : { data: [], error: null },
    transferStudentIds.length
      ? supabase.from("education_students").select("id, first_name, last_name, student_number")
        .eq("org_id", context.orgId).in("branch_id", branchIds).in("id", transferStudentIds)
      : { data: [], error: null },
  ]);
  if (leaveStaffError) throw new Error(`Could not load staff names for pending leave requests: ${leaveStaffError.message}`);
  if (transferStudentsError) throw new Error(`Could not load student names for pending transfers: ${transferStudentsError.message}`);

  const staffById = new Map((leaveStaff ?? []).map((member) => [member.id, `${member.first_name} ${member.last_name}`]));
  const studentById = new Map((transferStudents ?? []).map((student) => [student.id, `${student.first_name} ${student.last_name} · ${student.student_number}`]));
  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const approvals = [
    ...(canReviewAdmissions ? [{
      label: "Admissions awaiting review",
      description: "Review pending and in-review student applications.",
      count: admissionRows.length,
      href: "/admissions",
      icon: GraduationCap,
      iconClass: "text-amber-700",
      items: admissionRows.map((row) => ({
        id: row.id,
        title: `${row.applicant_first_name} ${row.applicant_last_name} · ${row.application_number}`,
        detail: `${campusNameById.get(row.branch_id) ?? "Campus"} · Applied ${row.applied_at.slice(0, 10)}`,
      })),
    }] : []),
    ...(canReviewExpenses ? [{
      label: "Expenses awaiting approval",
      description: "Review pending campus expense records.",
      count: expenseRows.length,
      href: "/expenses?status=pending_approval",
      icon: Wallet,
      iconClass: "text-rose-700",
      items: expenseRows.map((row) => ({
        id: row.id,
        title: `${row.expense_number} · ${row.description}`,
        detail: `${campusNameById.get(row.branch_id) ?? "Campus"} · ${row.category} · ${row.vendor ?? "No vendor"} · ${row.amount} · ${row.expense_date}`,
      })),
    }] : []),
    ...(canReviewLeave ? [{
      label: "Staff leave awaiting approval",
      description: "Review pending staff leave requests.",
      count: leaveRows.length,
      href: "/staff/leave?status=pending",
      icon: Users,
      iconClass: "text-violet-700",
      items: leaveRows.map((row) => ({
        id: row.id,
        title: `${staffById.get(row.staff_id) ?? "Staff member"} · ${row.leave_type} leave`,
        detail: `${campusNameById.get(row.branch_id) ?? "Campus"} · ${row.starts_on} to ${row.ends_on} · ${row.reason}`,
      })),
    }] : []),
    ...(canReviewTransfers ? [{
      label: "Student transfers awaiting review",
      description: "Review transfers between campuses in your access scope.",
      count: transferRows.length,
      href: "/transfers",
      icon: ArrowRight,
      iconClass: "text-blue-700",
      items: transferRows.map((row) => ({
        id: row.id,
        title: studentById.get(row.student_id) ?? "Student record unavailable",
        detail: `${campusNameById.get(row.source_branch_id) ?? "Source campus"} → ${campusNameById.get(row.destination_branch_id) ?? "Destination campus"} · Effective ${row.effective_on} · ${row.reason}`,
      })),
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
      <div className="space-y-3">
        {approvals.map(({ label, description, count, href, icon: Icon, iconClass, items }) => <details
          key={label}
          className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 transition hover:bg-blue-50/40 [&::-webkit-details-marker]:hidden">
            <span>
              <span className="flex items-center gap-2 font-semibold text-slate-950"><Icon className={`h-5 w-5 ${iconClass}`} />{label}</span>
              <span className="mt-1 block text-sm text-slate-600">{description}</span>
            </span>
            <span className="flex shrink-0 items-center gap-3">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-lg font-bold tabular-nums text-slate-800">{count.toLocaleString()}</span>
              <ChevronDown className="h-5 w-5 text-slate-500 transition-transform group-open:rotate-180" />
            </span>
          </summary>
          <div className="border-t border-slate-200 p-4">
            {items.length > 0 ? <ul className="divide-y divide-slate-100">
              {items.map((item) => <li key={item.id} className="py-3 first:pt-0 last:pb-0">
                <p className="font-medium text-slate-900">{item.title}</p>
                <p className="mt-1 text-sm text-slate-600">{item.detail}</p>
              </li>)}
            </ul> : <p className="text-sm text-slate-600">There are no items awaiting review in this queue.</p>}
            <Link href={getProductAppPath("think-education", href)} className="mt-4 inline-flex rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">
              Open {label.toLowerCase()} page
            </Link>
          </div>
        </details>)}
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
