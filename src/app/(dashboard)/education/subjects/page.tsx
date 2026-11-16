import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BookOpen, Plus } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import { createEducationSubject, setEducationSubjectStatus } from "../actions";

type EducationSubjectRow = {
  id: string;
  name: string;
  status: "active" | "inactive";
};

export default async function EducationSubjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_academics", "academics", "calendar", "view")) {
    redirect("/dashboard?accessDenied=think-education.subjects");
  }

  const params = await searchParams;
  const { hasOrganizationScope } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const [canCreate, canEdit] = await Promise.all([
    hasOrganizationScope && await canTabPermission("education_academics", "academics", "calendar", "create"),
    hasOrganizationScope && await canTabPermission("education_academics", "academics", "calendar", "edit"),
  ]);
  const supabase = await createClient();
  const { data, error } = await supabase.from("education_subjects")
    .select("id, name, status")
    .eq("org_id", context.orgId)
    .order("name");
  if (error) throw new Error(`Could not load the Think Education subject catalog: ${error.message}`);
  const subjects: EducationSubjectRow[] = data ?? [];

  const errorMessage = params.error === "duplicate"
    ? "That exact subject name already exists in this organization."
    : params.error === "invalid"
      ? "Enter a subject name containing at least one non-whitespace character (up to 120 characters)."
      : params.error === "subject"
        ? "That subject is no longer available."
        : params.error === "conflict"
          ? "The subject changed before your update was saved. Refresh and try again."
          : params.error === "save"
            ? "The subject could not be saved. Please try again."
            : null;

  return <main className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
    <header>
      <Link href={getProductAppPath("think-education", "/academics")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
        <ArrowLeft className="h-4 w-4" /> Academic management
      </Link>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">Organization Subject Catalog</h1>
      <p className="mt-1 text-sm text-slate-600">Subjects are shared across this organization and selected in results and timetables. Names are exact and immutable; deactivate a subject to prevent new use while preserving historical records.</p>
    </header>

    {params.created === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Subject added to the organization catalog.</p>}
    {params.updated === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Subject status updated.</p>}
    {errorMessage && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{errorMessage}</p>}

    {!hasOrganizationScope && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      The catalog is organization-wide. You can view subjects available to your organization, but changes require explicit organization-wide access.
    </p>}

    <section data-education-metrics className="grid gap-3 sm:grid-cols-3">
      {[
        { label: "Catalog subjects", value: subjects.length },
        { label: "Active", value: subjects.filter((subject) => subject.status === "active").length },
        { label: "Inactive", value: subjects.filter((subject) => subject.status === "inactive").length },
      ].map(({ label, value }) => <article key={label} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-950">{value.toLocaleString()}</p></div>
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><BookOpen className="h-5 w-5" /></span>
      </article>)}
    </section>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="font-bold text-slate-950">Subjects</h2>
        <p className="mt-1 text-sm text-slate-500">The original name remains attached to results and timetable entries as a display snapshot.</p>
      </div>
      {subjects.length === 0 ? <p className="p-6 text-sm text-slate-500">No catalog subjects are available yet.</p> : <ul className="divide-y divide-slate-100">
        {subjects.map((subject) => <li key={subject.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="min-w-0">
            <p className="break-words font-semibold text-slate-900">{subject.name}</p>
            <p className="mt-1 text-xs text-slate-500">Exact catalog name · cannot be renamed or deleted</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${subject.status === "active" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>{subject.status}</span>
            {canEdit && <form action={setEducationSubjectStatus}>
              <input type="hidden" name="subject_id" value={subject.id} />
              <input type="hidden" name="status" value={subject.status === "active" ? "inactive" : "active"} />
              <button type="submit" aria-label={`${subject.status === "active" ? "Deactivate" : "Reactivate"} ${subject.name}`} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                {subject.status === "active" ? "Deactivate" : "Reactivate"}
              </button>
            </form>}
          </div>
        </li>)}
      </ul>}
    </section>

    {canCreate && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-bold text-slate-950">Add subject</h2>
      <p className="mt-1 text-sm text-slate-500">Names are compared exactly. Leading or trailing whitespace is preserved, and names are never merged or normalized.</p>
      <form action={createEducationSubject} className="mt-4 flex flex-wrap items-end gap-3">
        <label className="min-w-[16rem] flex-1 text-sm font-medium text-slate-700">Subject name
          <input required name="name" maxLength={120} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">
          <Plus className="h-4 w-4" /> Add subject
        </button>
      </form>
    </section>}
  </main>;
}
