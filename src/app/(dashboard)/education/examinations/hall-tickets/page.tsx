import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Ticket } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import {
  getEducationInstitutionDisplayName,
  getEducationInstitutionLogoUrl,
} from "@/lib/education/institution-branding";
import { HallTicketsPrintButton } from "./print-button";

const MAX_TICKET_STUDENTS = 500;

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  return typeof params[key] === "string" ? params[key] as string : "";
}

function formatDate(value: string | null) {
  if (!value) return "Not set";
  return new Date(value).toLocaleDateString();
}

export default async function EducationHallTicketsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");

  const [canView, canExport] = await Promise.all([
    canTabPermission("education_examinations", "examinations", "schedule", "view"),
    canTabPermission("education_examinations", "examinations", "schedule", "export"),
  ]);
  if (!canView) redirect("/dashboard?accessDenied=think-education.examinations");

  const params = await searchParams;
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const accessibleBranchIds = campuses.map((campus) => campus.id);
  const requestedBranch = getParam(params, "branch");
  if (requestedBranch && !accessibleBranchIds.includes(requestedBranch)) {
    redirect(getProductAppPath("think-education", "/examinations/hall-tickets"));
  }
  const branchIds = requestedBranch ? [requestedBranch] : accessibleBranchIds;
  const requestedExamination = getParam(params, "examination");
  const requestedClass = getParam(params, "class");
  const search = getParam(params, "search").trim().slice(0, 80);
  const safeSearch = search.replace(/[^A-Za-z0-9\s_-]/g, "");
  const supabase = await createClient();

  let examinations: Array<{
    id: string;
    branch_id: string;
    academic_year_id: string;
    term_id: string | null;
    name: string;
    examination_type: string;
    starts_at: string | null;
    ends_at: string | null;
    status: string;
  }> = [];
  if (branchIds.length) {
    const { data, error } = await supabase.from("education_examinations")
      .select("id, branch_id, academic_year_id, term_id, name, examination_type, starts_at, ends_at, status")
      .eq("org_id", context.orgId)
      .in("branch_id", branchIds)
      .in("status", ["scheduled", "in_progress", "completed", "results_pending", "published"])
      .order("starts_at", { ascending: false })
      .order("name")
      .order("id")
      .limit(500);
    if (error) throw new Error(`Could not load examinations for hall tickets: ${error.message}`);
    examinations = data ?? [];
  }

  const selectedExamination = examinations.find((exam) => exam.id === requestedExamination)
    ?? examinations[0]
    ?? null;

  let classes: Array<{ id: string; name: string; branch_id: string }> = [];
  if (selectedExamination) {
    const { data, error } = await supabase.from("education_classes")
      .select("id, name, branch_id")
      .eq("org_id", context.orgId)
      .eq("branch_id", selectedExamination.branch_id)
      .eq("academic_year_id", selectedExamination.academic_year_id)
      .eq("status", "active")
      .order("name")
      .order("id");
    if (error) throw new Error(`Could not load classes for hall tickets: ${error.message}`);
    classes = data ?? [];
  }
  const selectedClass = classes.find((classroom) => classroom.id === requestedClass) ?? null;

  let yearName = "";
  let termName = "";
  if (selectedExamination) {
    const [{ data: year }, { data: term }] = await Promise.all([
      supabase.from("education_academic_years")
        .select("name")
        .eq("org_id", context.orgId)
        .eq("id", selectedExamination.academic_year_id)
        .maybeSingle(),
      selectedExamination.term_id
        ? supabase.from("education_academic_terms")
          .select("name")
          .eq("org_id", context.orgId)
          .eq("id", selectedExamination.term_id)
          .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    yearName = year?.name ?? "Academic year";
    termName = term?.name ?? "";
  }

  let students: Array<{
    id: string;
    student_number: string;
    first_name: string;
    last_name: string;
    other_names: string | null;
    photo_path: string | null;
  }> = [];
  let tooManyStudents = false;
  if (selectedExamination && selectedClass) {
    let query = supabase.from("education_student_enrollments")
      .select("student_id", { count: "exact" })
      .eq("org_id", context.orgId)
      .eq("branch_id", selectedExamination.branch_id)
      .eq("academic_year_id", selectedExamination.academic_year_id)
      .eq("class_id", selectedClass.id)
      .eq("status", "active")
      .order("student_id")
      .range(0, MAX_TICKET_STUDENTS - 1);
    const { data: enrollmentRows, count, error } = await query;
    if (error) throw new Error(`Could not load eligible students for hall tickets: ${error.message}`);
    tooManyStudents = (count ?? 0) > MAX_TICKET_STUDENTS;
    if (!tooManyStudents) {
      const studentIds = (enrollmentRows ?? []).map((row) => row.student_id);
      if (studentIds.length) {
        let studentQuery = supabase.from("education_students")
          .select("id, student_number, first_name, last_name, other_names, photo_path")
          .eq("org_id", context.orgId)
          .eq("branch_id", selectedExamination.branch_id)
          .eq("status", "active")
          .in("id", studentIds)
          .order("last_name")
          .order("first_name")
          .order("id")
          .limit(MAX_TICKET_STUDENTS);
        if (safeSearch) {
          studentQuery = studentQuery.or(
            `student_number.ilike.%${safeSearch}%,first_name.ilike.%${safeSearch}%,last_name.ilike.%${safeSearch}%`,
          );
        }
        const { data, error: studentError } = await studentQuery;
        if (studentError) throw new Error(`Could not load student details for hall tickets: ${studentError.message}`);
        students = data ?? [];
      }
    }
  }

  const [{ data: institution }, { data: companyProfile }] = await Promise.all([
    supabase.from("education_institution_settings")
      .select("institution_name, institution_code, institution_logo_url")
      .eq("org_id", context.orgId)
      .maybeSingle(),
    supabase.from("company_profile")
      .select("logo_url")
      .eq("org_id", context.orgId)
      .maybeSingle(),
  ]);
  const institutionName = getEducationInstitutionDisplayName(institution?.institution_name, context.orgName);
  const institutionLogoUrl = getEducationInstitutionLogoUrl(institution?.institution_logo_url, companyProfile?.logo_url);

  const photoEntries = await Promise.all(students.map(async (student) => {
    if (!student.photo_path) return [student.id, null] as const;
    const { data } = await supabase.storage
      .from("education-student-images")
      .createSignedUrl(student.photo_path, 60 * 60);
    return [student.id, data?.signedUrl ?? null] as const;
  }));
  const photoUrlByStudent = new Map(photoEntries);
  const campusName = campuses.find((campus) => campus.id === selectedExamination?.branch_id)?.name ?? "Campus";

  return <main className="hall-tickets-page mx-auto max-w-[1400px] space-y-5 p-4 md:p-6">
    <style>{`
      @media print {
        @page { size: A4 portrait; margin: 8mm; }
        body { background: white !important; }
        body * { visibility: hidden !important; }
        .hall-tickets-page, .hall-tickets-page * { visibility: visible !important; }
        .hall-tickets-page { position: absolute; inset: 0; width: 100%; max-width: none; padding: 0; }
        .ticket-controls { display: none !important; }
        .ticket-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6mm; }
        .hall-ticket { break-inside: avoid; box-shadow: none; }
      }
    `}</style>

    <header className="ticket-controls flex flex-wrap items-end justify-between gap-4">
      <div>
        <Link href={getProductAppPath("think-education", "/examinations")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
          <ArrowLeft className="h-4 w-4" /> Examinations
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">Hall tickets</h1>
        <p className="mt-1 text-sm text-slate-600">Generate A4-ready tickets for active students enrolled in the selected class.</p>
      </div>
      {canExport && students.length > 0 && !tooManyStudents && <HallTicketsPrintButton />}
    </header>

    <form method="get" className="ticket-controls grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-4">
      <label className="text-sm font-medium text-slate-700">Campus
        <select name="branch" defaultValue={requestedBranch} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
          <option value="">All accessible campuses</option>
          {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium text-slate-700">Examination
        <select name="examination" defaultValue={selectedExamination?.id ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
          {examinations.length === 0 && <option value="">No examinations available</option>}
          {examinations.map((exam) => <option key={exam.id} value={exam.id}>{exam.name} · {exam.status.replaceAll("_", " ")}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium text-slate-700">Class
        <select name="class" defaultValue={selectedClass?.id ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
          <option value="">Select a class</option>
          {classes.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium text-slate-700">Student search
        <input name="search" defaultValue={search} maxLength={80} placeholder="Name or student number" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
      </label>
      <div className="md:col-span-4 flex gap-2">
        <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Apply filters</button>
        <Link href={getProductAppPath("think-education", "/examinations/hall-tickets")} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Reset</Link>
      </div>
    </form>

    {!selectedExamination
      ? <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <Ticket className="mx-auto h-10 w-10 text-slate-300" />
        <h2 className="mt-3 font-semibold text-slate-900">No examination selected</h2>
        <p className="mt-1 text-sm text-slate-500">Create or schedule an examination first.</p>
      </section>
      : !selectedClass
        ? <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <Ticket className="mx-auto h-10 w-10 text-slate-300" />
          <h2 className="mt-3 font-semibold text-slate-900">Select a class</h2>
          <p className="mt-1 text-sm text-slate-500">Choose the class for which hall tickets should be generated.</p>
        </section>
        : tooManyStudents
          ? <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            This class has more than {MAX_TICKET_STUDENTS} eligible students. Narrow the student search and try again.
          </p>
          : students.length === 0
            ? <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
              <Ticket className="mx-auto h-10 w-10 text-slate-300" />
              <h2 className="mt-3 font-semibold text-slate-900">No eligible students found</h2>
              <p className="mt-1 text-sm text-slate-500">Ensure active students are enrolled in this class for the examination academic year.</p>
            </section>
            : <div className="ticket-grid grid gap-4 md:grid-cols-2">
              {students.map((student) => {
                const fullName = [student.first_name, student.other_names, student.last_name].filter(Boolean).join(" ");
                const photoUrl = photoUrlByStudent.get(student.id);
                return <article key={student.id} className="hall-ticket rounded-2xl border-2 border-slate-300 bg-white p-5 text-slate-950">
                  <header className="flex items-center gap-3 border-b-2 border-slate-300 pb-3">
                    {institutionLogoUrl
                      ? <img src={institutionLogoUrl} alt="" className="h-14 w-14 rounded-lg border border-slate-200 object-contain p-1" />
                      : <span className="grid h-14 w-14 place-items-center rounded-lg border border-slate-300 font-bold text-blue-700">T</span>}
                    <div className="min-w-0">
                      <p className="truncate text-lg font-bold">{institutionName}</p>
                      {institution?.institution_code && <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{institution.institution_code}</p>}
                      <p className="mt-1 text-sm font-semibold text-blue-800">Examination Hall Ticket</p>
                    </div>
                  </header>

                  <div className="mt-4 grid grid-cols-[1fr_86px] gap-3">
                    <div className="space-y-2 text-sm">
                      <p><span className="text-slate-500">Student:</span> <strong>{fullName}</strong></p>
                      <p><span className="text-slate-500">Student number:</span> <strong>{student.student_number}</strong></p>
                      <p><span className="text-slate-500">Class:</span> <strong>{selectedClass.name}</strong></p>
                      <p><span className="text-slate-500">Campus:</span> <strong>{campusName}</strong></p>
                    </div>
                    {photoUrl
                      ? <img src={photoUrl} alt={`${fullName} photo`} className="h-24 w-[86px] rounded-lg border border-slate-300 object-cover" />
                      : <div className="grid h-24 w-[86px] place-items-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-xl font-bold text-slate-500">
                        {[student.first_name[0], student.last_name[0]].filter(Boolean).join("").toUpperCase()}
                      </div>}
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                    <div><dt className="text-xs text-slate-500">Examination</dt><dd className="mt-1 font-semibold">{selectedExamination.name}</dd></div>
                    <div><dt className="text-xs text-slate-500">Academic period</dt><dd className="mt-1 font-semibold">{yearName}{termName ? ` · ${termName}` : ""}</dd></div>
                    <div><dt className="text-xs text-slate-500">Date</dt><dd className="mt-1 font-semibold">{formatDate(selectedExamination.starts_at)}</dd></div>
                    <div><dt className="text-xs text-slate-500">Type</dt><dd className="mt-1 font-semibold capitalize">{selectedExamination.examination_type.replaceAll("_", " ")}</dd></div>
                  </dl>

                  <div className="mt-4 grid grid-cols-2 gap-6 text-xs text-slate-600">
                    <div className="border-t border-slate-400 pt-2">Student signature</div>
                    <div className="border-t border-slate-400 pt-2">Authorised signature</div>
                  </div>
                </article>;
              })}
            </div>}
  </main>;
}
