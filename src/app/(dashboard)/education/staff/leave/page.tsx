import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, CheckCircle2, Clock3, Users } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import { createEducationStaffLeaveRequest, decideEducationStaffLeaveRequest } from "../../actions";

const PAGE_SIZE = 50;
const MAX_FORM_STAFF = 500;
const LEAVE_TYPES = [
  ["annual", "Annual"],
  ["sick", "Sick"],
  ["personal", "Personal"],
  ["maternity", "Maternity"],
  ["paternity", "Paternity"],
  ["unpaid", "Unpaid"],
  ["other", "Other"],
] as const;
const STATUSES = ["pending", "approved", "rejected", "cancelled"] as const;
type LeaveStatus = typeof STATUSES[number];
type SearchParams = Record<string, string | string[] | undefined>;

function getParam(params: SearchParams, key: string): string {
  return typeof params[key] === "string" ? params[key] as string : "";
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function EducationStaffLeavePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_staff", "staff", "leave", "view")) {
    redirect("/dashboard?accessDenied=think-education.staff-leave");
  }

  const params = await searchParams;
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const campusIds = campuses.map((campus) => campus.id);
  const requestedBranch = getParam(params, "branch");
  const branchId = campusIds.includes(requestedBranch) ? requestedBranch : "";
  const requestedStatus = getParam(params, "status");
  const status = (STATUSES.includes(requestedStatus as LeaveStatus) ? requestedStatus : "") as LeaveStatus | "";
  const parsedPage = Number.parseInt(getParam(params, "page"), 10);
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? Math.min(parsedPage, 2001) : 1;
  const [canCreate, canApprove] = await Promise.all([
    canTabPermission("education_staff", "staff", "leave", "create"),
    canTabPermission("education_staff", "staff", "leave", "approve"),
  ]);
  const supabase = await createClient();
  const branchIds = branchId ? [branchId] : campusIds;
  let requests: Array<{
    id: string;
    branch_id: string;
    staff_id: string;
    leave_type: string;
    starts_on: string;
    ends_on: string;
    reason: string;
    status: LeaveStatus;
    requested_by: string;
    decided_by: string | null;
    decided_at: string | null;
    decision_note: string | null;
    created_at: string;
  }> = [];
  let totalCount = 0;
  if (branchIds.length) {
    let query = supabase.from("education_staff_leave_requests")
      .select("id, branch_id, staff_id, leave_type, starts_on, ends_on, reason, status, requested_by, decided_by, decided_at, decision_note, created_at", { count: "exact" })
      .eq("org_id", context.orgId).in("branch_id", branchIds)
      .order("created_at", { ascending: false });
    if (status) query = query.eq("status", status);
    const { data, count, error } = await query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    if (error) throw new Error(`Could not load Think Education staff leave requests: ${error.message}`);
    requests = data ?? [];
    totalCount = count ?? 0;
  }

  const staffIds = Array.from(new Set([
    ...requests.map((request) => request.staff_id),
  ]));
  const staffById = new Map<string, { first_name: string; last_name: string; staff_number: string; branch_id: string }>();
  const formStaffByCampus = new Map<string, Array<{ id: string; first_name: string; last_name: string; staff_number: string }>>();
  if (canCreate && campusIds.length) {
    const { data, count, error } = await supabase.from("education_staff")
      .select("id, branch_id, first_name, last_name, staff_number", { count: "exact" })
      .eq("org_id", context.orgId).in("branch_id", campusIds).eq("status", "active")
      .order("last_name").order("first_name").limit(MAX_FORM_STAFF);
    if (error) throw new Error(`Could not load staff for leave requests: ${error.message}`);
    if ((count ?? 0) > MAX_FORM_STAFF) {
      throw new Error("More than 500 active staff are available for leave requests. Narrow your campus assignment before continuing.");
    }
    for (const member of data ?? []) {
      formStaffByCampus.set(member.branch_id, [...(formStaffByCampus.get(member.branch_id) ?? []), member]);
      if (staffIds.includes(member.id)) {
        staffById.set(member.id, member);
      }
    }
  }
  const missingStaffIds = staffIds.filter((id) => !staffById.has(id));
  if (missingStaffIds.length) {
    const { data, error } = await supabase.from("education_staff")
      .select("id, branch_id, first_name, last_name, staff_number")
      .eq("org_id", context.orgId).in("id", missingStaffIds);
    if (error) throw new Error(`Could not resolve staff leave records: ${error.message}`);
    for (const member of data ?? []) staffById.set(member.id, member);
  }

  const actorIds = Array.from(new Set(requests.flatMap((request) =>
    [request.requested_by, request.decided_by].filter((id): id is string => Boolean(id))
  )));
  const actorsResult = actorIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", actorIds)
    : { data: [], error: null };
  if (actorsResult.error) throw new Error(`Could not resolve leave requestors: ${actorsResult.error.message}`);
  const actorNameById = new Map((actorsResult.data ?? []).map((profile) => [profile.id, profile.full_name]));
  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const csvRows = [
    ["Staff number", "Staff name", "Campus", "Leave type", "Start date", "End date", "Status", "Requested by", "Decision note"],
    ...requests.map((request) => {
      const staffMember = staffById.get(request.staff_id);
      return [
        staffMember?.staff_number ?? "",
        staffMember ? `${staffMember.first_name} ${staffMember.last_name}` : "",
        campusNameById.get(request.branch_id) ?? request.branch_id,
        label(request.leave_type),
        request.starts_on,
        request.ends_on,
        label(request.status),
        actorNameById.get(request.requested_by) ?? request.requested_by,
        request.decision_note ?? "",
      ];
    }),
  ];
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(csvRows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n"))}`;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const pageHref = (nextPage: number) => {
    const query = new URLSearchParams({ page: String(nextPage) });
    if (branchId) query.set("branch", branchId);
    if (status) query.set("status", status);
    return `${getProductAppPath("think-education", "/staff/leave")}?${query.toString()}`;
  };
  if (page > totalPages) redirect(pageHref(totalPages));

  const errorMessage = getParam(params, "error") === "invalid"
    ? "Check the leave type, dates, and reason."
    : getParam(params, "error") === "overlap"
      ? "The dates overlap another pending or approved leave request."
      : getParam(params, "error") === "staff"
        ? "The staff member is unavailable at that campus."
        : getParam(params, "error") === "permission"
          ? "You are not authorized to decide that request."
          : getParam(params, "error") === "transition"
            ? "That request has already been decided or is no longer available."
            : getParam(params, "error") === "save"
              ? "The leave request could not be saved. Please try again."
              : null;

  return <main className="mx-auto max-w-[1400px] space-y-5 p-4 md:p-6">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <Link href={getProductAppPath("think-education", "/staff")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
          <ArrowLeft className="h-4 w-4" /> Staff Management
        </Link>
        <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold text-slate-950"><CalendarDays className="h-6 w-6 text-blue-700" /> Staff Leave Management</h1>
        <p className="mt-1 text-sm text-slate-600">Submit, review, and audit leave requests for your assigned campuses.</p>
      </div>
      {requests.length > 0 && <a href={csvHref} download={`education-staff-leave-${new Date().toISOString().slice(0, 10)}.csv`} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Export CSV</a>}
    </header>

    {getParam(params, "created") === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Leave request submitted.</p>}
    {getParam(params, "updated") === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Leave request decision saved.</p>}
    {errorMessage && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{errorMessage}</p>}

    {canCreate && <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-slate-950">Submit a leave request</h2>
      <p className="mt-1 text-sm text-slate-500">Choose an active staff member at the campus where they are assigned. Requests overlapping pending or approved leave are rejected.</p>
      {!campuses.length ? <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">You need an assigned campus before submitting leave requests.</p>
        : campuses.map((campus) => {
          const campusStaff = formStaffByCampus.get(campus.id) ?? [];
          return <form key={campus.id} action={createEducationStaffLeaveRequest} className="mt-4 grid gap-3 rounded-lg border border-slate-100 p-4 md:grid-cols-3">
            <input type="hidden" name="branch_id" value={campus.id} />
            <p className="md:col-span-3 text-sm font-semibold text-slate-800">{campus.name}</p>
            {!campusStaff.length ? <p className="md:col-span-3 text-sm text-slate-500">No active staff at this campus.</p> : <>
              <label className="text-sm font-medium text-slate-700">Staff member
                <select required name="staff_id" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
                  {campusStaff.map((member) => <option key={member.id} value={member.id}>{member.staff_number} · {member.first_name} {member.last_name}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">Leave type
                <select required name="leave_type" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
                  {LEAVE_TYPES.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-sm font-medium text-slate-700">Start date
                  <input required type="date" name="starts_on" defaultValue={new Date().toISOString().slice(0, 10)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
                </label>
                <label className="text-sm font-medium text-slate-700">End date
                  <input required type="date" name="ends_on" defaultValue={new Date().toISOString().slice(0, 10)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
                </label>
              </div>
              <label className="text-sm font-medium text-slate-700 md:col-span-2">Reason
                <textarea required name="reason" maxLength={2000} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
              </label>
              <div className="flex items-end"><button type="submit" className="w-full rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Submit request</button></div>
            </>}
          </form>;
        })}
    </section>}

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <form method="get" action={getProductAppPath("think-education", "/staff/leave")} className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-[1fr_1fr_auto]">
        <label className="text-sm font-medium text-slate-700">Campus
          <select name="branch" defaultValue={branchId} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">All assigned campuses</option>{campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Status
          <select name="status" defaultValue={status} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">All statuses</option>{STATUSES.map((value) => <option key={value} value={value}>{label(value)}</option>)}
          </select>
        </label>
        <div className="flex items-end"><button type="submit" className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Apply filters</button></div>
      </form>

      <div className="flex items-center justify-between border-b border-slate-100 p-4">
        <div><h2 className="font-semibold text-slate-950">Leave requests</h2><p className="mt-1 text-sm text-slate-500">{totalCount.toLocaleString()} matching records · newest first</p></div>
        <span className="inline-flex items-center gap-1 text-sm text-slate-500"><Clock3 className="h-4 w-4" /> Page {page} of {totalPages}</span>
      </div>
      {!requests.length ? <p className="p-8 text-center text-sm text-slate-500">No leave requests match these filters.</p>
        : <ul className="divide-y divide-slate-100">
          {requests.map((request) => {
            const staffMember = staffById.get(request.staff_id);
            const canDecide = canApprove && request.status === "pending" && request.requested_by !== context.userId;
            return <li key={request.id} className="space-y-3 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-950">{staffMember ? `${staffMember.first_name} ${staffMember.last_name}` : "Staff member"}</h3>
                  <p className="mt-1 text-sm text-slate-600">{staffMember?.staff_number ?? ""} · {campusNameById.get(request.branch_id) ?? "Campus"} · {label(request.leave_type)}</p>
                  <p className="mt-1 text-sm text-slate-700">{request.starts_on} – {request.ends_on}</p>
                </div>
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${request.status === "approved" ? "bg-emerald-50 text-emerald-800" : request.status === "rejected" ? "bg-rose-50 text-rose-800" : request.status === "pending" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}`}>
                  {request.status === "approved" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}{label(request.status)}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-slate-700">{request.reason}</p>
              <p className="text-xs text-slate-500">Submitted by {actorNameById.get(request.requested_by) ?? "Staff"} · {new Date(request.created_at).toLocaleString()}</p>
              {request.decision_note && <p className="text-sm text-slate-600">Decision note: {request.decision_note}</p>}
              {canDecide && <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
                <form action={decideEducationStaffLeaveRequest}>
                  <input type="hidden" name="request_id" value={request.id} />
                  <input type="hidden" name="decision" value="approved" />
                  <button type="submit" className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800">Approve</button>
                </form>
                <form action={decideEducationStaffLeaveRequest} className="flex min-w-[min(100%,360px)] flex-1 gap-2">
                  <input type="hidden" name="request_id" value={request.id} />
                  <input type="hidden" name="decision" value="rejected" />
                  <label className="sr-only" htmlFor={`decision-${request.id}`}>Rejection reason</label>
                  <input required name="decision_note" id={`decision-${request.id}`} maxLength={1000} placeholder="Reason for rejection" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  <button type="submit" className="rounded-lg border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">Reject</button>
                </form>
              </div>}
            </li>;
          })}
        </ul>}
      {totalPages > 1 && <nav aria-label="Leave request pages" className="flex items-center justify-between border-t border-slate-100 p-4">
        {page > 1 ? <Link href={pageHref(page - 1)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Previous</Link> : <span />}
        {page < totalPages ? <Link href={pageHref(page + 1)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Next</Link> : <span />}
      </nav>}
    </section>
  </main>;
}
