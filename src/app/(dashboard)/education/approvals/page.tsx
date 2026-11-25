import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen, ChevronDown, GraduationCap, Users, Wallet, type LucideIcon } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import {
  decideEducationStaffLeaveRequest,
  reviewEducationExpense,
  transitionEducationStudentTransfer,
  updateEducationAdmissionStatus,
} from "../actions";

const APPROVALS_PAGE_SIZE = 500;
type ApprovalKind = "admissions" | "expenses" | "leave" | "transfers";
type ApprovalItem = {
  id: string;
  title: string;
  detail: string;
  status?: string;
  hasActiveOffer?: boolean;
};
type ApprovalQueue = {
  kind: ApprovalKind;
  label: string;
  description: string;
  count: number;
  icon: LucideIcon;
  iconClass: string;
  items: ApprovalItem[];
};
type SearchParams = Record<string, string | string[] | undefined>;

function getParam(params: SearchParams, key: string): string {
  return typeof params[key] === "string" ? params[key] as string : "";
}

export default async function EducationApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  const params = await searchParams;

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
    status: string;
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
    requested_by: string;
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
        .select("id, branch_id, application_number, applicant_first_name, applicant_last_name, status, applied_at")
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
        .select("id, branch_id, staff_id, leave_type, starts_on, ends_on, reason, requested_by, created_at")
        .eq("org_id", context.orgId).in("branch_id", branchIds).eq("status", "pending")
        .neq("requested_by", context.userId)
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
      ? supabase.from("education_library_loans")
        .select("id, branch_id, copy_id, student_id, due_on", { count: "exact" })
        .eq("org_id", context.orgId).in("branch_id", branchIds)
        .is("returned_on", null).lt("due_on", new Date().toISOString().slice(0, 10))
        .order("due_on").order("id").limit(APPROVALS_PAGE_SIZE)
      : Promise.resolve({ data: [], count: 0, error: null }),
    loadAdmissions(),
    loadExpenses(),
    loadLeave(),
    loadTransfers(),
  ]);
  if (libraryResult.error) throw new Error(`Could not load overdue library loans: ${libraryResult.error.message}`);
  const admissionIds = admissionRows.map((row) => row.id);
  const today = new Date().toISOString().slice(0, 10);
  const { data: activeAdmissionOffers, error: offersError } = admissionIds.length
    ? await supabase.from("education_admission_offers").select("admission_id")
      .eq("org_id", context.orgId).in("admission_id", admissionIds)
      .eq("status", "offered").gte("expires_on", today)
    : { data: [], error: null };
  if (offersError) throw new Error(`Could not load active admission offers: ${offersError.message}`);
  const activeOfferAdmissionIds = new Set((activeAdmissionOffers ?? []).map((offer) => offer.admission_id));
  const overdueLoans = libraryResult.data ?? [];
  const overdueStudentIds = Array.from(new Set(overdueLoans.map((loan) => loan.student_id)));
  const overdueCopyIds = Array.from(new Set(overdueLoans.map((loan) => loan.copy_id)));
  const [
    { data: overdueStudents, error: overdueStudentsError },
    { data: overdueCopies, error: overdueCopiesError },
  ] = await Promise.all([
    overdueStudentIds.length
      ? supabase.from("education_students").select("id, first_name, last_name")
        .eq("org_id", context.orgId).in("branch_id", branchIds).in("id", overdueStudentIds)
      : { data: [], error: null },
    overdueCopyIds.length
      ? supabase.from("education_library_copies").select("id, book_id")
        .eq("org_id", context.orgId).in("branch_id", branchIds).in("id", overdueCopyIds)
      : { data: [], error: null },
  ]);
  if (overdueStudentsError) throw new Error(`Could not load overdue library borrowers: ${overdueStudentsError.message}`);
  if (overdueCopiesError) throw new Error(`Could not load overdue library book copies: ${overdueCopiesError.message}`);
  const overdueBookIds = Array.from(new Set((overdueCopies ?? []).map((copy) => copy.book_id)));
  const { data: overdueBooks, error: overdueBooksError } = overdueBookIds.length
    ? await supabase.from("education_library_books").select("id, title")
      .eq("org_id", context.orgId).in("branch_id", branchIds).in("id", overdueBookIds)
    : { data: [], error: null };
  if (overdueBooksError) throw new Error(`Could not load overdue library book titles: ${overdueBooksError.message}`);
  const overdueStudentById = new Map((overdueStudents ?? []).map((student) => [student.id, `${student.first_name} ${student.last_name}`.trim()]));
  const overdueBookById = new Map((overdueBooks ?? []).map((book) => [book.id, book.title]));
  const overdueBookIdByCopyId = new Map((overdueCopies ?? []).map((copy) => [copy.id, copy.book_id]));
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
  const approvals: ApprovalQueue[] = [
    ...(canReviewAdmissions ? [{
      kind: "admissions" as const,
      label: "Admissions awaiting review",
      description: "Review pending and in-review student applications.",
      count: admissionRows.length,
      icon: GraduationCap,
      iconClass: "text-amber-700",
      items: admissionRows.map((row) => ({
        id: row.id,
        title: `${row.applicant_first_name} ${row.applicant_last_name} · ${row.application_number}`,
        detail: `${campusNameById.get(row.branch_id) ?? "Campus"} · Applied ${row.applied_at.slice(0, 10)}`,
        status: row.status,
        hasActiveOffer: activeOfferAdmissionIds.has(row.id),
      })),
    }] : []),
    ...(canReviewExpenses ? [{
      kind: "expenses" as const,
      label: "Expenses awaiting approval",
      description: "Review pending campus expense records.",
      count: expenseRows.length,
      icon: Wallet,
      iconClass: "text-rose-700",
      items: expenseRows.map((row) => ({
        id: row.id,
        title: `${row.expense_number} · ${row.description}`,
        detail: `${campusNameById.get(row.branch_id) ?? "Campus"} · ${row.category} · ${row.vendor ?? "No vendor"} · ${row.amount} · ${row.expense_date}`,
      })),
    }] : []),
    ...(canReviewLeave ? [{
      kind: "leave" as const,
      label: "Staff leave awaiting approval",
      description: "Review pending staff leave requests.",
      count: leaveRows.length,
      icon: Users,
      iconClass: "text-violet-700",
      items: leaveRows.map((row) => ({
        id: row.id,
        title: `${staffById.get(row.staff_id) ?? "Staff member"} · ${row.leave_type} leave`,
        detail: `${campusNameById.get(row.branch_id) ?? "Campus"} · ${row.starts_on} to ${row.ends_on} · ${row.reason}`,
      })),
    }] : []),
    ...(canReviewTransfers ? [{
      kind: "transfers" as const,
      label: "Student transfers awaiting review",
      description: "Review transfers between campuses in your access scope.",
      count: transferRows.length,
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
    icon: BookOpen,
    items: overdueLoans.map((loan) => ({
      id: loan.id,
      title: `${overdueBookById.get(overdueBookIdByCopyId.get(loan.copy_id) ?? "") ?? "Book unavailable"} · ${overdueStudentById.get(loan.student_id) ?? "Borrower unavailable"}`,
      detail: `${campusNameById.get(loan.branch_id) ?? "Campus"} · Due ${loan.due_on}`,
    })),
  }] : [];
  const successMessage = getParam(params, "reviewed") === "approved"
    ? "Expense approved."
    : getParam(params, "reviewed") === "rejected"
      ? "Expense rejected with a recorded reason."
      : getParam(params, "updated") === "1"
        ? "Approval decision saved."
        : null;
  const actionError = getParam(params, "error");
  const approvalErrorMessages: Record<string, string> = {
    invalid: "Check the decision and any required reason, then try again.",
    transition: "This item has already been decided or is no longer available.",
    "not-found": "The approval item could not be found.",
    "accounting-mapping": "Configure the required account mappings before approving this expense.",
    "accounting-period": "The expense date is outside an open accounting period.",
    overlap: "The leave request overlaps another pending or approved leave request.",
    permission: "You are not authorized to decide this request.",
    save: "The decision could not be saved. Please try again.",
    offer: "An active offer is required before an application can be admitted.",
    "student-number": "The student number is already in use, or this applicant is already enrolled.",
    capacity: "The selected class has reached capacity.",
    class: "The selected class is no longer active at this campus.",
  };
  const errorMessage = approvalErrorMessages[actionError] ?? null;

  return <main className="mx-auto max-w-[1200px] space-y-5 p-4 md:p-6">
    <header>
      <Link href={getProductAppPath("think-education", "/dashboard")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-950">Approvals &amp; attention</h1>
      <p className="mt-1 text-sm text-slate-600">Pending decisions and follow-up items across your assigned campuses.</p>
    </header>

    {successMessage && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{successMessage}</p>}
    {errorMessage && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{errorMessage}</p>}

    {approvals.length > 0 && <section className="space-y-3">
      <h2 className="text-lg font-semibold text-slate-950">Approvals</h2>
      <div className="space-y-3">
        {approvals.map(({ kind, label, description, count, icon: Icon, iconClass, items }) => <details
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
                {kind === "admissions" && item.status === "pending" && <form action={updateEducationAdmissionStatus} className="mt-3">
                  <input type="hidden" name="admission_id" value={item.id} />
                  <input type="hidden" name="status" value="under_review" />
                  <input type="hidden" name="return_to" value="approvals" />
                  <button type="submit" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Start review</button>
                </form>}
                {kind === "admissions" && item.status === "under_review" && <div className="mt-3 flex flex-wrap items-end gap-2">
                  {item.hasActiveOffer && <form action={updateEducationAdmissionStatus}>
                    <input type="hidden" name="admission_id" value={item.id} />
                    <input type="hidden" name="status" value="admitted" />
                    <input type="hidden" name="return_to" value="approvals" />
                    <button type="submit" className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800">Accept offer and admit</button>
                  </form>}
                  {!item.hasActiveOffer && <p className="text-sm text-slate-500">Record an active offer before admitting this applicant.</p>}
                  <form action={updateEducationAdmissionStatus} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="admission_id" value={item.id} />
                    <input type="hidden" name="status" value="rejected" />
                    <input type="hidden" name="return_to" value="approvals" />
                    <label className="text-xs font-medium text-slate-600">Rejection reason
                      <input required name="decision_note" maxLength={1000} className="mt-1 block w-56 rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
                    </label>
                    <button type="submit" className="rounded-lg border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">Reject</button>
                  </form>
                </div>}
                {kind === "expenses" && <div className="mt-3 flex flex-wrap items-end gap-2">
                  <form action={reviewEducationExpense}>
                    <input type="hidden" name="expense_id" value={item.id} />
                    <input type="hidden" name="decision" value="approved" />
                    <input type="hidden" name="return_to" value="approvals" />
                    <button type="submit" className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800">Approve</button>
                  </form>
                  <form action={reviewEducationExpense} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="expense_id" value={item.id} />
                    <input type="hidden" name="decision" value="rejected" />
                    <input type="hidden" name="return_to" value="approvals" />
                    <label className="text-xs font-medium text-slate-600">Rejection reason
                      <input required name="reason" minLength={3} maxLength={500} className="mt-1 block w-56 rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
                    </label>
                    <button type="submit" className="rounded-lg border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">Reject</button>
                  </form>
                </div>}
                {kind === "leave" && <div className="mt-3 flex flex-wrap items-end gap-2">
                  <form action={decideEducationStaffLeaveRequest}>
                    <input type="hidden" name="request_id" value={item.id} />
                    <input type="hidden" name="decision" value="approved" />
                    <input type="hidden" name="return_to" value="approvals" />
                    <button type="submit" className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800">Approve</button>
                  </form>
                  <form action={decideEducationStaffLeaveRequest} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="request_id" value={item.id} />
                    <input type="hidden" name="decision" value="rejected" />
                    <input type="hidden" name="return_to" value="approvals" />
                    <label className="text-xs font-medium text-slate-600">Rejection reason
                      <input required name="decision_note" maxLength={1000} className="mt-1 block w-56 rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
                    </label>
                    <button type="submit" className="rounded-lg border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">Reject</button>
                  </form>
                </div>}
                {kind === "transfers" && <div className="mt-3 flex flex-wrap gap-2">
                  <form action={transitionEducationStudentTransfer}>
                    <input type="hidden" name="transfer_id" value={item.id} />
                    <input type="hidden" name="status" value="approved" />
                    <input type="hidden" name="return_to" value="approvals" />
                    <button type="submit" className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800">Approve</button>
                  </form>
                  <form action={transitionEducationStudentTransfer}>
                    <input type="hidden" name="transfer_id" value={item.id} />
                    <input type="hidden" name="status" value="rejected" />
                    <input type="hidden" name="return_to" value="approvals" />
                    <button type="submit" className="rounded-lg border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">Reject</button>
                  </form>
                </div>}
              </li>)}
            </ul> : <p className="text-sm text-slate-600">There are no items awaiting review in this queue.</p>}
          </div>
        </details>)}
      </div>
    </section>}

    {followUps.length > 0 && <section className="space-y-3">
      <h2 className="text-lg font-semibold text-slate-950">Follow-up</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {followUps.map(({ label, description, count, items, icon: Icon }) => <details
          key={label}
          className="group overflow-hidden rounded-xl border border-rose-200 bg-rose-50 shadow-sm"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 transition hover:bg-rose-100 [&::-webkit-details-marker]:hidden">
            <span>
              <span className="flex items-center gap-2 font-semibold text-rose-950"><Icon className="h-5 w-5" />{label}</span>
              <span className="mt-1 block text-sm text-rose-800">{description}</span>
            </span>
            <span className="flex shrink-0 items-center gap-3">
              <span className="rounded-full bg-white/70 px-3 py-1 text-lg font-bold tabular-nums text-rose-900">{count.toLocaleString()}</span>
              <ChevronDown className="h-5 w-5 text-rose-800 transition-transform group-open:rotate-180" />
            </span>
          </summary>
          <div className="border-t border-rose-200 p-4">
            {items.length > 0 ? <ul className="divide-y divide-rose-100">
              {items.map((item) => <li key={item.id} className="py-3 first:pt-0 last:pb-0">
                <p className="font-medium text-rose-950">{item.title}</p>
                <p className="mt-1 text-sm text-rose-800">{item.detail}</p>
              </li>)}
              {count > items.length && <li className="pt-3 text-sm text-rose-800">Showing {items.length} of {count.toLocaleString()} overdue loans.</li>}
            </ul> : <p className="text-sm text-rose-800">There are no overdue loans.</p>}
          </div>
        </details>)}
      </div>
    </section>}

    {approvals.length === 0 && followUps.length === 0 && <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
      There are no approval or follow-up queues available for your campus access.
    </p>}
  </main>;
}
