import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, LifeBuoy, MessageSquare } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import {
  addEducationSupportResponse,
  createEducationSupportRequest,
  updateEducationSupportRequest,
} from "../actions";

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  return typeof params[key] === "string" ? params[key] as string : "";
}

type SupportRequestRow = {
  request_id: string;
  branch_id: string;
  student_id: string | null;
  requester_name: string;
  request_kind: "helpdesk" | "complaint";
  category: string;
  priority: "low" | "normal" | "high" | "urgent";
  subject: string;
  description: string;
  status: "open" | "in_progress" | "waiting" | "resolved" | "closed";
  assigned_staff_id: string | null;
  resolution_note: string | null;
  resolved_at: string | null;
  created_at: string;
};

export default async function EducationSupportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  const [canView, canCreate, canEdit] = await Promise.all([
    canTabPermission("education_support", "support", "requests", "view"),
    canTabPermission("education_support", "support", "requests", "create"),
    canTabPermission("education_support", "support", "requests", "edit"),
  ]);
  if (!canView) redirect("/dashboard?accessDenied=think-education.support");

  const params = await searchParams;
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const branchIds = campuses.map((campus) => campus.id);
  const requestedBranch = getParam(params, "branch");
  const branchId = branchIds.includes(requestedBranch) ? requestedBranch : "";
  const selectedBranchIds = branchId ? [branchId] : branchIds;
  const requestedKind = getParam(params, "kind");
  const kind = ["helpdesk", "complaint"].includes(requestedKind) ? requestedKind as "helpdesk" | "complaint" : null;
  const requestedStatus = getParam(params, "status");
  const status = ["open", "in_progress", "waiting", "resolved", "closed"].includes(requestedStatus)
    ? requestedStatus as "open" | "in_progress" | "waiting" | "resolved" | "closed"
    : null;
  const search = getParam(params, "search").trim().slice(0, 100);
  const supabase = await createClient();

  let requests: SupportRequestRow[] = [];
  if (selectedBranchIds.length) {
    const { data, error } = await supabase.rpc("education_get_support_requests", {
      p_org_id: context.orgId,
      p_branch_ids: selectedBranchIds,
      p_request_kind: kind,
      p_status: status,
      p_search: search || null,
    });
    if (error) throw new Error(`Could not load support requests: ${error.message}`);
    requests = (data ?? []) as SupportRequestRow[];
  }

  const [{ data: staff }, { data: students }] = await Promise.all([
    selectedBranchIds.length
      ? supabase.from("education_staff")
        .select("id, branch_id, first_name, last_name")
        .eq("org_id", context.orgId).in("branch_id", selectedBranchIds).eq("status", "active")
        .order("last_name").order("first_name").limit(500)
      : Promise.resolve({ data: [], error: null }),
    selectedBranchIds.length
      ? supabase.from("education_students")
        .select("id, branch_id, student_number, first_name, last_name")
        .eq("org_id", context.orgId).in("branch_id", selectedBranchIds).eq("status", "active")
        .order("last_name").order("first_name").limit(500)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const staffById = new Map((staff ?? []).map((member) => [member.id, `${member.first_name} ${member.last_name}`]));
  const studentById = new Map((students ?? []).map((student) => [student.id, `${student.first_name} ${student.last_name} (${student.student_number})`]));
  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));

  const responseData = await Promise.all(requests.map(async (request) => {
    const { data, error } = await supabase.rpc("education_get_support_responses", {
      p_org_id: context.orgId,
      p_request_id: request.request_id,
    });
    if (error) throw new Error(`Could not load support responses: ${error.message}`);
    return [request.request_id, data ?? []] as const;
  }));
  const responsesByRequest = new Map(responseData);

  return <main className="mx-auto max-w-[1500px] space-y-6 p-4 md:p-6">
    <header>
      <Link href={getProductAppPath("think-education", "/dashboard")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>
      <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold text-slate-950"><LifeBuoy className="h-6 w-6 text-blue-700" /> Helpdesk & complaints</h1>
      <p className="mt-1 text-sm text-slate-600">Track staff and family issues, assignments, responses, and resolutions.</p>
    </header>

    {params.created === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">Support request created.</p>}
    {params.updated === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">Support request updated.</p>}
    {params.responded === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">Response added.</p>}
    {params.error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">The support request could not be saved.</p>}

    <form method="get" className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-5">
      <label className="text-sm font-medium text-slate-700">Campus
        <select name="branch" defaultValue={branchId} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
          <option value="">All campuses</option>
          {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium text-slate-700">Type
        <select name="kind" defaultValue={kind ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
          <option value="">Helpdesk & complaints</option>
          <option value="helpdesk">Helpdesk</option>
          <option value="complaint">Complaint</option>
        </select>
      </label>
      <label className="text-sm font-medium text-slate-700">Status
        <select name="status" defaultValue={status ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
          <option value="">All statuses</option>
          {["open", "in_progress", "waiting", "resolved", "closed"].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium text-slate-700">Search
        <input name="search" defaultValue={search} maxLength={100} placeholder="Requester or subject" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
      </label>
      <div className="flex items-end">
        <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Apply filters</button>
      </div>
    </form>

    {canCreate && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-slate-950">Create support request</h2>
      <form action={createEducationSupportRequest} className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">Campus
          <select name="branch_id" required defaultValue={branchId || selectedBranchIds[0] || ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            {selectedBranchIds.map((campusId) => <option key={campusId} value={campusId}>{campusNameById.get(campusId) ?? "Campus"}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Requester name
          <input name="requester_name" required maxLength={160} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Request type
          <select name="request_kind" required defaultValue="helpdesk" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="helpdesk">Helpdesk</option>
            <option value="complaint">Complaint</option>
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Category
          <input name="category" required maxLength={80} placeholder="ICT, administration, transport…" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Priority
          <select name="priority" required defaultValue="normal" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            {["low", "normal", "high", "urgent"].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Linked student
          <select name="student_id" defaultValue="" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">Not linked</option>
            {(students ?? []).map((student) => <option key={student.id} value={student.id}>{student.first_name} {student.last_name} · {student.student_number}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700 md:col-span-2">Subject
          <input name="subject" required maxLength={160} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700 md:col-span-2">Description
          <textarea name="description" required maxLength={5000} rows={4} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <div className="md:col-span-2">
          <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Create request</button>
        </div>
      </form>
    </section>}

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-4">
        <h2 className="font-semibold text-slate-950">Support requests</h2>
      </div>
      {requests.length === 0
        ? <p className="p-6 text-sm text-slate-500">No support requests match these filters.</p>
        : <div className="divide-y divide-slate-100">
          {requests.map((request) => {
            const responses = (responsesByRequest.get(request.request_id) ?? []) as Array<{
              response_id: string;
              message: string;
              author_user_id: string | null;
              is_internal: boolean;
              created_at: string;
            }>;
            return <article key={request.request_id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{campusNameById.get(request.branch_id) ?? "Campus"} · {request.request_kind}</p>
                  <h3 className="mt-1 font-semibold text-slate-950">{request.subject}</h3>
                  <p className="mt-1 text-sm text-slate-600">{request.requester_name} · {request.category} · {new Date(request.created_at).toLocaleString()}</p>
                  {request.student_id && <p className="mt-1 text-xs text-slate-500">Student: {studentById.get(request.student_id) ?? request.student_id}</p>}
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${request.priority === "urgent" ? "bg-rose-50 text-rose-800" : request.priority === "high" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-700"}`}>{request.priority} · {request.status.replaceAll("_", " ")}</span>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{request.description}</p>
              {request.resolution_note && <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"><strong>Resolution:</strong> {request.resolution_note}</p>}

              {responses.length > 0 && <div className="mt-4 space-y-2">
                {responses.map((response) => <div key={response.response_id} className={`rounded-lg border p-3 text-sm ${response.is_internal ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
                  {response.is_internal && <p className="mb-1 text-xs font-semibold uppercase text-amber-700">Internal staff note</p>}
                  <p className="whitespace-pre-wrap text-slate-700">{response.message}</p>
                  <p className="mt-1 text-xs text-slate-500">{new Date(response.created_at).toLocaleString()}</p>
                </div>)}
              </div>}

              {canEdit && <form action={updateEducationSupportRequest} className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-3">
                <input type="hidden" name="request_id" value={request.request_id} />
                <label className="text-sm font-medium text-slate-700">Status
                  <select name="status" defaultValue={request.status} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal">
                    {["open", "in_progress", "waiting", "resolved", "closed"].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}
                  </select>
                </label>
                <label className="text-sm font-medium text-slate-700">Assigned staff
                  <select name="assigned_staff_id" defaultValue={request.assigned_staff_id ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal">
                    <option value="">Unassigned</option>
                    {(staff ?? []).map((member) => <option key={member.id} value={member.id}>{member.first_name} {member.last_name}</option>)}
                  </select>
                </label>
                <label className="text-sm font-medium text-slate-700 md:col-span-3">Resolution note
                  <textarea name="resolution_note" maxLength={5000} rows={2} defaultValue={request.resolution_note ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal" />
                </label>
                <div className="md:col-span-3">
                  <button type="submit" className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-800">Update request</button>
                </div>
              </form>}

              {canEdit && <form action={addEducationSupportResponse} className="mt-3 flex flex-wrap items-end gap-2">
                <input type="hidden" name="request_id" value={request.request_id} />
                <label className="min-w-64 flex-1 text-sm font-medium text-slate-700">Response
                  <textarea name="message" required maxLength={5000} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
                </label>
                <label className="text-xs font-medium text-slate-600">
                  <input type="checkbox" name="is_internal" value="true" className="mr-1" />
                  Internal staff note
                </label>
                <button type="submit" className="inline-flex items-center gap-1 rounded-lg border border-blue-300 px-3 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-50"><MessageSquare className="h-3.5 w-3.5" />Add response</button>
              </form>}
            </article>;
          })}
        </div>}
    </section>
  </main>;
}
