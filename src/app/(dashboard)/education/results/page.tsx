import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, FileText, Plus, Trophy } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import {
  createEducationResult,
  updateEducationExaminationStatus,
  updateEducationResultStatus,
} from "../actions";

type EducationResultRow = {
  id: string;
  student_id: string;
  subject_name: string;
  score: number;
  maximum_score: number;
  grade: string | null;
  status: string;
};

export default async function EducationResultsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_results", "results", "gradebook", "view")) {
    redirect("/dashboard?accessDenied=think-education.results");
  }

  const params = await searchParams;
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const branchIds = campuses.map((campus) => campus.id);
  const [canCreate, canEdit, canApprove, canPublish] = await Promise.all([
    canTabPermission("education_results", "results", "gradebook", "create"),
    canTabPermission("education_results", "results", "gradebook", "edit"),
    canTabPermission("education_results", "results", "gradebook", "approve"),
    canTabPermission("education_results", "results", "gradebook", "publish"),
  ]);
  const supabase = await createClient();
  let exams: Array<{ id: string; branch_id: string; name: string; status: string }> = [];
  if (branchIds.length) {
    const { data, error } = await supabase.from("education_examinations")
      .select("id, branch_id, name, status")
      .eq("org_id", context.orgId).in("branch_id", branchIds)
      .order("starts_at", { ascending: false });
    if (error) throw new Error(`Could not load examinations for results: ${error.message}`);
    exams = data ?? [];
  }
  const requestedExam = typeof params.examination === "string" ? params.examination : "";
  const selectedExam = exams.find((exam) => exam.id === requestedExam)
    ?? exams.find((exam) => exam.status === "completed" || exam.status === "results_pending")
    ?? null;
  let results: EducationResultRow[] = [];
  if (selectedExam) {
    const { data, error } = await supabase.from("education_results")
      .select("id, student_id, subject_name, score, maximum_score, grade, status")
      .eq("org_id", context.orgId).eq("examination_id", selectedExam.id)
      .order("subject_name");
    if (error) throw new Error(`Could not load Think Education results: ${error.message}`);
    results = data ?? [];
  }
  const studentIds = Array.from(new Set(results.map((result) => result.student_id)));
  const studentNameById = new Map<string, { number: string; name: string }>();
  if (studentIds.length) {
    const { data, error } = await supabase.from("education_students")
      .select("id, student_number, first_name, last_name")
      .eq("org_id", context.orgId).in("id", studentIds);
    if (error) throw new Error(`Could not load students for Think Education results: ${error.message}`);
    for (const student of data ?? []) studentNameById.set(student.id, {
      number: student.student_number,
      name: `${student.first_name} ${student.last_name}`,
    });
  }
  const canEnterResults = Boolean(selectedExam && ["completed", "results_pending"].includes(selectedExam.status) && canCreate);
  const errorMessage = params.error === "duplicate"
    ? "A result for that student and subject already exists for this examination."
    : params.error === "student"
      ? "No student with that number was found in the examination campus."
      : params.error === "invalid"
        ? "Check the examination, student number, subject, score, and maximum score."
        : params.error === "save" ? "The result could not be saved. Please try again." : null;

  return <main className="mx-auto max-w-[1500px] space-y-5 p-4 md:p-6">
    <header>
      <Link href={getProductAppPath("think-education", "/dashboard")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-950">Results &amp; Report Cards</h1>
      <p className="mt-1 text-sm text-slate-600">Enter scores, submit grades for approval, and publish finalized results.</p>
    </header>

    {params.created === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Result added.</p>}
    {params.updated === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Result status updated.</p>}
    {errorMessage && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{errorMessage}</p>}

    <section className="grid gap-3 sm:grid-cols-3">
      {[
        { label: "Results in selected exam", value: results.length, icon: FileText },
        { label: "Awaiting approval", value: results.filter((result) => result.status === "submitted").length, icon: Trophy },
        { label: "Published", value: results.filter((result) => result.status === "published").length, icon: Trophy },
      ].map(({ label, value, icon: Icon }) => <article key={label} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-950">{value.toLocaleString()}</p></div>
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><Icon className="h-5 w-5" /></span>
      </article>)}
    </section>

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <form method="get" action={getProductAppPath("think-education", "/results")} className="flex flex-wrap items-end gap-3 border-b border-slate-200 p-4">
        <label className="min-w-[260px] flex-1 text-sm font-medium text-slate-700">Examination
          <select name="examination" defaultValue={selectedExam?.id ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            {exams.length === 0 && <option value="">No examinations available</option>}
            {exams.map((exam) => <option key={exam.id} value={exam.id}>{exam.name} · {exam.status.replace("_", " ")}</option>)}
          </select>
        </label>
        <button type="submit" className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100">Load results</button>
      </form>

      {!selectedExam ? <div className="p-8 text-center">
        <FileText className="mx-auto h-10 w-10 text-slate-300" />
        <h2 className="mt-3 font-semibold text-slate-900">No examinations available</h2>
        <p className="mt-1 text-sm text-slate-500">Create and complete an examination before entering results.</p>
      </div> : results.length === 0 ? <div className="p-8 text-center">
        <FileText className="mx-auto h-10 w-10 text-slate-300" />
        <h2 className="mt-3 font-semibold text-slate-900">No results entered</h2>
        <p className="mt-1 text-sm text-slate-500">Add student scores below. Every result must be published before the examination can be published.</p>
      </div> : <div className="overflow-x-auto">
        <table className="w-full min-w-[850px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Student number</th><th className="px-4 py-3">Student</th><th className="px-4 py-3">Subject</th><th className="px-4 py-3">Score</th><th className="px-4 py-3">Grade</th><th className="px-4 py-3">Status / actions</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{results.map((result) => {
            const student = studentNameById.get(result.student_id);
            const nextStatus = result.status === "draft" ? "submitted"
              : result.status === "submitted" ? "approved"
                : result.status === "approved" ? "published" : null;
            const canUpdate = result.status === "draft" ? canEdit
              : result.status === "submitted" ? canEdit && canApprove
                : result.status === "approved" ? canEdit && canPublish : false;
            return <tr key={result.id}>
              <td className="whitespace-nowrap px-4 py-3 font-semibold text-blue-800">{student?.number ?? "—"}</td>
              <td className="px-4 py-3 font-medium text-slate-900">{student?.name ?? "Student"}</td>
              <td className="px-4 py-3 text-slate-700">{result.subject_name}</td>
              <td className="px-4 py-3 text-slate-700">{result.score} / {result.maximum_score}</td>
              <td className="px-4 py-3 text-slate-700">{result.grade ?? "—"}</td>
              <td className="px-4 py-3">
                <span className="inline-block rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">{result.status}</span>
                {nextStatus && canUpdate && <form action={updateEducationResultStatus} className="mt-2">
                  <input type="hidden" name="result_id" value={result.id} /><input type="hidden" name="status" value={nextStatus} />
                  <button className="rounded-md bg-blue-700 px-2.5 py-1 text-xs font-semibold capitalize text-white hover:bg-blue-800">{nextStatus === "submitted" ? "Submit" : nextStatus}</button>
                </form>}
              </td>
            </tr>;
          })}</tbody>
        </table>
      </div>}
    </section>

    {canEnterResults && selectedExam && <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-slate-950">Enter result</h2>
      <p className="mt-1 text-sm text-slate-500">Add a score for a student in {selectedExam.name}. Student numbers are checked against this examination’s campus.</p>
      <form action={createEducationResult} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <input type="hidden" name="examination_id" value={selectedExam.id} />
        <label className="text-sm font-medium text-slate-700">Student number
          <input required name="student_number" maxLength={32} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Subject
          <input required name="subject_name" maxLength={120} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Score
          <input required name="score" type="number" min={0} step="0.01" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Maximum score
          <input required name="maximum_score" type="number" min="0.01" step="0.01" defaultValue={100} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Grade (optional)
          <input name="grade" maxLength={10} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <div className="sm:col-span-2 lg:col-span-5"><button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"><Plus className="h-4 w-4" /> Save result</button></div>
      </form>
    </section>}

    {selectedExam?.status === "results_pending" && canEdit && canPublish && <section className="rounded-xl border border-blue-200 bg-blue-50 p-5">
      <h2 className="font-semibold text-blue-950">Publish examination</h2>
      <p className="mt-1 text-sm text-blue-900">The database will allow publication only after at least one result exists and every result is published.</p>
      <form action={updateEducationExaminationStatus} className="mt-3">
        <input type="hidden" name="examination_id" value={selectedExam.id} /><input type="hidden" name="status" value="published" />
        <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Publish examination results</button>
      </form>
    </section>}
  </main>;
}
