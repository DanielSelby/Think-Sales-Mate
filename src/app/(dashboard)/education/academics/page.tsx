import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BookOpen, CalendarDays, Plus, Users2 } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import {
  createEducationAcademicTerm,
  createEducationAcademicYear,
  setEducationAcademicTermStatus,
  setEducationAcademicYearStatus,
} from "../actions";
import { EducationClassModal } from "./education-class-form";
import { EducationClassesWorkspace } from "./education-classes-workspace";

export default async function EducationAcademicsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  const params = await searchParams;
  const activeSection = params.tab === "classes" ? "classes" : "calendar";
  const [canViewCalendar, canViewClasses] = await Promise.all([
    canTabPermission("education_academics", "academics", "calendar", "view"),
    canTabPermission("education_academics", "academics", "classes", "view"),
  ]);
  if (activeSection === "classes" ? !canViewClasses : !canViewCalendar) {
    redirect("/dashboard?accessDenied=think-education.academics");
  }

  const { campuses, hasOrganizationScope } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const branchIds = campuses.map((campus) => campus.id);
  const [canCreateYear, canCreateClass, canEditYear, canApproveYear, canExportClasses, canEditClass, canArchiveClass, canViewStaff, canViewDepartments, canViewTimetables] = await Promise.all([
    hasOrganizationScope && await canTabPermission("education_academics", "academics", "calendar", "create"),
    await canTabPermission("education_academics", "academics", "classes", "create"),
    hasOrganizationScope && await canTabPermission("education_academics", "academics", "calendar", "edit"),
    hasOrganizationScope && await canTabPermission("education_academics", "academics", "calendar", "approve"),
    canTabPermission("education_academics", "academics", "classes", "export"),
    canTabPermission("education_academics", "academics", "classes", "edit"),
    canTabPermission("education_academics", "academics", "classes", "delete"),
    canTabPermission("education_staff", "staff", "records", "view"),
    canTabPermission("education_academics", "academics", "departments", "view"),
    canTabPermission("education_timetables", "timetables", "schedule", "view"),
  ]);
  const supabase = await createClient();
  const [{ data: years, error: yearsError }, termsResult, staffResult] = await Promise.all([
    supabase.from("education_academic_years")
      .select("id, name, starts_on, ends_on, is_current, status")
      .eq("org_id", context.orgId).order("starts_on", { ascending: false }),
    supabase.from("education_academic_terms")
      .select("id, academic_year_id, name, starts_on, ends_on, sequence_number, status")
      .eq("org_id", context.orgId).order("sequence_number"),
    canViewStaff && branchIds.length
      ? supabase.from("education_staff")
        .select("id, branch_id, first_name, last_name, status")
        .eq("org_id", context.orgId).in("branch_id", branchIds)
        .eq("staff_category", "teaching").order("last_name").order("first_name")
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (yearsError) throw new Error(`Could not load Think Education academic years: ${yearsError.message}`);
  if (termsResult.error) throw new Error(`Could not load Think Education academic terms: ${termsResult.error.message}`);
  if (staffResult.error) throw new Error(`Could not load teaching staff for class assignments: ${staffResult.error.message}`);
  const academicYears = years ?? [];
  const academicTerms = termsResult.data ?? [];
  const staff = staffResult.data ?? [];
  const classes: Array<{
    id: string;
    branch_id: string;
    academic_year_id: string;
    name: string;
    class_code: string | null;
    level_name: string | null;
    stream_name: string | null;
    room: string | null;
    curriculum_stage: string | null;
    medium: string | null;
    class_teacher_id: string | null;
    capacity: number | null;
    status: string;
    created_at: string;
  }> = [];
  if (branchIds.length) {
    let offset = 0;
    while (true) {
      const { data: classPage, error: classesError } = await supabase.from("education_classes")
        .select("id, branch_id, academic_year_id, name, class_code, level_name, stream_name, room, curriculum_stage, medium, class_teacher_id, capacity, status, created_at")
        .eq("org_id", context.orgId)
        .in("branch_id", branchIds)
        .order("name")
        .order("id")
        .range(offset, offset + 499);
      if (classesError) throw new Error(`Could not load Think Education classes: ${classesError.message}`);
      classes.push(...(classPage ?? []));
      if ((classPage ?? []).length < 500) break;
      offset += 500;
    }
  }
  const today = new Date().toISOString().slice(0, 10);
  const classIds = classes.map((classroom) => classroom.id);
  const enrollmentCountByClass = new Map<string, number>();
  for (let offset = 0; activeSection === "classes" && offset < classIds.length; offset += 500) {
    const { data: enrollmentCounts, error: enrollmentCountError } = await supabase.rpc("education_get_class_enrollment_counts", {
      p_org_id: context.orgId,
      p_class_ids: classIds.slice(offset, offset + 500),
    });
    if (enrollmentCountError) throw new Error(`Could not load class enrollment counts: ${enrollmentCountError.message}`);
    for (const entry of enrollmentCounts ?? []) enrollmentCountByClass.set(entry.class_id, Number(entry.active_count));
  }
  const timetableRows: Array<{
    class_id: string;
    subject_name: string;
    weekday: number;
    starts_at: string;
    ends_at: string;
    room: string | null;
  }> = [];
  const subjectAssignmentRows: Array<{ class_id: string; subject_id: string }> = [];
  let subjects: Array<{ id: string; name: string }> = [];
  if (activeSection === "classes" && classIds.length) {
    const { data: subjectRows, error: subjectsError } = await supabase.from("education_subjects")
      .select("id, name")
      .eq("org_id", context.orgId).eq("status", "active").order("name");
    if (subjectsError) throw new Error(`Could not load class subjects: ${subjectsError.message}`);
    subjects = subjectRows ?? [];
    for (let offset = 0; offset < classIds.length; offset += 200) {
      const batch = classIds.slice(offset, offset + 200);
      const [timetableResult, assignmentsResult] = await Promise.all([
        canViewTimetables
          ? supabase.from("education_timetable_entries")
            .select("class_id, subject_name, weekday, starts_at, ends_at, room")
            .eq("org_id", context.orgId).in("branch_id", branchIds)
            .in("class_id", batch).eq("status", "active")
            .order("weekday").order("starts_at")
          : Promise.resolve({ data: [], error: null }),
        supabase.from("education_class_subjects")
          .select("class_id, subject_id")
          .eq("org_id", context.orgId).in("branch_id", branchIds)
          .in("class_id", batch).eq("status", "active"),
      ]);
      if (timetableResult.error) throw new Error(`Could not load class timetable rooms: ${timetableResult.error.message}`);
      if (assignmentsResult.error) throw new Error(`Could not load class subject assignments: ${assignmentsResult.error.message}`);
      timetableRows.push(...(timetableResult.data ?? []));
      subjectAssignmentRows.push(...(assignmentsResult.data ?? []));
    }
  }
  const timetableByClass = new Map<string, Array<{
    subject_name: string;
    weekday: number;
    starts_at: string;
    ends_at: string;
    room: string | null;
  }>>();
  for (const entry of timetableRows) {
    const current = timetableByClass.get(entry.class_id) ?? [];
    current.push(entry);
    timetableByClass.set(entry.class_id, current);
  }
  const activeSubjectCountByClass = new Map<string, number>();
  const subjectNamesById = new Map(subjects.map((subject) => [subject.id, subject.name]));
  const activeSubjectsByClass = new Map<string, string[]>();
  for (const entry of subjectAssignmentRows) {
    activeSubjectCountByClass.set(entry.class_id, (activeSubjectCountByClass.get(entry.class_id) ?? 0) + 1);
    const subjects = activeSubjectsByClass.get(entry.class_id) ?? [];
    subjects.push(subjectNamesById.get(entry.subject_id) ?? "Subject unavailable");
    activeSubjectsByClass.set(entry.class_id, subjects);
  }
  const classWorkspaceRows = classes.map((classroom) => {
    const timetable = timetableByClass.get(classroom.id) ?? [];
    return {
      ...classroom,
      active_students: enrollmentCountByClass.get(classroom.id) ?? 0,
      room_names: Array.from(new Set(timetable.map((entry) => entry.room).filter((room): room is string => Boolean(room)))),
      active_subject_count: activeSubjectCountByClass.get(classroom.id) ?? 0,
      active_subjects: activeSubjectsByClass.get(classroom.id) ?? [],
      timetable,
    };
  });
  const errorMessage = params.error === "duplicate"
    ? activeSection === "classes" ? "A class with those details already exists." : "An academic year or term with those details already exists."
    : params.error === "duplicate-code"
      ? "That class code is already used in this campus and academic year."
    : params.error === "teacher"
      ? "Choose an active teaching staff member assigned to the same campus."
      : params.error === "permission"
        ? "Your role does not have permission to perform that class action."
        : params.error === "campus"
          ? "The class is outside your assigned campus scope."
          : params.error === "class-in-use"
            ? "This class still has active students or timetable entries. Deactivate or transfer those records before archiving."
      : params.error === "email-address"
        ? "Enter a valid recipient email address."
        : params.error === "email-provider"
          ? "Email delivery is not configured. Configure the Resend API key and sender address before sending reports."
          : params.error === "email-large"
            ? "The PDF is too large to email. Narrow the filters and send a smaller report."
          : params.error === "email-send"
            ? "The PDF could not be sent. Check the email provider configuration and try again."
            : params.error === "selection"
              ? "The selected classes are no longer available. Refresh the list and try again."
      : params.error === "class"
        ? "The class could not be found in your assigned campuses."
        : params.error === "invalid"
            ? activeSection === "classes" ? "Check the class name, code, campus, capacity, stage, and medium." : "Check the name, dates, and academic year details."
          : params.error === "transition"
            ? "That academic year status transition is no longer available."
            : params.error === "terms-incomplete"
              ? "Complete every planned or active academic term before completing the academic year."
              : params.error === "overlap"
                ? "The term dates overlap another term in that academic year."
                : params.error === "year"
                  ? "The selected academic year is no longer available."
                  : params.error === "term-transition"
                    ? "The term cannot change status until its academic year and dates allow it."
                    : params.error === "save" ? "Your academic changes could not be saved. Please try again." : null;

  return <main className="mx-auto w-full max-w-[1680px] space-y-6 p-4 md:p-6 xl:p-8">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
      <Link href={getProductAppPath("think-education", "/dashboard")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>
      <h1 className="mt-2 flex items-center gap-2 text-3xl font-semibold tracking-tight text-slate-950">
        {activeSection === "classes" && <Users2 className="h-7 w-7 text-blue-700" />}
        {activeSection === "classes" ? "Classes & Sections" : "Academic Management"}
      </h1>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
        {activeSection === "classes" ? "Manage classes, sections and class assignments." : "Manage academic years and campus classes within your authorized scope."}
      </p>
      </div>
      {activeSection === "classes" && canCreateClass && campuses.length > 0 && academicYears.length > 0 && <EducationClassModal
        campuses={campuses}
        academicYears={academicYears}
        teachers={staff.filter((member) => member.status === "active")}
        canViewStaff={canViewStaff}
      />}
    </header>
    <nav aria-label="Academic management sections" className="flex gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
      {[
        { label: "Years & terms", href: "/academics?tab=calendar", active: activeSection === "calendar" },
        { label: "Classes", href: "/academics?tab=classes", active: activeSection === "classes" },
        { label: "Class curriculum", href: "/academics/curriculum", active: false },
        { label: "Subjects", href: "/subjects", active: false },
        ...(canViewDepartments ? [{ label: "Departments", href: "/academics/departments", active: false }] : []),
      ].map((tab) => <Link
        key={tab.href}
        href={getProductAppPath("think-education", tab.href)}
        aria-current={tab.active ? "page" : undefined}
        className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold transition ${
          tab.active ? "bg-blue-700 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
        }`}
      >{tab.label}</Link>)}
    </nav>

    {params.created === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{activeSection === "classes" ? "Class created." : "Academic record created."}</p>}
    {params.updated === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{activeSection === "classes" ? "Class updated." : "Academic year status updated."}</p>}
    {params.archived === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Class archived. Historical records were retained.</p>}
    {params.termCreated === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Academic term created.</p>}
    {params.termUpdated === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Academic term status updated.</p>}
    {params.classTeacherSaved === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Class teacher assignment updated.</p>}
    {params.emailed === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">The class report PDF was emailed successfully.</p>}
    {errorMessage && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{errorMessage}</p>}

    {activeSection === "calendar" && <section data-education-metrics className="grid gap-3 sm:grid-cols-4">
      {[
        { label: "Academic years", value: academicYears.length, icon: CalendarDays },
        { label: "Academic terms", value: academicTerms.length, icon: CalendarDays },
        { label: "Active classes", value: classes.filter((item) => item.status === "active").length, icon: BookOpen },
        { label: "Campuses in your access", value: campuses.length, icon: BookOpen },
      ].map(({ label, value, icon: Icon }) => <article key={label} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-950">{value.toLocaleString()}</p></div>
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><Icon className="h-5 w-5" /></span>
      </article>)}
    </section>}

    {!hasOrganizationScope && <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      You can manage classes at assigned campuses. Academic years are organization-wide and require an administrator to grant explicit organization-wide access.
    </p>}

    {activeSection === "calendar" && <section className="space-y-5">
      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-bold text-slate-950">Academic years</h2>
          <p className="mt-1 text-sm text-slate-500">Organization-wide academic calendars.</p>
        </div>
        {academicYears.length === 0 ? <p className="p-6 text-sm text-slate-500">No academic years are available in your current access scope.</p> : <div className="divide-y divide-slate-100">
          {academicYears.map((year) => <div key={year.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div><p className="font-semibold text-slate-900">{year.name}{year.is_current && <span className="ml-2 rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800">Current</span>}</p>
              <p className="mt-1 text-sm text-slate-500">{year.starts_on} to {year.ends_on}</p></div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">{year.status}</span>
              {year.status === "planned" && canEditYear && <form action={setEducationAcademicYearStatus}>
                <input type="hidden" name="academic_year_id" value={year.id} /><input type="hidden" name="status" value="active" />
                <button className="rounded-md bg-blue-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-800">Set current</button>
              </form>}
              {year.status === "active" && canEditYear && canApproveYear && <form action={setEducationAcademicYearStatus}>
                <input type="hidden" name="academic_year_id" value={year.id} /><input type="hidden" name="status" value="completed" />
                <button className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">Complete</button>
              </form>}
            </div>
            <div className="w-full space-y-2 border-t border-slate-100 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Terms</p>
              {academicTerms.filter((term) => term.academic_year_id === year.id).length === 0
                ? <p className="text-sm text-slate-500">No terms have been added.</p>
                : academicTerms.filter((term) => term.academic_year_id === year.id).map((term) => <div key={term.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{term.sequence_number}. {term.name}</p>
                    <p className="text-xs text-slate-500">{term.starts_on} to {term.ends_on}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">{term.status}</span>
                    {term.status === "planned" && year.status === "active"
                      && term.starts_on <= today && term.ends_on >= today && canEditYear && <form action={setEducationAcademicTermStatus}>
                      <input type="hidden" name="term_id" value={term.id} /><input type="hidden" name="status" value="active" />
                      <button className="rounded-md bg-blue-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-800">Set active</button>
                    </form>}
                    {term.status === "active" && term.ends_on < today && canEditYear && canApproveYear && <form action={setEducationAcademicTermStatus}>
                      <input type="hidden" name="term_id" value={term.id} /><input type="hidden" name="status" value="completed" />
                      <button className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-white">Complete</button>
                    </form>}
                  </div>
                </div>)}
            </div>
          </div>)}
        </div>}
      </article>

    </section>}

    {activeSection === "classes" && <EducationClassesWorkspace
      classes={classWorkspaceRows}
      campuses={campuses}
      academicYears={academicYears}
      teachers={staff}
      canViewStaff={canViewStaff}
      canViewTimetables={canViewTimetables}
      canEdit={canEditClass}
      canArchive={canArchiveClass}
      canExport={canExportClasses}
    />}

    {activeSection === "calendar" && <section className="grid gap-5 xl:grid-cols-2">
      {canCreateYear && <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-bold text-slate-950">Add academic year</h2>
        <p className="mt-1 text-sm text-slate-500">Academic years are shared across this Think Education organization.</p>
        <form action={createEducationAcademicYear} className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="text-sm font-medium text-slate-700 sm:col-span-3">Year name
            <input required name="name" maxLength={80} placeholder="2026/2027" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <label className="text-sm font-medium text-slate-700">Start date
            <input required type="date" name="starts_on" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <label className="text-sm font-medium text-slate-700">End date
            <input required type="date" name="ends_on" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <div className="flex items-end"><button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"><Plus className="h-4 w-4" /> Save year</button></div>
        </form>
      </article>}

    </section>}

    {activeSection === "calendar" && <section className="grid gap-5">
      {canCreateYear && academicYears.some((year) => year.status === "planned" || year.status === "active") && <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-bold text-slate-950">Add academic term</h2>
        <p className="mt-1 text-sm text-slate-500">Terms must fall within the selected academic year and cannot overlap.</p>
        <form action={createEducationAcademicTerm} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">Academic year
            <select required name="academic_year_id" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
              {academicYears.filter((year) => year.status === "planned" || year.status === "active").map((year) => <option key={year.id} value={year.id}>{year.name} ({year.starts_on} – {year.ends_on})</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">Term name
            <input required name="name" maxLength={80} placeholder="First term" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <label className="text-sm font-medium text-slate-700">Sequence
            <input required name="sequence_number" type="number" min={1} max={9999} step={1} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <label className="text-sm font-medium text-slate-700">Start date
            <input required type="date" name="starts_on" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <label className="text-sm font-medium text-slate-700">End date
            <input required type="date" name="ends_on" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <div className="sm:col-span-2"><button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"><Plus className="h-4 w-4" /> Save term</button></div>
        </form>
      </article>}
    </section>}
  </main>;
}
