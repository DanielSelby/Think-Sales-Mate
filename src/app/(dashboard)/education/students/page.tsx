import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, GraduationCap, Plus, Search, Users } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import { createEducationStudent } from "../actions";

const PAGE_SIZE = 20;
const STUDENT_STATUSES = ["active", "on_hold", "graduated", "transferred", "withdrawn", "archived"] as const;

export default async function EducationStudentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_students", "students", "list", "view")) {
    redirect("/dashboard?accessDenied=think-education.students");
  }

  const params = await searchParams;
  const search = typeof params.search === "string" ? params.search.trim().slice(0, 80) : "";
  const status = STUDENT_STATUSES.find((item) => item === params.status) ?? "active";
  const requestedBranch = typeof params.branch === "string" ? params.branch : "";
  const currentPage = Math.min(1_000_000, Math.max(1, Number.parseInt(typeof params.page === "string" ? params.page : "1", 10) || 1));
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const allowedBranchIds = campuses.map((campus) => campus.id);
  const selectedBranch = allowedBranchIds.includes(requestedBranch) ? requestedBranch : "";
  const branchIds = selectedBranch ? [selectedBranch] : allowedBranchIds;
  const canCreate = await canTabPermission("education_students", "students", "list", "create");
  const supabase = await createClient();

  let totalCount = 0;
  let students: Array<{
    id: string;
    student_number: string;
    first_name: string;
    last_name: string;
    other_names: string | null;
    branch_id: string;
    status: string;
    created_at: string;
  }> = [];
  if (branchIds.length) {
    let countQuery = supabase.from("education_students").select("id", { count: "exact", head: true })
      .eq("org_id", context.orgId).in("branch_id", branchIds).eq("status", status);
    let studentQuery = supabase.from("education_students")
      .select("id, student_number, first_name, last_name, other_names, branch_id, status, created_at")
      .eq("org_id", context.orgId).in("branch_id", branchIds).eq("status", status)
      .order("last_name").order("first_name")
      .range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1);
    if (search) {
      const safeSearch = search.replace(/[^A-Za-z0-9\s_-]/g, "");
      if (safeSearch) {
        const pattern = `%${safeSearch}%`;
        const filter = `student_number.ilike.${pattern},first_name.ilike.${pattern},last_name.ilike.${pattern}`;
        countQuery = countQuery.or(filter);
        studentQuery = studentQuery.or(filter);
      }
    }
    const [{ count, error: countError }, { data, error: studentsError }] = await Promise.all([countQuery, studentQuery]);
    if (countError) throw new Error(`Could not count Think Education students: ${countError.message}`);
    if (studentsError) throw new Error(`Could not load Think Education students: ${studentsError.message}`);
    totalCount = count ?? 0;
    students = data ?? [];
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const branchNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const queryForPage = (page: number) => {
    const next = new URLSearchParams();
    if (search) next.set("search", search);
    if (status !== "active") next.set("status", status);
    if (selectedBranch) next.set("branch", selectedBranch);
    next.set("page", String(page));
    return `${getProductAppPath("think-education", "/students")}?${next.toString()}`;
  };
  if (currentPage > totalPages) redirect(queryForPage(totalPages));
  const errorMessage = params.error === "duplicate"
    ? "That student number is already in use in this organization."
    : params.error === "invalid"
      ? "Check the student number, name, and email fields and try again."
      : params.error === "save" ? "The student record could not be saved. Please try again." : null;

  return <main className="mx-auto max-w-[1500px] space-y-5 p-4 md:p-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <Link href={getProductAppPath("think-education", "/dashboard")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">Student Management</h1>
        <p className="mt-1 text-sm text-slate-600">View and manage student records across your authorized campuses.</p>
      </div>
      {canCreate && <a href="#add-student" className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">
        <Plus className="h-4 w-4" /> Add student
      </a>}
    </header>

    {params.created === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Student record created.</p>}
    {errorMessage && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{errorMessage}</p>}

    <section className="grid gap-3 sm:grid-cols-3">
      {[
        { label: "Students matching filters", value: totalCount.toLocaleString(), icon: Users },
        { label: "Campuses in your access", value: campuses.length.toLocaleString(), icon: GraduationCap },
        { label: "Records per page", value: PAGE_SIZE.toString(), icon: Search },
      ].map(({ label, value, icon: Icon }) => <article key={label} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-950">{value}</p></div>
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><Icon className="h-5 w-5" /></span>
      </article>)}
    </section>

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <form method="get" action={getProductAppPath("think-education", "/students")} className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-[minmax(220px,1fr)_200px_220px_auto]">
        <label className="relative block">
          <span className="sr-only">Search by student name or number</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input name="search" defaultValue={search} placeholder="Search name or student number" className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
        </label>
        <select name="branch" defaultValue={selectedBranch} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">All assigned campuses</option>
          {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
        </select>
        <select name="status" defaultValue={status} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          {STUDENT_STATUSES.map((item) => <option key={item} value={item}>{item.replace("_", " ")}</option>)}
        </select>
        <button type="submit" className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100">Apply filters</button>
      </form>

      {campuses.length === 0 ? <div className="p-8 text-center">
        <GraduationCap className="mx-auto h-10 w-10 text-slate-300" />
        <h2 className="mt-3 font-semibold text-slate-900">No campus access assigned</h2>
        <p className="mt-1 text-sm text-slate-500">Ask an authorized Think Education administrator to assign your campus scope.</p>
      </div> : students.length === 0 ? <div className="p-8 text-center">
        <GraduationCap className="mx-auto h-10 w-10 text-slate-300" />
        <h2 className="mt-3 font-semibold text-slate-900">No students found</h2>
        <p className="mt-1 text-sm text-slate-500">Try changing the search or filters, or add a student if you have permission.</p>
      </div> : <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-4 py-3">Student ID</th><th className="px-4 py-3">Full name</th><th className="px-4 py-3">Campus</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Enrolled</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {students.map((student) => <tr key={student.id} className="hover:bg-slate-50/70">
              <td className="whitespace-nowrap px-4 py-3 font-semibold text-blue-800">{student.student_number}</td>
              <td className="px-4 py-3 font-medium text-slate-900">{[student.first_name, student.other_names, student.last_name].filter(Boolean).join(" ")}</td>
              <td className="px-4 py-3 text-slate-600">{branchNameById.get(student.branch_id) ?? "Campus"}</td>
              <td className="px-4 py-3"><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold capitalize text-emerald-800">{student.status.replace("_", " ")}</span></td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-500">{new Date(student.created_at).toLocaleDateString()}</td>
            </tr>)}
          </tbody>
        </table>
      </div>}

      {totalCount > 0 && <footer className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
        <span className="text-slate-500">Showing {((currentPage - 1) * PAGE_SIZE) + 1}–{Math.min(currentPage * PAGE_SIZE, totalCount)} of {totalCount.toLocaleString()}</span>
        <div className="flex items-center gap-2">
          {currentPage > 1 && <Link href={queryForPage(currentPage - 1)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 font-medium text-slate-700"><ArrowLeft className="h-4 w-4" /> Previous</Link>}
          <span className="text-slate-600">{currentPage} / {totalPages}</span>
          {currentPage < totalPages && <Link href={queryForPage(currentPage + 1)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 font-medium text-slate-700">Next <ArrowRight className="h-4 w-4" /></Link>}
        </div>
      </footer>}
    </section>

    {canCreate && campuses.length > 0 && <section id="add-student" className="scroll-mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-slate-950">Add student</h2>
      <p className="mt-1 text-sm text-slate-500">Create a student record in one of your assigned campuses.</p>
      <form action={createEducationStudent} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm font-medium text-slate-700">Campus
          <select required name="branch_id" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Student number
          <input required name="student_number" maxLength={32} pattern="[A-Za-z0-9._/-]+" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">First name
          <input required name="first_name" maxLength={100} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Last name
          <input required name="last_name" maxLength={100} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Other names
          <input name="other_names" maxLength={100} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Email
          <input name="email" type="email" maxLength={254} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Phone
          <input name="phone" type="tel" maxLength={32} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Date of birth
          <input name="date_of_birth" type="date" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <div className="sm:col-span-2 lg:col-span-4">
          <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Save student</button>
        </div>
      </form>
    </section>}
  </main>;
}
