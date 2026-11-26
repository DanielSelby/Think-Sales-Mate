import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarClock, Users } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import { cancelEducationPTM, scheduleEducationPTM } from "../actions";

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  return typeof params[key] === "string" ? params[key] as string : "";
}

export default async function EducationMeetingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_staff", "staff", "directory", "view")) {
    redirect("/dashboard?accessDenied=think-education.staff");
  }
  const params = await searchParams;
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const branchIds = campuses.map((campus) => campus.id);
  const requestedBranch = getParam(params, "branch");
  const branchId = branchIds.includes(requestedBranch) ? requestedBranch : "";
  const selectedBranchIds = branchId ? [branchId] : branchIds;
  const today = new Date();
  const from = new Date(today);
  from.setHours(0, 0, 0, 0);
  const to = new Date(today);
  to.setDate(to.getDate() + 30);
  to.setHours(23, 59, 59, 999);
  const supabase = await createClient();

  const [{ data: teachers }, { data: students }, { data: guardians }] = await Promise.all([
    selectedBranchIds.length
      ? supabase.from("education_staff")
        .select("id, branch_id, first_name, last_name, staff_number")
        .eq("org_id", context.orgId)
        .in("branch_id", selectedBranchIds)
        .eq("staff_category", "teaching")
        .eq("status", "active")
        .order("last_name")
        .order("first_name")
      : Promise.resolve({ data: [], error: null }),
    selectedBranchIds.length
      ? supabase.from("education_students")
        .select("id, branch_id, student_number, first_name, last_name")
        .eq("org_id", context.orgId)
        .in("branch_id", selectedBranchIds)
        .eq("status", "active")
        .order("last_name")
        .order("first_name")
        .limit(500)
      : Promise.resolve({ data: [], error: null }),
    selectedBranchIds.length
      ? supabase.from("education_guardians")
        .select("id, first_name, last_name")
        .eq("org_id", context.orgId)
        .eq("status", "active")
        .order("last_name")
        .order("first_name")
        .limit(500)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const { data: meetingData, error: meetingError } = selectedBranchIds.length
    ? await supabase.rpc("education_get_ptm_list", {
      p_org_id: context.orgId,
      p_branch_ids: selectedBranchIds,
      p_from: from.toISOString(),
      p_to: to.toISOString(),
    })
    : { data: [], error: null };
  if (meetingError) throw new Error(`Could not load parent-teacher meetings: ${meetingError.message}`);
  const meetings = meetingData ?? [];

  const teacherById = new Map((teachers ?? []).map((teacher) => [teacher.id, `${teacher.first_name} ${teacher.last_name}`]));
  const studentById = new Map((students ?? []).map((student) => [student.id, `${student.first_name} ${student.last_name} (${student.student_number})`]));
  const guardianById = new Map((guardians ?? []).map((guardian) => [guardian.id, `${guardian.first_name} ${guardian.last_name}`]));
  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));

  return <main className="mx-auto max-w-[1500px] space-y-6 p-4 md:p-6">
    <header>
      <Link href={getProductAppPath("think-education", "/dashboard")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>
      <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold text-slate-950"><CalendarClock className="h-6 w-6 text-blue-700" /> Parent-teacher meetings</h1>
      <p className="mt-1 text-sm text-slate-600">Schedule 30- to 60-minute meetings and prevent teacher time conflicts.</p>
    </header>
    {params.scheduled === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">Meeting scheduled.</p>}
    {params.cancelled === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">Meeting cancelled.</p>}
    {params.error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
      {params.error === "conflict" ? "The teacher already has another meeting in that time slot." : "The meeting could not be saved."}
    </p>}

    <form method="get" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <label className="text-sm font-medium text-slate-700">Campus
        <select name="branch" defaultValue={branchId} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
          <option value="">All campuses</option>
          {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
        </select>
      </label>
      <button type="submit" className="mt-3 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white">Apply filter</button>
    </form>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-slate-950">Schedule a meeting</h2>
      <form action={scheduleEducationPTM} className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">Campus
          <select name="branch_id" required defaultValue={branchId || selectedBranchIds[0] || ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            {selectedBranchIds.map((campusId) => <option key={campusId} value={campusId}>{campusNameById.get(campusId) ?? "Campus"}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Teacher
          <select name="staff_id" required defaultValue="" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="" disabled>Select teacher</option>
            {(teachers ?? []).map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.first_name} {teacher.last_name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Student
          <select name="student_id" required defaultValue="" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="" disabled>Select student</option>
            {(students ?? []).map((student) => <option key={student.id} value={student.id}>{student.first_name} {student.last_name} · {student.student_number}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Guardian
          <select name="guardian_id" defaultValue="" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">Not assigned / guardian can book</option>
            {(guardians ?? []).map((guardian) => <option key={guardian.id} value={guardian.id}>{guardian.first_name} {guardian.last_name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Starts
          <input type="datetime-local" name="starts_at" required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Ends
          <input type="datetime-local" name="ends_at" required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700 md:col-span-2">Purpose
          <textarea name="purpose" maxLength={500} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <div className="md:col-span-2">
          <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Schedule meeting</button>
        </div>
      </form>
    </section>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-4">
        <h2 className="font-semibold text-slate-950">Upcoming meetings</h2>
      </div>
      {meetings.length === 0
        ? <p className="p-6 text-sm text-slate-500">No meetings are scheduled in the next 30 days.</p>
        : <div className="divide-y divide-slate-100">
          {meetings.map((meeting) => <article key={meeting.meeting_id} className="flex flex-wrap items-start justify-between gap-4 p-4">
            <div>
              <p className="font-semibold text-slate-950">{teacherById.get(meeting.staff_id) ?? "Teacher"} · {studentById.get(meeting.student_id) ?? "Student"}</p>
              <p className="mt-1 text-sm text-slate-600">{new Date(meeting.starts_at).toLocaleString()} – {new Date(meeting.ends_at).toLocaleString()}</p>
              {meeting.guardian_id && <p className="mt-1 text-xs text-slate-500">Guardian: {guardianById.get(meeting.guardian_id) ?? "Linked guardian"}</p>}
              {meeting.purpose && <p className="mt-2 text-sm text-slate-700">{meeting.purpose}</p>}
              <p className={`mt-2 text-xs font-semibold ${meeting.status === "scheduled" ? "text-blue-700" : meeting.status === "completed" ? "text-emerald-700" : "text-slate-500"}`}>{meeting.status}</p>
            </div>
            {meeting.status === "scheduled" && <form action={cancelEducationPTM}>
              <input type="hidden" name="meeting_id" value={meeting.meeting_id} />
              <input name="reason" maxLength={500} placeholder="Cancellation reason" className="mb-2 block rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <button type="submit" className="rounded-lg border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50">Cancel meeting</button>
            </form>}
          </article>)}
        </div>}
    </section>
  </main>;
}
