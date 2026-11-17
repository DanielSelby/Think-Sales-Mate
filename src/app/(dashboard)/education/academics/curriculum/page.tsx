import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BookOpen, Plus } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import { saveEducationClassSubject } from "../../actions";

export default async function EducationCurriculumPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_academics", "academics", "classes", "view")
    || !await canTabPermission("education_academics", "academics", "calendar", "view")) {
    redirect("/dashboard?accessDenied=think-education.academics");
  }

  const params = await searchParams;
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const branchIds = campuses.map((campus) => campus.id);
  const [canCreate, canEdit, canViewStaff] = await Promise.all([
    canTabPermission("education_academics", "academics", "classes", "create"),
    canTabPermission("education_academics", "academics", "classes", "edit"),
    canTabPermission("education_staff", "staff", "records", "view"),
  ]);
  const supabase = await createClient();
  const [classesResult, yearsResult, subjectsResult, assignmentsResult, staffResult] = await Promise.all([
    branchIds.length
      ? supabase.from("education_classes")
        .select("id, branch_id, academic_year_id, name, status")
        .eq("org_id", context.orgId).in("branch_id", branchIds).order("name")
      : Promise.resolve({ data: [], error: null }),
    supabase.from("education_academic_years")
      .select("id, name")
      .eq("org_id", context.orgId),
    supabase.from("education_subjects")
      .select("id, name, status")
      .eq("org_id", context.orgId).order("name"),
    branchIds.length
      ? supabase.from("education_class_subjects")
        .select("id, branch_id, class_id, subject_id, lead_staff_id, status")
        .eq("org_id", context.orgId).in("branch_id", branchIds).order("created_at")
      : Promise.resolve({ data: [], error: null }),
    canViewStaff && branchIds.length
      ? supabase.from("education_staff")
        .select("id, branch_id, first_name, last_name, status")
        .eq("org_id", context.orgId).in("branch_id", branchIds)
        .eq("staff_category", "teaching").order("last_name").order("first_name")
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (classesResult.error) throw new Error(`Could not load Think Education classes: ${classesResult.error.message}`);
  if (yearsResult.error) throw new Error(`Could not load Think Education academic years: ${yearsResult.error.message}`);
  if (subjectsResult.error) throw new Error(`Could not load the Think Education subject catalog: ${subjectsResult.error.message}`);
  if (assignmentsResult.error) throw new Error(`Could not load class-subject assignments: ${assignmentsResult.error.message}`);
  if (staffResult.error) throw new Error(`Could not load teaching staff for the curriculum: ${staffResult.error.message}`);

  const classes = classesResult.data ?? [];
  const academicYears = yearsResult.data ?? [];
  const subjects = subjectsResult.data ?? [];
  const assignments = assignmentsResult.data ?? [];
  const staff = staffResult.data ?? [];
  const yearNameById = new Map(academicYears.map((year) => [year.id, year.name]));
  const subjectById = new Map(subjects.map((subject) => [subject.id, subject]));
  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const staffById = new Map(staff.map((member) => [member.id, `${member.first_name} ${member.last_name}`]));
  const errorMessage = params.error === "invalid"
    ? "Choose a valid class, subject, status, and teaching staff member."
    : params.error === "class"
      ? "The selected class is no longer available."
      : params.error === "subject"
        ? "The selected subject is unavailable or inactive."
        : params.error === "teacher"
          ? "The selected lead teacher must be active and assigned to this campus."
          : params.error === "save"
            ? "The class-subject assignment could not be saved. Please try again."
            : null;

  return <main className="mx-auto w-full max-w-[1500px] space-y-6 p-4 md:p-6 xl:p-8">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <Link href={getProductAppPath("think-education", "/academics")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
          <ArrowLeft className="h-4 w-4" /> Academic management
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Class curriculum</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">Assign catalog subjects and lead teachers to each campus class. Timetable lessons can only use active assignments.</p>
      </div>
      <Link href={getProductAppPath("think-education", "/subjects")} className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-800 hover:bg-blue-100">Manage subject catalog</Link>
    </header>

    {params.saved === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Class curriculum saved.</p>}
    {errorMessage && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{errorMessage}</p>}

    {classes.length === 0 && <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">No classes are available in your assigned campuses.</p>}

    <section className="space-y-4">
      {classes.map((classroom) => {
        const classAssignments = assignments.filter((assignment) => assignment.class_id === classroom.id);
        const assignedSubjectIds = new Set(classAssignments.map((assignment) => assignment.subject_id));
        const addableSubjects = subjects.filter((subject) => subject.status === "active" && !assignedSubjectIds.has(subject.id));
        return <article key={classroom.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="font-bold text-slate-950">{classroom.name}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {campusNameById.get(classroom.branch_id) ?? "Campus"} · {yearNameById.get(classroom.academic_year_id) ?? "Academic year"} · {classroom.status}
              </p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-800">
              <BookOpen className="h-4 w-4" /> {classAssignments.filter((assignment) => assignment.status === "active").length} active subjects
            </span>
          </header>

          <div className="space-y-3 p-5">
            {classAssignments.length === 0 && <p className="text-sm text-slate-500">No subjects have been assigned to this class yet.</p>}
            {classAssignments.map((assignment) => {
              const subject = subjectById.get(assignment.subject_id);
              const teacherName = assignment.lead_staff_id
                ? staffById.get(assignment.lead_staff_id) ?? "Previously assigned teacher"
                : "";
              const teacherIsListed = assignment.lead_staff_id && staff.some((member) => member.id === assignment.lead_staff_id);
              return <form key={assignment.id} action={saveEducationClassSubject} className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                <input type="hidden" name="class_id" value={classroom.id} />
                <input type="hidden" name="subject_id" value={assignment.subject_id} />
                <div>
                  <p className="text-sm font-semibold text-slate-900">{subject?.name ?? "Unknown subject"}</p>
                  <p className="mt-1 text-xs text-slate-500">Subject assignment</p>
                </div>
                {canViewStaff
                  ? <label className="text-xs font-medium text-slate-600">Lead teacher
                    <select name="lead_staff_id" defaultValue={assignment.lead_staff_id ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm font-normal">
                      <option value="">Unassigned</option>
                      {assignment.lead_staff_id && !teacherIsListed && <option value={assignment.lead_staff_id}>{teacherName} (not currently active)</option>}
                      {staff.filter((member) => member.branch_id === classroom.branch_id).map((member) => <option key={member.id} value={member.id}>{member.first_name} {member.last_name}{member.status === "active" ? "" : ` · ${member.status}`}</option>)}
                    </select>
                  </label>
                  : <input type="hidden" name="lead_staff_id" value={assignment.lead_staff_id ?? ""} />}
                <div className="flex flex-wrap items-end gap-2">
                  <label className="text-xs font-medium text-slate-600">Status
                    <select name="status" defaultValue={assignment.status} disabled={!canEdit} className="mt-1 rounded-lg border border-slate-300 px-2 py-2 text-sm font-normal disabled:bg-slate-50">
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </label>
                  {canEdit && <button type="submit" className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800">Save</button>}
                </div>
              </form>;
            })}

            {canCreate && classroom.status === "active" && addableSubjects.length > 0 && <form action={saveEducationClassSubject} className="grid gap-3 rounded-xl border border-dashed border-blue-300 bg-blue-50/40 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
              <input type="hidden" name="class_id" value={classroom.id} />
              <input type="hidden" name="status" value="active" />
              <label className="text-xs font-medium text-slate-600">Add subject
                <select required name="subject_id" defaultValue="" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm font-normal">
                  <option value="" disabled>Select a catalog subject</option>
                  {addableSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                </select>
              </label>
              {canViewStaff
                ? <label className="text-xs font-medium text-slate-600">Lead teacher
                  <select name="lead_staff_id" defaultValue="" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm font-normal">
                    <option value="">Unassigned</option>
                    {staff.filter((member) => member.branch_id === classroom.branch_id && member.status === "active").map((member) => <option key={member.id} value={member.id}>{member.first_name} {member.last_name}</option>)}
                  </select>
                </label>
                : <input type="hidden" name="lead_staff_id" value="" />}
              <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800">
                <Plus className="h-4 w-4" /> Assign
              </button>
            </form>}
          </div>
        </article>;
      })}
    </section>
  </main>;
}
