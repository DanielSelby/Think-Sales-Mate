import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, Search, Users2 } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import { createEducationGuardianLink, linkEducationGuardianToStudent, verifyEducationGuardianLink } from "../actions";

const PAGE_SIZE = 50;
const STUDENT_PICKER_SIZE = 100;
type RelationshipStatus = "pending" | "verified" | "rejected" | "revoked";

export default async function EducationGuardiansPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");

  const [canViewGuardians, canCreateGuardian, canVerifyGuardians, canViewStudents] = await Promise.all([
    canTabPermission("education_guardians", "guardians", "directory", "view"),
    canTabPermission("education_guardians", "guardians", "directory", "create"),
    canTabPermission("education_guardians", "guardians", "relationships", "edit"),
    canTabPermission("education_students", "students", "list", "view"),
  ]);
  if (!canViewGuardians || !canViewStudents) {
    redirect("/dashboard?accessDenied=think-education.guardians");
  }

  const params = await searchParams;
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const campusIds = campuses.map((campus) => campus.id);
  const requestedBranch = typeof params.branch === "string" ? params.branch : "";
  const selectedBranch = campusIds.includes(requestedBranch) ? requestedBranch : "";
  const branchIds = selectedBranch ? [selectedBranch] : campusIds;
  const statusFilter = ["pending", "verified", "rejected", "revoked"].includes(String(params.status))
    ? params.status as RelationshipStatus
    : "";
  const currentPage = Math.min(1_000_000, Math.max(1, Number.parseInt(
    typeof params.page === "string" ? params.page : "1", 10
  ) || 1));
  const studentSearch = typeof params.studentSearch === "string"
    ? params.studentSearch.replace(/[^A-Za-z0-9\s_-]/g, "").trim().slice(0, 60)
    : "";
  const supabase = await createClient();

  let relationshipRows: Array<{
    id: string;
    branch_id: string;
    student_id: string;
    guardian_id: string;
    relationship: string;
    is_primary: boolean;
    status: RelationshipStatus;
    created_at: string;
  }> = [];
  let totalCount = 0;
  if (branchIds.length) {
    let countQuery = supabase.from("education_student_guardians")
      .select("id", { count: "exact", head: true })
      .eq("org_id", context.orgId)
      .in("branch_id", branchIds);
    let relationshipsQuery = supabase.from("education_student_guardians")
      .select("id, branch_id, student_id, guardian_id, relationship, is_primary, status, created_at")
      .eq("org_id", context.orgId)
      .in("branch_id", branchIds)
      .order("created_at", { ascending: false })
      .range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1);
    if (statusFilter) {
      countQuery = countQuery.eq("status", statusFilter);
      relationshipsQuery = relationshipsQuery.eq("status", statusFilter);
    }
    const [{ count, error: countError }, { data, error: relationshipsError }] = await Promise.all([
      countQuery,
      relationshipsQuery,
    ]);
    if (countError) throw new Error(`Could not count guardian relationships: ${countError.message}`);
    if (relationshipsError) throw new Error(`Could not load guardian relationships: ${relationshipsError.message}`);
    totalCount = count ?? 0;
    relationshipRows = data ?? [];
  }

  const linkedStudentIds = Array.from(new Set(relationshipRows.map((row) => row.student_id)));
  const guardianIds = Array.from(new Set(relationshipRows.map((row) => row.guardian_id)));
  const [
    { data: linkedStudents, error: linkedStudentsError },
    { data: guardians, error: guardiansError },
  ] = await Promise.all([
    linkedStudentIds.length
      ? supabase.from("education_students")
        .select("id, branch_id, student_number, first_name, last_name")
        .eq("org_id", context.orgId)
        .in("branch_id", branchIds)
        .in("id", linkedStudentIds)
      : { data: [], error: null },
    guardianIds.length
      ? supabase.from("education_guardians")
        .select("id, first_name, last_name, email, phone, status")
        .eq("org_id", context.orgId)
        .in("id", guardianIds)
      : { data: [], error: null },
  ]);
  if (linkedStudentsError) throw new Error(`Could not load students in guardian relationships: ${linkedStudentsError.message}`);
  if (guardiansError) throw new Error(`Could not load guardian profiles: ${guardiansError.message}`);

  const studentById = new Map((linkedStudents ?? []).map((student) => [student.id, student]));
  const guardianById = new Map((guardians ?? []).map((guardian) => [guardian.id, guardian]));
  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));

  let pickerQuery = supabase.from("education_students")
    .select("id, branch_id, student_number, first_name, last_name")
    .eq("org_id", context.orgId)
    .in("branch_id", branchIds)
    .eq("status", "active")
    .order("last_name")
    .order("first_name")
    .limit(STUDENT_PICKER_SIZE);
  if (studentSearch) {
    const pattern = `%${studentSearch}%`;
    pickerQuery = pickerQuery.or(`student_number.ilike.${pattern},first_name.ilike.${pattern},last_name.ilike.${pattern}`);
  }
  const { data: studentsForPicker, error: pickerError } = branchIds.length
    ? await pickerQuery
    : { data: [], error: null };
  if (pickerError) throw new Error(`Could not load students for guardian linking: ${pickerError.message}`);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const queryForPage = (page: number) => {
    const query = new URLSearchParams();
    if (selectedBranch) query.set("branch", selectedBranch);
    if (statusFilter) query.set("status", statusFilter);
    if (page > 1) query.set("page", String(page));
    const suffix = query.toString();
    return `${getProductAppPath("think-education", "/guardians")}${suffix ? `?${suffix}` : ""}`;
  };
  if (currentPage > totalPages) redirect(queryForPage(totalPages));

  const errorMessage = params.error === "invalid"
    ? "Choose an active student and enter valid guardian details."
    : params.error === "duplicate"
      ? "This guardian is already linked to that student."
      : params.error === "verify-blocked"
        ? "Only pending guardian relationships can be verified."
        : params.error === "not-found"
          ? "The guardian relationship could not be found."
          : params.error === "save"
            ? "The guardian change could not be saved. Please try again."
            : null;

  return <main className="mx-auto max-w-[1400px] space-y-5 p-4 md:p-6">
    <header>
      <Link href={getProductAppPath("think-education", "/dashboard")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-950">Parents & Guardians</h1>
      <p className="mt-1 text-sm text-slate-600">Manage guardian profiles and verify their relationships to students within your authorized campuses.</p>
    </header>

    {params.created === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Guardian profile created. The student relationship is pending verification.</p>}
    {params.linked === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Student linked to the guardian profile. The relationship is pending verification.</p>}
    {params.verified === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Guardian relationship verified and recorded in the audit log.</p>}
    {errorMessage && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{errorMessage}</p>}

    {canCreateGuardian && <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-slate-950">Add guardian and link student</h2>
      <p className="mt-1 text-sm text-slate-500">New relationships remain pending until an authorized user verifies them.</p>
      {campuses.length === 0 ? <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">You need an assigned campus before you can link a guardian to a student.</p> : <>
        <form method="get" action={getProductAppPath("think-education", "/guardians")} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium text-slate-700">Student search
            <input name="studentSearch" defaultValue={studentSearch} placeholder="Name or student number" className="mt-1 block min-w-64 rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <label className="text-sm font-medium text-slate-700">Campus
            <select name="branch" defaultValue={selectedBranch} className="mt-1 block min-w-52 rounded-lg border border-slate-300 px-3 py-2 font-normal">
              <option value="">All assigned campuses</option>
              {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
            </select>
          </label>
          <button type="submit" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Search className="h-4 w-4" /> Find students</button>
        </form>

        <form action={createEducationGuardianLink} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">Student
            <select required name="student_id" defaultValue="" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
              <option value="" disabled>{studentsForPicker?.length ? "Select an active student" : "No matching active students"}</option>
              {(studentsForPicker ?? []).map((student) => <option key={student.id} value={student.id} data-branch={student.branch_id}>
                {student.first_name} {student.last_name} · {student.student_number} · {campusNameById.get(student.branch_id) ?? "Campus"}
              </option>)}
            </select>
            {(studentsForPicker?.length ?? 0) === STUDENT_PICKER_SIZE && <span className="mt-1 block text-xs text-slate-500">Showing the first {STUDENT_PICKER_SIZE} matches. Search by name or number to narrow the list.</span>}
          </label>
          <label className="text-sm font-medium text-slate-700">Relationship
            <select required name="relationship" defaultValue="" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
              <option value="" disabled>Select relationship</option>
              {["Mother", "Father", "Guardian", "Grandparent", "Other"].map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">First name
            <input required name="first_name" maxLength={100} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <label className="text-sm font-medium text-slate-700">Last name
            <input required name="last_name" maxLength={100} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <label className="text-sm font-medium text-slate-700">Email
            <input name="email" type="email" maxLength={254} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <label className="text-sm font-medium text-slate-700">Phone
            <input name="phone" type="tel" maxLength={40} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
            <input type="checkbox" name="is_primary" className="rounded border-slate-300" />
            Primary contact for this student
          </label>
          <div className="lg:col-span-4">
            <button type="submit" disabled={!studentsForPicker?.length} className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">Create pending guardian link</button>
          </div>
        </form>
      </>}
    </section>}

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <form method="get" action={getProductAppPath("think-education", "/guardians")} className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-[1fr_1fr_auto]">
        <label className="text-sm font-medium text-slate-700">Campus
          <select name="branch" defaultValue={selectedBranch} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">All assigned campuses</option>
            {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Relationship status
          <select name="status" defaultValue={statusFilter} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">All statuses</option>
            {(["pending", "verified", "rejected", "revoked"] as const).map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </label>
        <button type="submit" className="self-end rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100">Apply filters</button>
      </form>
      {relationshipRows.length ? <div className="divide-y divide-slate-100">
        {relationshipRows.map((row) => {
          const student = studentById.get(row.student_id);
          const guardian = guardianById.get(row.guardian_id);
          return <article key={row.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><Users2 className="h-5 w-5" /></span>
              <div>
                <p className="font-semibold text-slate-950">{guardian ? `${guardian.first_name} ${guardian.last_name}` : "Guardian"}</p>
                <p className="mt-1 text-sm text-slate-600">{student ? `${student.first_name} ${student.last_name} · ${student.student_number}` : "Student record unavailable"} · {row.relationship}</p>
                <p className="mt-1 text-xs text-slate-500">{campusNameById.get(row.branch_id) ?? "Campus"}{row.is_primary ? " · Primary contact" : ""}{guardian?.email ? ` · ${guardian.email}` : ""}{guardian?.phone ? ` · ${guardian.phone}` : ""}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                row.status === "verified" ? "bg-emerald-50 text-emerald-700" : row.status === "pending" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"
              }`}>{row.status}</span>
              {row.status === "pending" && canVerifyGuardians && <form action={verifyEducationGuardianLink}>
                <input type="hidden" name="relationship_id" value={row.id} />
                <button type="submit" className="inline-flex items-center gap-1 rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800"><CheckCircle2 className="h-4 w-4" /> Verify</button>
              </form>}
            </div>
            {canCreateGuardian && guardian?.status === "active" && <form action={linkEducationGuardianToStudent} className="flex w-full flex-wrap items-end gap-3 border-t border-slate-100 pt-3">
              <input type="hidden" name="guardian_id" value={guardian.id} />
              <label className="min-w-60 flex-1 text-sm font-medium text-slate-700">Link another student
                <select required name="student_id" defaultValue="" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
                  <option value="" disabled>{studentsForPicker?.length ? "Select an active student" : "No matching active students"}</option>
                  {(studentsForPicker ?? []).filter((option) => option.id !== row.student_id).map((option) => <option key={option.id} value={option.id}>
                    {option.first_name} {option.last_name} · {option.student_number} · {campusNameById.get(option.branch_id) ?? "Campus"}
                  </option>)}
                </select>
              </label>
              <label className="min-w-40 text-sm font-medium text-slate-700">Relationship
                <select required name="relationship" defaultValue={row.relationship} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
                  {["Mother", "Father", "Guardian", "Grandparent", "Other"].map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <button type="submit" disabled={!studentsForPicker?.some((option) => option.id !== row.student_id)} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50">Link student</button>
            </form>}
          </article>;
        })}
      </div> : <div className="p-8 text-center">
        <Users2 className="mx-auto h-10 w-10 text-slate-300" />
        <p className="mt-3 font-medium text-slate-800">No guardian relationships found</p>
        <p className="mt-1 text-sm text-slate-500">Add a guardian relationship or adjust the campus and status filters.</p>
      </div>}
      {totalCount > PAGE_SIZE && <nav aria-label="Guardian relationship pages" className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
        <p className="text-slate-500">Showing {Math.min(totalCount, (currentPage - 1) * PAGE_SIZE + 1)}–{Math.min(totalCount, currentPage * PAGE_SIZE)} of {totalCount} relationships</p>
        <div className="flex gap-2">
          {currentPage > 1 && <Link href={queryForPage(currentPage - 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">Previous</Link>}
          {currentPage < totalPages && <Link href={queryForPage(currentPage + 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">Next</Link>}
        </div>
      </nav>}
    </section>
  </main>;
}
