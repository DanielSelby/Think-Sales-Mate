import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BriefcaseBusiness, Users } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canPermission, canTabPermission } from "@/lib/rbac/permissions";
import { isOrganizationSuperAdminMember } from "@/lib/organizations/member-access";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import { createEducationStaff } from "../actions";
import { EducationRecordModal } from "@/components/education/education-record-modal";
import { EducationImportModal } from "@/components/education/education-import-modal";

const STAFF_CATEGORIES = ["teaching", "non_teaching"] as const;
type StaffCategory = (typeof STAFF_CATEGORIES)[number];
const PAGE_SIZE = 50;

export default async function EducationStaffPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_staff", "staff", "directory", "view")) {
    redirect("/dashboard?accessDenied=think-education.staff");
  }

  const params = await searchParams;
  const search = typeof params.search === "string" ? params.search.trim().slice(0, 80) : "";
  const parsedPage = Number.parseInt(typeof params.page === "string" ? params.page : "1", 10);
  const currentPage = Number.isFinite(parsedPage) ? Math.min(1_000_000, Math.max(1, parsedPage)) : 1;
  const requestedBranch = typeof params.branch === "string" ? params.branch : "";
  const requestedCategory = typeof params.category === "string" ? params.category : "";
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const allowedBranchIds = campuses.map((campus) => campus.id);
  const selectedBranch = allowedBranchIds.includes(requestedBranch) ? requestedBranch : "";
  const selectedCategory: StaffCategory | "" = STAFF_CATEGORIES.includes(requestedCategory as StaffCategory)
    ? (requestedCategory as StaffCategory)
    : "";
  const branchIds = selectedBranch ? [selectedBranch] : allowedBranchIds;
  const [canCreate, canImportCapability, canExport] = await Promise.all([
    canTabPermission("education_staff", "staff", "directory", "create"),
    canPermission("education_staff", "import"),
    canTabPermission("education_staff", "staff", "directory", "export"),
  ]);
  const canImport = canImportCapability && canCreate;
  const canCreateAccount = isOrganizationSuperAdminMember({
    role: context.role,
    userId: context.userId,
    accessPermissions: context.accessPermissions,
  });
  const supabase = await createClient();
  let staff: Array<{
    id: string;
    staff_number: string;
    first_name: string;
    last_name: string;
    branch_id: string;
    staff_category: string;
    job_title: string | null;
    email: string | null;
    status: string;
    photo_path: string | null;
  }> = [];
  let staffTotalCount = 0;
  let teachingStaffCount = 0;
  if (branchIds.length) {
    const safeSearch = search.replace(/[^A-Za-z0-9\s_-]/g, "");
    let query = supabase.from("education_staff")
      .select("id, staff_number, first_name, last_name, branch_id, staff_category, job_title, email, status, photo_path", { count: "exact" })
      .eq("org_id", context.orgId).in("branch_id", branchIds);
    if (selectedCategory) query = query.eq("staff_category", selectedCategory);
    if (safeSearch) {
      const pattern = `%${safeSearch}%`;
      query = query.or(`staff_number.ilike.${pattern},first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern}`);
    }
    let teachingQuery = supabase.from("education_staff").select("id", { count: "exact", head: true })
      .eq("org_id", context.orgId).in("branch_id", branchIds).eq("staff_category", "teaching");
    if (safeSearch) {
      const pattern = `%${safeSearch}%`;
      teachingQuery = teachingQuery.or(`staff_number.ilike.${pattern},first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern}`);
    }
    const [{ data, count, error }, teachingCountResult] = await Promise.all([
      query.order("last_name").order("first_name").order("id")
        .range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1),
      selectedCategory === "non_teaching"
        ? Promise.resolve({ count: 0, error: null })
        : teachingQuery,
    ]);
    if (error) throw new Error(`Could not load Think Education staff: ${error.message}`);
    if (teachingCountResult.error) throw new Error(`Could not count Think Education teaching staff: ${teachingCountResult.error.message}`);
    staff = data ?? [];
    staffTotalCount = count ?? 0;
    teachingStaffCount = teachingCountResult.count ?? 0;
  }
  const totalPages = Math.max(1, Math.ceil(staffTotalCount / PAGE_SIZE));
  const pageHref = (page: number) => {
    const query = new URLSearchParams();
    if (search) query.set("search", search);
    if (selectedBranch) query.set("branch", selectedBranch);
    if (selectedCategory) query.set("category", selectedCategory);
    query.set("page", String(page));
    return `${getProductAppPath("think-education", "/staff")}?${query.toString()}`;
  };
  if (currentPage > totalPages) redirect(pageHref(totalPages));
  const staffPhotoUrlById = new Map<string, string>();
  const staffIdByPhotoPath = new Map(staff.flatMap((member) => member.photo_path ? [[member.photo_path, member.id] as const] : []));
  const staffPhotoPaths = [...staffIdByPhotoPath.keys()];
  for (let offset = 0; offset < staffPhotoPaths.length; offset += 100) {
    const { data: signedPhotos, error: signedPhotosError } = await supabase.storage
      .from("education-staff-images")
      .createSignedUrls(staffPhotoPaths.slice(offset, offset + 100), 60 * 60);
    if (signedPhotosError) {
      console.error("Could not load Think Education staff directory photos:", signedPhotosError.message);
      throw new Error("Staff profile photos could not be loaded.");
    }
    for (const photo of signedPhotos ?? []) {
      const staffId = photo.path ? staffIdByPhotoPath.get(photo.path) : undefined;
      if (photo.error) {
        console.error("Could not load a Think Education staff directory photo:", photo.error);
      } else if (staffId && photo.signedUrl) {
        staffPhotoUrlById.set(staffId, photo.signedUrl);
      }
    }
  }
  const staffIds = staff.map((member) => member.id);
  const classNamesByTeacher = new Map<string, string[]>();
  for (let offset = 0; offset < staffIds.length; offset += 100) {
    const { data: teacherClasses, error: teacherClassesError } = await supabase.from("education_classes")
      .select("class_teacher_id, name")
      .eq("org_id", context.orgId)
      .in("branch_id", branchIds)
      .in("class_teacher_id", staffIds.slice(offset, offset + 100))
      .eq("status", "active")
      .order("name");
    if (teacherClassesError) throw new Error(`Could not load staff class assignments: ${teacherClassesError.message}`);
    for (const classroom of teacherClasses ?? []) {
      if (!classroom.class_teacher_id) continue;
      classNamesByTeacher.set(classroom.class_teacher_id, [
        ...(classNamesByTeacher.get(classroom.class_teacher_id) ?? []),
        classroom.name,
      ]);
    }
  }
  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const exportParams = new URLSearchParams();
  if (search) exportParams.set("search", search);
  if (selectedBranch) exportParams.set("branch", selectedBranch);
  if (selectedCategory) exportParams.set("category", selectedCategory);
  const exportHref = `/api/education/staff/export?${exportParams.toString()}`;
  const errorMessage = params.error === "duplicate"
    ? "That staff number is already in use in this organization."
    : params.error === "invalid"
      ? "Check the staff number, name, category, and email fields."
      : params.error === "save" ? "The staff record could not be saved. Please try again." : null;

  return <main className="mx-auto w-full max-w-[1680px] space-y-6 p-4 md:p-6 xl:p-8">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <Link href={getProductAppPath("think-education", "/dashboard")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Staff Management</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">Manage teaching and non-teaching staff within your assigned campuses.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {canImport && campuses.length > 0 && <EducationImportModal entity="staff" label="staff" columns={[
          { key: "campus", label: "Campus", required: true },
          { key: "staff_number", label: "Staff Number" },
          { key: "first_name", label: "First Name", required: true },
          { key: "last_name", label: "Last Name", required: true },
          { key: "staff_category", label: "Category", required: true },
          { key: "job_title", label: "Job Title" },
          { key: "email", label: "Email" },
          { key: "phone", label: "Phone" },
        ]} />}
        {canCreate && campuses.length > 0 && <EducationRecordModal
          title="Add staff member"
          description="Staff numbers are generated automatically. Optionally provision a linked login."
          buttonLabel="Add staff member"
          submitLabel="Save staff member"
          action={createEducationStaff}
          canCreateAccount={canCreateAccount}
          accountRoles={[
            { value: "education_teacher", label: "Teacher" },
            { value: "education_registrar", label: "Registrar" },
            { value: "education_accountant", label: "Education Accountant" },
            { value: "education_librarian", label: "Librarian" },
          ]}
          fields={[
            { name: "branch_id", label: "Campus", type: "select", required: true, options: campuses.map((campus) => ({ value: campus.id, label: campus.name })) },
            { name: "first_name", label: "First name", required: true, maxLength: 100 },
            { name: "last_name", label: "Last name", required: true, maxLength: 100 },
            { name: "staff_category", label: "Category", type: "select", required: true, options: [
              { value: "teaching", label: "Teaching" },
              { value: "non_teaching", label: "Non-teaching" },
            ] },
            { name: "job_title", label: "Job title", maxLength: 120 },
            { name: "email", label: "Email", type: "email", maxLength: 254 },
            { name: "phone", label: "Phone", type: "tel", maxLength: 32 },
          ]}
        />}
      </div>
    </header>

    {params.created === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Staff record created.</p>}
    {errorMessage && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{errorMessage}</p>}

    <section data-education-metrics className="grid gap-3 sm:grid-cols-3">
      {[
        { label: "Staff in results", value: staffTotalCount.toLocaleString(), icon: Users },
        { label: "Teaching in results", value: teachingStaffCount.toLocaleString(), icon: BriefcaseBusiness },
        { label: "Campuses in your access", value: campuses.length.toLocaleString(), icon: Users },
      ].map(({ label, value, icon: Icon }) => <article key={label} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-950">{value}</p></div>
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><Icon className="h-5 w-5" /></span>
      </article>)}
    </section>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <form method="get" action={getProductAppPath("think-education", "/staff")} className="grid gap-3 border-b border-slate-200 bg-slate-50/70 p-4 md:grid-cols-[minmax(220px,1fr)_220px_220px_auto_auto] md:p-5">
        <label className="relative block">
          <span className="sr-only">Search staff by name or number</span>
          <Users className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input name="search" defaultValue={search} placeholder="Search name or staff number" className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
        </label>
        <select name="branch" defaultValue={selectedBranch} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">
          <option value="">All assigned campuses</option>
          {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
        </select>
        <select name="category" defaultValue={selectedCategory} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">
          <option value="">All categories</option>
          {STAFF_CATEGORIES.map((category) => <option key={category} value={category}>{category.replace("_", " ")}</option>)}
        </select>
        <button type="submit" className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100">Apply filters</button>
        {canExport && staffTotalCount > 0 && <a href={exportHref} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Export CSV</a>}
      </form>
      {campuses.length === 0 ? <div className="p-8 text-center">
        <Users className="mx-auto h-10 w-10 text-slate-300" />
        <h2 className="mt-3 font-semibold text-slate-900">No campus access assigned</h2>
        <p className="mt-1 text-sm text-slate-500">Ask an authorized Think Education administrator to assign your campus scope.</p>
      </div> : staff.length === 0 ? <div className="p-8 text-center">
        <Users className="mx-auto h-10 w-10 text-slate-300" />
        <h2 className="mt-3 font-semibold text-slate-900">No staff records match your filters</h2>
        <p className="mt-1 text-sm text-slate-500">Add staff members or adjust the current filters.</p>
      </div> : <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <tr><th className="px-4 py-3">Staff ID</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Class(es)</th><th className="px-4 py-3">Campus</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3">Status</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {staff.map((member) => <tr key={member.id} className="transition-colors hover:bg-slate-50/80">
              <td className="whitespace-nowrap px-4 py-3 font-semibold text-blue-800">{member.staff_number}</td>
              <td className="px-4 py-3 font-medium"><Link href={getProductAppPath("think-education", `/staff/${member.id}`)} className="inline-flex items-center gap-3 text-blue-800 hover:underline">
                <span
                  role="img"
                  aria-label={`${member.first_name} ${member.last_name} photo`}
                  className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-slate-200 bg-blue-50 bg-cover bg-center text-xs font-semibold text-blue-700"
                  style={staffPhotoUrlById.get(member.id) ? { backgroundImage: `url(${JSON.stringify(staffPhotoUrlById.get(member.id))})` } : undefined}
                >
                  {!staffPhotoUrlById.has(member.id) && `${member.first_name[0] ?? ""}${member.last_name[0] ?? ""}`.toUpperCase()}
                </span>
                <span>{member.first_name} {member.last_name}</span>
              </Link></td>
              <td className="px-4 py-3 capitalize text-slate-600">{member.staff_category.replace("_", " ")}</td>
              <td className="px-4 py-3 text-slate-600">{member.job_title || "—"}</td>
              <td className="px-4 py-3 text-slate-600">{classNamesByTeacher.get(member.id)?.join(", ") || "—"}</td>
              <td className="px-4 py-3 text-slate-600">{campusNameById.get(member.branch_id) ?? "Campus"}</td>
              <td className="px-4 py-3 text-slate-600">{member.email || "—"}</td>
              <td className="px-4 py-3"><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold capitalize text-emerald-800">{member.status.replace("_", " ")}</span></td>
            </tr>)}
          </tbody>
        </table>
      </div>}
      {staffTotalCount > 0 && <nav aria-label="Staff pages" className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm">
        <p className="text-slate-600">Showing {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, staffTotalCount)} of {staffTotalCount.toLocaleString()} staff</p>
        <div className="flex items-center gap-2">
          <Link aria-disabled={currentPage === 1} href={pageHref(Math.max(1, currentPage - 1))} className={`rounded-lg border px-3 py-1.5 font-medium ${currentPage === 1 ? "pointer-events-none opacity-40" : "hover:bg-slate-50"}`}>Previous</Link>
          <span className="text-slate-600">Page {currentPage} of {totalPages}</span>
          <Link aria-disabled={currentPage === totalPages} href={pageHref(Math.min(totalPages, currentPage + 1))} className={`rounded-lg border px-3 py-1.5 font-medium ${currentPage === totalPages ? "pointer-events-none opacity-40" : "hover:bg-slate-50"}`}>Next</Link>
        </div>
      </nav>}
    </section>

  </main>;
}
