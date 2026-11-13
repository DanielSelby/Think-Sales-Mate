import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BookOpen, CalendarDays, Plus } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import {
  createEducationAcademicTerm,
  createEducationAcademicYear,
  createEducationClass,
  setEducationAcademicTermStatus,
  setEducationAcademicYearStatus,
} from "../actions";

export default async function EducationAcademicsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_academics", "academics", "calendar", "view")) {
    redirect("/dashboard?accessDenied=think-education.academics");
  }

  const params = await searchParams;
  const { campuses, hasOrganizationScope } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const branchIds = campuses.map((campus) => campus.id);
  const [canCreateYear, canCreateClass, canEditYear, canApproveYear] = await Promise.all([
    hasOrganizationScope && await canTabPermission("education_academics", "academics", "calendar", "create"),
    await canTabPermission("education_academics", "academics", "classes", "create"),
    hasOrganizationScope && await canTabPermission("education_academics", "academics", "calendar", "edit"),
    hasOrganizationScope && await canTabPermission("education_academics", "academics", "calendar", "approve"),
  ]);
  const supabase = await createClient();
  const [{ data: years, error: yearsError }, termsResult, classesResult] = await Promise.all([
    supabase.from("education_academic_years")
      .select("id, name, starts_on, ends_on, is_current, status")
      .eq("org_id", context.orgId).order("starts_on", { ascending: false }),
    supabase.from("education_academic_terms")
      .select("id, academic_year_id, name, starts_on, ends_on, sequence_number, status")
      .eq("org_id", context.orgId).order("sequence_number"),
    branchIds.length
      ? supabase.from("education_classes")
        .select("id, branch_id, academic_year_id, name, level_name, stream_name, capacity, status")
        .eq("org_id", context.orgId).in("branch_id", branchIds).order("name")
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (yearsError) throw new Error(`Could not load Think Education academic years: ${yearsError.message}`);
  if (termsResult.error) throw new Error(`Could not load Think Education academic terms: ${termsResult.error.message}`);
  if (classesResult.error) throw new Error(`Could not load Think Education classes: ${classesResult.error.message}`);
  const academicYears = years ?? [];
  const academicTerms = termsResult.data ?? [];
  const classes = classesResult.data ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const yearNameById = new Map(academicYears.map((year) => [year.id, year.name]));
  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const csvRows = [
    ["Class", "Level / stream", "Academic year", "Campus", "Capacity", "Status"],
    ...classes.map((classroom) => [
      classroom.name,
      [classroom.level_name, classroom.stream_name].filter(Boolean).join(" · ") || "—",
      yearNameById.get(classroom.academic_year_id) ?? classroom.academic_year_id,
      campusNameById.get(classroom.branch_id) ?? classroom.branch_id,
      String(classroom.capacity ?? ""),
      classroom.status,
    ]),
  ];
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(csvRows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n"))}`;
  const errorMessage = params.error === "duplicate"
    ? "An academic year or class with those details already exists."
    : params.error === "invalid"
      ? "Check the name, dates, campus, and class capacity."
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

  return <main className="mx-auto max-w-[1500px] space-y-5 p-4 md:p-6">
    <header>
      <Link href={getProductAppPath("think-education", "/dashboard")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-950">Academic Management</h1>
      <p className="mt-1 text-sm text-slate-600">Manage academic years and campus classes within your authorized scope.</p>
    </header>

    {params.created === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Academic record created.</p>}
    {params.updated === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Academic year status updated.</p>}
    {params.termCreated === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Academic term created.</p>}
    {params.termUpdated === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Academic term status updated.</p>}
    {errorMessage && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{errorMessage}</p>}

    <section className="grid gap-3 sm:grid-cols-4">
      {[
        { label: "Academic years", value: academicYears.length, icon: CalendarDays },
        { label: "Academic terms", value: academicTerms.length, icon: CalendarDays },
        { label: "Active classes", value: classes.filter((item) => item.status === "active").length, icon: BookOpen },
        { label: "Campuses in your access", value: campuses.length, icon: BookOpen },
      ].map(({ label, value, icon: Icon }) => <article key={label} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-950">{value.toLocaleString()}</p></div>
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><Icon className="h-5 w-5" /></span>
      </article>)}
    </section>

    {!hasOrganizationScope && <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      You can manage classes at assigned campuses. Academic years are organization-wide and require an administrator to grant explicit organization-wide access.
    </p>}

    <section className="grid gap-5 xl:grid-cols-2">
      <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
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

      <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-bold text-slate-950">Classes</h2>
          <p className="mt-1 text-sm text-slate-500">Class groups for your assigned campuses.</p>
        </div>
        {classes.length === 0 ? <p className="p-6 text-sm text-slate-500">{campuses.length ? "No classes found in your assigned campuses." : "Campus access has not been assigned."}</p> : <div>
          <div className="flex justify-end border-b border-slate-200 px-4 py-3">
            <a href={csvHref} download={`education-classes-${new Date().toISOString().slice(0, 10)}.csv`} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Export CSV</a>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Class</th><th className="px-4 py-3">Level / stream</th><th className="px-4 py-3">Academic year</th><th className="px-4 py-3">Campus</th><th className="px-4 py-3">Capacity</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{classes.map((classroom) => <tr key={classroom.id}>
              <td className="px-4 py-3 font-semibold text-slate-900">{classroom.name}</td>
              <td className="px-4 py-3 text-slate-600">{[classroom.level_name, classroom.stream_name].filter(Boolean).join(" · ") || "—"}</td>
              <td className="px-4 py-3 text-slate-600">{yearNameById.get(classroom.academic_year_id) ?? "—"}</td>
              <td className="px-4 py-3 text-slate-600">{campusNameById.get(classroom.branch_id) ?? "Campus"}</td>
              <td className="px-4 py-3 text-slate-600">{classroom.capacity ?? "—"}</td>
            </tr>)}</tbody>
          </table>
          </div>
        </div>}
      </article>
    </section>

    <section className="grid gap-5 xl:grid-cols-2">
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

      {canCreateClass && campuses.length > 0 && academicYears.length > 0 && <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-bold text-slate-950">Add class</h2>
        <p className="mt-1 text-sm text-slate-500">Create a class group in a campus and academic year you can access.</p>
        <form action={createEducationClass} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">Campus
            <select required name="branch_id" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">{campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}</select>
          </label>
          <label className="text-sm font-medium text-slate-700">Academic year
            <select required name="academic_year_id" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">{academicYears.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select>
          </label>
          <label className="text-sm font-medium text-slate-700">Class name
            <input required name="name" maxLength={100} placeholder="Grade 1" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <label className="text-sm font-medium text-slate-700">Level
            <input name="level_name" maxLength={80} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <label className="text-sm font-medium text-slate-700">Stream
            <input name="stream_name" maxLength={80} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <label className="text-sm font-medium text-slate-700">Capacity
            <input name="capacity" type="number" min={1} step={1} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <div className="sm:col-span-2"><button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"><Plus className="h-4 w-4" /> Save class</button></div>
        </form>
      </article>}

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
    </section>
  </main>;
}
