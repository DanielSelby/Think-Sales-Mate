import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ClipboardCheck, NotebookPen } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import {
  reviewEducationLessonLog,
  saveEducationLessonPlan,
  submitEducationLessonLog,
} from "../../actions";

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  return typeof params[key] === "string" ? params[key] as string : "";
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

type LessonPlanningRow = {
  plan_id: string;
  branch_id: string;
  timetable_entry_id: string;
  class_id: string;
  subject_name: string;
  planned_date: string;
  topic: string;
  objectives: string;
  teaching_materials: string | null;
  plan_status: "planned" | "completed" | "cancelled";
  log_id: string | null;
  topic_covered: string | null;
  syllabus_section: string | null;
  teacher_remarks: string | null;
  log_status: "submitted" | "reviewed" | null;
  delivered_on: string | null;
  reviewed_at: string | null;
  supervisor_remarks: string | null;
};

export default async function EducationLessonPlansPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_timetables", "timetables", "schedule", "view")) {
    redirect("/dashboard?accessDenied=think-education.timetables");
  }

  const params = await searchParams;
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const branchIds = campuses.map((campus) => campus.id);
  const requestedBranch = getParam(params, "branch");
  const branchId = branchIds.includes(requestedBranch) ? requestedBranch : "";
  const selectedBranchIds = branchId ? [branchId] : branchIds;
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;
  const from = validDate(getParam(params, "from")) ? getParam(params, "from") : monthStart;
  const to = validDate(getParam(params, "to")) ? getParam(params, "to") : today;
  const rangeInvalid = from > to;
  const supabase = await createClient();
  const [canEdit, canApprove] = await Promise.all([
    canTabPermission("education_timetables", "timetables", "schedule", "edit"),
    canTabPermission("education_timetables", "timetables", "schedule", "approve"),
  ]);

  let timetableEntries: Array<{
    id: string;
    branch_id: string;
    class_id: string;
    subject_name: string;
    weekday: number;
    starts_at: string;
    ends_at: string;
  }> = [];
  let classes: Array<{ id: string; branch_id: string; name: string }> = [];
  if (selectedBranchIds.length) {
    const [entryResult, classResult] = await Promise.all([
      supabase.from("education_timetable_entries")
        .select("id, branch_id, class_id, subject_name, weekday, starts_at, ends_at")
        .eq("org_id", context.orgId)
        .in("branch_id", selectedBranchIds)
        .eq("status", "active")
        .order("weekday")
        .order("starts_at"),
      supabase.from("education_classes")
        .select("id, branch_id, name")
        .eq("org_id", context.orgId)
        .in("branch_id", selectedBranchIds)
        .eq("status", "active")
        .order("name"),
    ]);
    if (entryResult.error) throw new Error(`Could not load timetable lessons: ${entryResult.error.message}`);
    if (classResult.error) throw new Error(`Could not load lesson-plan classes: ${classResult.error.message}`);
    timetableEntries = entryResult.data ?? [];
    classes = classResult.data ?? [];
  }

  let plans: LessonPlanningRow[] = [];
  if (selectedBranchIds.length && !rangeInvalid) {
    const { data, error } = await supabase.rpc("education_get_lesson_planning_page", {
      p_org_id: context.orgId,
      p_branch_ids: selectedBranchIds,
      p_from: from,
      p_to: to,
    });
    if (error) throw new Error(`Could not load lesson plans and logs: ${error.message}`);
    plans = (data ?? []) as LessonPlanningRow[];
  }

  const classNameById = new Map(classes.map((classroom) => [classroom.id, classroom.name]));
  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const errorMessage = params.error === "date"
    ? "The plan date must match the timetable weekday."
    : params.error === "lesson"
      ? "The timetable lesson or plan could not be found."
      : params.error === "save"
        ? "The lesson plan or log could not be saved."
        : params.error === "invalid"
          ? "Check the lesson plan and log details."
          : null;

  return <main className="mx-auto max-w-[1500px] space-y-6 p-4 md:p-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <Link href={getProductAppPath("think-education", "/timetables")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
          <ArrowLeft className="h-4 w-4" /> Timetables
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">Lesson plans & logbook</h1>
        <p className="mt-1 text-sm text-slate-600">Plan lessons from the timetable and record what was delivered for supervisor review.</p>
      </div>
      <span className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800">
        <NotebookPen className="h-4 w-4" /> {plans.length} plan{plans.length === 1 ? "" : "s"}
      </span>
    </header>

    {params.saved === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">Lesson plan saved.</p>}
    {params.submitted === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">Lesson log submitted.</p>}
    {params.reviewed === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">Lesson log reviewed.</p>}
    {errorMessage && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{errorMessage}</p>}

    <form method="get" className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-4">
      <label className="text-sm font-medium text-slate-700">Campus
        <select name="branch" defaultValue={branchId} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
          <option value="">All campuses</option>
          {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium text-slate-700">From
        <input type="date" name="from" defaultValue={from} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
      </label>
      <label className="text-sm font-medium text-slate-700">To
        <input type="date" name="to" defaultValue={to} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
      </label>
      <div className="flex items-end">
        <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Apply filters</button>
      </div>
    </form>

    {rangeInvalid && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">The from date cannot be after the to date.</p>}

    {canEdit && timetableEntries.length > 0 && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-slate-950">Create lesson plan</h2>
      <form action={saveEducationLessonPlan} className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">Campus
          <select name="branch_id" required defaultValue={branchId || timetableEntries[0].branch_id} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            {selectedBranchIds.map((campusId) => <option key={campusId} value={campusId}>{campusNameById.get(campusId) ?? "Campus"}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Timetable lesson
          <select name="timetable_entry_id" required defaultValue="" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="" disabled>Select lesson</option>
            {timetableEntries.map((lesson) => <option key={lesson.id} value={lesson.id}>
              {weekdays[lesson.weekday - 1]} · {lesson.starts_at.slice(0, 5)}–{lesson.ends_at.slice(0, 5)} · {lesson.subject_name} · {classNameById.get(lesson.class_id) ?? "Class"}
            </option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Planned date
          <input type="date" name="planned_date" required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700 md:col-span-2">Topic
          <input name="topic" required maxLength={240} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700 md:col-span-2">Learning objectives
          <textarea name="objectives" required maxLength={2000} rows={4} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700 md:col-span-2">Teaching materials
          <textarea name="teaching_materials" maxLength={2000} rows={3} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <div className="md:col-span-2">
          <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Save lesson plan</button>
        </div>
      </form>
    </section>}

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-4">
        <h2 className="font-semibold text-slate-950">Plans and delivered lessons</h2>
      </div>
      {plans.length === 0
        ? <p className="p-6 text-sm text-slate-500">No lesson plans match this date range.</p>
        : <div className="divide-y divide-slate-100">
          {plans.map((plan) => <article key={plan.plan_id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-blue-700">{campusNameById.get(plan.branch_id) ?? "Campus"} · {classNameById.get(plan.class_id) ?? "Class"}</p>
                <h3 className="mt-1 font-semibold text-slate-950">{plan.topic}</h3>
                <p className="mt-1 text-sm text-slate-600">{plan.subject_name} · {new Date(`${plan.planned_date}T00:00:00`).toLocaleDateString()}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${plan.plan_status === "completed" ? "bg-emerald-50 text-emerald-800" : plan.plan_status === "cancelled" ? "bg-slate-100 text-slate-700" : "bg-blue-50 text-blue-800"}`}>{plan.plan_status}</span>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div><p className="text-xs font-semibold text-slate-500">Objectives</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{plan.objectives}</p></div>
              <div><p className="text-xs font-semibold text-slate-500">Teaching materials</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{plan.teaching_materials ?? "Not recorded"}</p></div>
            </div>
            {plan.log_id
              ? <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="flex items-center gap-2 font-semibold text-slate-900"><ClipboardCheck className="h-4 w-4 text-emerald-700" /> Delivered log</h4>
                  <span className={`text-xs font-semibold ${plan.log_status === "reviewed" ? "text-emerald-700" : "text-amber-700"}`}>{plan.log_status}</span>
                </div>
                <p className="mt-2 text-sm"><strong>Topic covered:</strong> {plan.topic_covered}</p>
                {plan.syllabus_section && <p className="mt-1 text-sm"><strong>Syllabus section:</strong> {plan.syllabus_section}</p>}
                {plan.teacher_remarks && <p className="mt-1 text-sm"><strong>Teacher remarks:</strong> {plan.teacher_remarks}</p>}
                {plan.supervisor_remarks && <p className="mt-2 rounded-lg border border-emerald-200 bg-white p-3 text-sm text-emerald-900"><strong>Supervisor remarks:</strong> {plan.supervisor_remarks}</p>}
                {canApprove && plan.log_status !== "reviewed" && <form action={reviewEducationLessonLog} className="mt-3">
                  <input type="hidden" name="log_id" value={plan.log_id} />
                  <label className="text-sm font-medium text-slate-700">Supervisor remarks
                    <textarea name="supervisor_remarks" maxLength={2000} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal" />
                  </label>
                  <button type="submit" className="mt-2 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800">Mark reviewed</button>
                </form>}
              </div>
              : <form action={submitEducationLessonLog} className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
                <input type="hidden" name="lesson_plan_id" value={plan.plan_id} />
                <label className="text-sm font-medium text-slate-700 md:col-span-2">Topic covered
                  <input name="topic_covered" required maxLength={240} defaultValue={plan.topic} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal" />
                </label>
                <label className="text-sm font-medium text-slate-700">Syllabus section
                  <input name="syllabus_section" maxLength={240} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal" />
                </label>
                <label className="text-sm font-medium text-slate-700">Teacher remarks
                  <input name="teacher_remarks" maxLength={2000} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal" />
                </label>
                {canEdit && <div className="md:col-span-2">
                  <button type="submit" className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800">Submit delivered log</button>
                </div>}
              </form>}
          </article>
        })}
        </div>}
    </section>
  </main>;
}
