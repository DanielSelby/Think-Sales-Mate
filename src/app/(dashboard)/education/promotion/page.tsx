import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, GraduationCap, TrendingUp } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import { promoteEducationStudent } from "../actions";

type EnrollmentRow = {
  id: string;
  student_id: string;
  branch_id: string;
  class_id: string;
  academic_year_id: string;
};

export default async function EducationPromotionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_promotion", "promotion", "progression", "view")) {
    redirect("/dashboard?accessDenied=think-education.promotion");
  }

  const params = await searchParams;
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const branchIds = campuses.map((campus) => campus.id);
  const [canEdit, canApprove, canCreate] = await Promise.all([
    canTabPermission("education_promotion", "promotion", "progression", "edit"),
    canTabPermission("education_promotion", "promotion", "progression", "approve"),
    canTabPermission("education_promotion", "promotion", "progression", "create"),
  ]);
  const supabase = await createClient();
  const [{ data: years, error: yearsError }, enrollmentsResult, { data: classes, error: classesError }] = await Promise.all([
    supabase.from("education_academic_years")
      .select("id, name, status")
      .eq("org_id", context.orgId).order("starts_on", { ascending: false }),
    branchIds.length
      ? supabase.from("education_student_enrollments")
        .select("id, student_id, branch_id, class_id, academic_year_id")
        .eq("org_id", context.orgId).in("branch_id", branchIds).eq("status", "active")
        .order("enrolled_on")
      : Promise.resolve({ data: [] as EnrollmentRow[], error: null }),
    branchIds.length
      ? supabase.from("education_classes")
        .select("id, branch_id, academic_year_id, name")
        .eq("org_id", context.orgId).in("branch_id", branchIds).eq("status", "active")
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (yearsError) throw new Error(`Could not load academic years for student progression: ${yearsError.message}`);
  if (enrollmentsResult.error) throw new Error(`Could not load active student enrollments: ${enrollmentsResult.error.message}`);
  if (classesError) throw new Error(`Could not load classes for student progression: ${classesError.message}`);
  const academicYears = years ?? [];
  const enrollments: EnrollmentRow[] = enrollmentsResult.data ?? [];
  const academicYearById = new Map(academicYears.map((year) => [year.id, year]));
  const classById = new Map((classes ?? []).map((classroom) => [classroom.id, classroom]));
  const studentIds = Array.from(new Set(enrollments.map((enrollment) => enrollment.student_id)));
  const { data: students, error: studentsError } = studentIds.length
    ? await supabase.from("education_students")
      .select("id, student_number, first_name, last_name")
      .eq("org_id", context.orgId).in("id", studentIds).eq("status", "active")
    : { data: [], error: null };
  if (studentsError) throw new Error(`Could not load students for progression: ${studentsError.message}`);
  const studentById = new Map((students ?? []).map((student) => [student.id, student]));
  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const completedYearEnrollments = enrollments.filter((enrollment) =>
    academicYearById.get(enrollment.academic_year_id)?.status === "completed" && studentById.has(enrollment.student_id)
  );
  const csvRows = [
    ["Student number", "Student", "Campus", "Current class", "Completed year", "Recommended destination"],
    ...completedYearEnrollments.map((enrollment) => {
      const student = studentById.get(enrollment.student_id);
      const sourceClass = classById.get(enrollment.class_id);
      const destinationClasses = (classes ?? []).filter((classroom) =>
        classroom.branch_id === enrollment.branch_id
        && classroom.academic_year_id !== enrollment.academic_year_id
        && ["planned", "active"].includes(academicYearById.get(classroom.academic_year_id)?.status ?? "")
      );
      return [
        student?.student_number ?? "",
        `${student?.first_name ?? ""} ${student?.last_name ?? ""}`.trim(),
        campusNameById.get(enrollment.branch_id) ?? "",
        sourceClass?.name ?? "",
        academicYearById.get(enrollment.academic_year_id)?.name ?? "",
        destinationClasses.map((classroom) => classroom.name).join(" | "),
      ];
    }),
  ];
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(csvRows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n"))}`;
  const canProcess = canEdit && canApprove;
  const errorMessage = params.error === "stale"
    ? "That enrollment is no longer active or the destination is no longer available. Refresh and try again."
    : params.error === "invalid"
      ? "Select an eligible destination class or graduation action."
      : params.error === "save" ? "Student progression could not be completed. Please try again." : null;

  return <main className="mx-auto max-w-[1500px] space-y-5 p-4 md:p-6">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <Link href={getProductAppPath("think-education", "/dashboard")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">Promotion &amp; Graduation</h1>
        <p className="mt-1 text-sm text-slate-600">Progress active students from completed academic years into the next class, or record graduation.</p>
      </div>
      {completedYearEnrollments.length > 0 && <a href={csvHref} download={`education-promotion-${new Date().toISOString().slice(0, 10)}.csv`} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Export CSV</a>}
    </header>

    {params.updated === "promote" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Student promoted and enrolled in the destination class.</p>}
    {params.updated === "graduate" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Student marked as graduated and the active enrollment was completed.</p>}
    {errorMessage && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{errorMessage}</p>}

    <section className="grid gap-3 sm:grid-cols-3">
      {[
        { label: "Active enrollments", value: enrollments.length, icon: GraduationCap },
        { label: "Ready for progression", value: completedYearEnrollments.length, icon: TrendingUp },
        { label: "Campuses in your access", value: campuses.length, icon: GraduationCap },
      ].map(({ label, value, icon: Icon }) => <article key={label} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-950">{value.toLocaleString()}</p></div>
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><Icon className="h-5 w-5" /></span>
      </article>)}
    </section>

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {campuses.length === 0 ? <div className="p-8 text-center">
        <GraduationCap className="mx-auto h-10 w-10 text-slate-300" />
        <h2 className="mt-3 font-semibold text-slate-900">No campus access assigned</h2>
        <p className="mt-1 text-sm text-slate-500">Ask an authorized Think Education administrator to assign your campus scope.</p>
      </div> : completedYearEnrollments.length === 0 ? <div className="p-8 text-center">
        <TrendingUp className="mx-auto h-10 w-10 text-slate-300" />
        <h2 className="mt-3 font-semibold text-slate-900">No students ready for progression</h2>
        <p className="mt-1 text-sm text-slate-500">Complete an academic year in Academic Management to make its active enrollments eligible.</p>
      </div> : <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Student</th><th className="px-4 py-3">Campus</th><th className="px-4 py-3">Current class</th><th className="px-4 py-3">Completed year</th><th className="px-4 py-3">Progression</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{completedYearEnrollments.map((enrollment) => {
            const student = studentById.get(enrollment.student_id);
            const sourceClass = classById.get(enrollment.class_id);
            const destinationClasses = (classes ?? []).filter((classroom) =>
              classroom.branch_id === enrollment.branch_id
              && classroom.academic_year_id !== enrollment.academic_year_id
              && ["planned", "active"].includes(academicYearById.get(classroom.academic_year_id)?.status ?? "")
            );
            return <tr key={enrollment.id} className="align-top">
              <td className="px-4 py-3"><span className="block font-semibold text-slate-900">{student?.first_name} {student?.last_name}</span><span className="text-xs text-slate-500">{student?.student_number}</span></td>
              <td className="px-4 py-3 text-slate-600">{campusNameById.get(enrollment.branch_id) ?? "Campus"}</td>
              <td className="px-4 py-3 text-slate-600">{sourceClass?.name ?? "Class"}</td>
              <td className="px-4 py-3 text-slate-600">{academicYearById.get(enrollment.academic_year_id)?.name ?? "Academic year"}</td>
              <td className="px-4 py-3">
                {canProcess ? <form action={promoteEducationStudent} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="student_id" value={enrollment.student_id} />
                  <input type="hidden" name="source_enrollment_id" value={enrollment.id} />
                  <select name="destination_class_id" defaultValue="" className="min-w-[220px] rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    <option value="">Select destination class</option>
                    {destinationClasses.map((classroom) => <option key={classroom.id} value={classroom.id}>
                      {classroom.name} · {academicYearById.get(classroom.academic_year_id)?.name}
                    </option>)}
                  </select>
                  {canCreate && <button name="action" value="promote" disabled={destinationClasses.length === 0} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">Promote</button>}
                  <button name="action" value="graduate" className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Graduate</button>
                </form> : <span className="text-xs text-slate-500">Edit and approval permissions required</span>}
              </td>
            </tr>;
          })}</tbody>
        </table>
      </div>}
    </section>
  </main>;
}
