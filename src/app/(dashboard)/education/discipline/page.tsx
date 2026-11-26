import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import {
  createEducationDisciplineIncident,
  reviewEducationDisciplineIncident,
} from "../actions";

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  return typeof params[key] === "string" ? params[key] as string : "";
}

export default async function EducationDisciplinePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  const [canView, canCreate, canEdit, canApprove] = await Promise.all([
    canTabPermission("education_discipline", "discipline", "incidents", "view"),
    canTabPermission("education_discipline", "discipline", "incidents", "create"),
    canTabPermission("education_discipline", "discipline", "incidents", "edit"),
    canTabPermission("education_discipline", "discipline", "incidents", "approve"),
  ]);
  if (!canView) redirect("/dashboard?accessDenied=think-education.discipline");

  const params = await searchParams;
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const branchIds = campuses.map((campus) => campus.id);
  const requestedBranch = getParam(params, "branch");
  const branchId = branchIds.includes(requestedBranch) ? requestedBranch : "";
  const selectedBranchIds = branchId ? [branchId] : branchIds;
  const search = getParam(params, "search").trim().slice(0, 100);
  const requestedStatus = getParam(params, "status");
  const status = ["open", "under_review", "resolved", "closed"].includes(requestedStatus) ? requestedStatus : "";
  const requestedSeverity = getParam(params, "severity");
  const severity = ["low", "medium", "high", "critical"].includes(requestedSeverity) ? requestedSeverity : "";
  const supabase = await createClient();

  const [{ data: incidents, error: incidentError }, { data: students }, { data: classes }, { data: staff }] = await Promise.all([
    selectedBranchIds.length
      ? supabase.rpc("education_get_discipline_incidents", {
        p_org_id: context.orgId,
        p_branch_ids: selectedBranchIds,
        p_search: search || null,
        p_status: status || null,
        p_severity: severity || null,
      })
      : Promise.resolve({ data: [], error: null }),
    selectedBranchIds.length
      ? supabase.from("education_students")
        .select("id, branch_id, student_number, first_name, last_name")
        .eq("org_id", context.orgId).in("branch_id", selectedBranchIds).eq("status", "active")
        .order("last_name").order("first_name").limit(500)
      : Promise.resolve({ data: [], error: null }),
    selectedBranchIds.length
      ? supabase.from("education_classes")
        .select("id, branch_id, name")
        .eq("org_id", context.orgId).in("branch_id", selectedBranchIds).eq("status", "active")
        .order("name")
      : Promise.resolve({ data: [], error: null }),
    selectedBranchIds.length
      ? supabase.from("education_staff")
        .select("id, branch_id, first_name, last_name")
        .eq("org_id", context.orgId).in("branch_id", selectedBranchIds).eq("status", "active")
        .order("last_name").order("first_name")
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (incidentError) throw new Error(`Could not load discipline incidents: ${incidentError.message}`);

  const studentById = new Map((students ?? []).map((student) => [student.id, `${student.first_name} ${student.last_name} (${student.student_number})`]));
  const classById = new Map((classes ?? []).map((classroom) => [classroom.id, classroom.name]));
  const staffById = new Map((staff ?? []).map((member) => [member.id, `${member.first_name} ${member.last_name}`]));
  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const rows = incidents ?? [];

  return <main className="mx-auto max-w-[1500px] space-y-6 p-4 md:p-6">
    <header>
      <Link href={getProductAppPath("think-education", "/dashboard")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>
      <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold text-slate-950"><ShieldAlert className="h-6 w-6 text-rose-700" /> Behaviour & discipline</h1>
      <p className="mt-1 text-sm text-slate-600">Restricted incident records for authorized education staff.</p>
    </header>

    {params.created === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">Incident recorded.</p>}
    {params.reviewed === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">Incident reviewed.</p>}
    {params.error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">The incident could not be saved or reviewed.</p>}

    <form method="get" className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-5">
      <label className="text-sm font-medium text-slate-700">Campus
        <select name="branch" defaultValue={branchId} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
          <option value="">All campuses</option>
          {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium text-slate-700">Search
        <input name="search" defaultValue={search} maxLength={100} placeholder="Title or description" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
      </label>
      <label className="text-sm font-medium text-slate-700">Status
        <select name="status" defaultValue={status} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
          <option value="">All statuses</option>
          {["open", "under_review", "resolved", "closed"].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium text-slate-700">Severity
        <select name="severity" defaultValue={severity} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
          <option value="">All severities</option>
          {["low", "medium", "high", "critical"].map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <div className="flex items-end">
        <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Apply filters</button>
      </div>
    </form>

    {canCreate && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-slate-950">Record an incident</h2>
      <form action={createEducationDisciplineIncident} className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">Campus
          <select name="branch_id" required defaultValue={branchId || selectedBranchIds[0] || ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            {selectedBranchIds.map((campusId) => <option key={campusId} value={campusId}>{campusNameById.get(campusId) ?? "Campus"}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Student
          <select name="student_id" required defaultValue="" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="" disabled>Select student</option>
            {(students ?? []).map((student) => <option key={student.id} value={student.id}>{student.first_name} {student.last_name} · {student.student_number}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Class
          <select name="class_id" defaultValue="" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">Not specified</option>
            {(classes ?? []).map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Assigned staff
          <select name="staff_id" defaultValue="" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">Not assigned</option>
            {(staff ?? []).map((member) => <option key={member.id} value={member.id}>{member.first_name} {member.last_name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Incident date
          <input type="date" name="incident_date" required defaultValue={new Date().toISOString().slice(0, 10)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Category
          <select name="category" required defaultValue="misconduct" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            {["misconduct", "attendance", "academic", "bullying", "safety", "property", "other"].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Severity
          <select name="severity" required defaultValue="medium" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            {["low", "medium", "high", "critical"].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700 md:col-span-2">Title
          <input name="title" required maxLength={160} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700 md:col-span-2">Description
          <textarea name="description" required maxLength={5000} rows={4} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700 md:col-span-2">Immediate action taken
          <textarea name="action_taken" maxLength={5000} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <div className="md:col-span-2">
          <button type="submit" className="rounded-lg bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-800">Record incident</button>
        </div>
      </form>
    </section>}

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-4">
        <h2 className="font-semibold text-slate-950">Incident history</h2>
      </div>
      {rows.length === 0
        ? <p className="p-6 text-sm text-slate-500">No incidents match these filters.</p>
        : <div className="divide-y divide-slate-100">
          {rows.map((incident) => {
            return <article key={incident.incident_id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{campusNameById.get(incident.branch_id) ?? "Campus"} · {new Date(`${incident.incident_date}T00:00:00`).toLocaleDateString()}</p>
                <h3 className="mt-1 font-semibold text-slate-950">{incident.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{studentById.get(incident.student_id) ?? "Student"} · {incident.category} · {incident.severity}</p>
                {incident.class_id && <p className="text-xs text-slate-500">Class: {classById.get(incident.class_id) ?? "Unknown"}</p>}
                {incident.staff_id && <p className="text-xs text-slate-500">Assigned staff: {staffById.get(incident.staff_id) ?? "Unknown"}</p>}
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${incident.status === "resolved" || incident.status === "closed" ? "bg-emerald-50 text-emerald-800" : incident.status === "under_review" ? "bg-amber-50 text-amber-800" : "bg-rose-50 text-rose-800"}`}>{incident.status.replaceAll("_", " ")}</span>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{incident.description}</p>
            {incident.action_taken && <p className="mt-2 text-sm text-slate-700"><strong>Action taken:</strong> {incident.action_taken}</p>}
            {incident.resolution_note && <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"><strong>Resolution:</strong> {incident.resolution_note}</p>}
            <p className="mt-2 text-xs text-slate-500">Parent notified: {incident.parent_notified ? `Yes${incident.parent_notified_at ? ` · ${new Date(incident.parent_notified_at).toLocaleString()}` : ""}` : "No"}</p>
            {(canApprove || canEdit) && incident.status !== "closed" && <form action={reviewEducationDisciplineIncident} className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-3">
              <input type="hidden" name="incident_id" value={incident.incident_id} />
              <label className="text-sm font-medium text-slate-700">Status
                <select name="status" defaultValue={incident.status} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal">
                  {["open", "under_review", "resolved", "closed"].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">Parent notified
                <select name="parent_notified" defaultValue={incident.parent_notified ? "true" : "false"} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal">
                  <option value="false">No</option>
                  <option value="true">Yes</option>
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700 md:col-span-3">Resolution note
                <textarea name="resolution_note" maxLength={5000} rows={2} defaultValue={incident.resolution_note ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal" />
              </label>
              <div className="md:col-span-3">
                <button type="submit" className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-800">Save review</button>
              </div>
            </form>}
            </article>
          })}
        </div>}
    </section>
  </main>;
}
