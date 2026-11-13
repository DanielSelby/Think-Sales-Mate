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
  const requestedBranch = typeof params.branch === "string" ? params.branch : "";
  const requestedCategory = typeof params.category === "string" ? params.category : "";
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const allowedBranchIds = campuses.map((campus) => campus.id);
  const selectedBranch = allowedBranchIds.includes(requestedBranch) ? requestedBranch : "";
  const selectedCategory: StaffCategory | "" = STAFF_CATEGORIES.includes(requestedCategory as StaffCategory)
    ? (requestedCategory as StaffCategory)
    : "";
  const branchIds = selectedBranch ? [selectedBranch] : allowedBranchIds;
  const [canCreate, canImportCapability] = await Promise.all([
    canTabPermission("education_staff", "staff", "directory", "create"),
    canPermission("education_staff", "import"),
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
  }> = [];
  if (branchIds.length) {
    let query = supabase.from("education_staff")
      .select("id, staff_number, first_name, last_name, branch_id, staff_category, job_title, email, status")
      .eq("org_id", context.orgId).in("branch_id", branchIds);
    if (selectedCategory) query = query.eq("staff_category", selectedCategory);
    if (search) {
      const safeSearch = search.replace(/[^A-Za-z0-9\s_-]/g, "");
      if (safeSearch) {
        const pattern = `%${safeSearch}%`;
        query = query.or(`staff_number.ilike.${pattern},first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern}`);
      }
    }
    const { data, error } = await query.order("last_name").order("first_name");
    if (error) throw new Error(`Could not load Think Education staff: ${error.message}`);
    staff = data ?? [];
  }
  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const csvRows = [
    ["Staff ID", "Name", "Campus", "Category", "Role", "Contact", "Status"],
    ...staff.map((member) => [
      member.staff_number,
      `${member.first_name} ${member.last_name}`.trim(),
      campusNameById.get(member.branch_id) ?? member.branch_id,
      member.staff_category.replace("_", " "),
      member.job_title || "—",
      member.email || "—",
      member.status.replace("_", " "),
    ]),
  ];
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(csvRows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n"))}`;
  const errorMessage = params.error === "duplicate"
    ? "That staff number is already in use in this organization."
    : params.error === "invalid"
      ? "Check the staff number, name, category, and email fields."
      : params.error === "save" ? "The staff record could not be saved. Please try again." : null;

  return <main className="mx-auto max-w-[1500px] space-y-5 p-4 md:p-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <Link href={getProductAppPath("think-education", "/dashboard")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">Staff Management</h1>
        <p className="mt-1 text-sm text-slate-600">Manage teaching and non-teaching staff within your assigned campuses.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {canImport && campuses.length > 0 && <EducationImportModal entity="staff" label="staff" columns={[
          { key: "campus", label: "Campus", required: true },
          { key: "staff_number", label: "Staff Number", required: true },
          { key: "first_name", label: "First Name", required: true },
          { key: "last_name", label: "Last Name", required: true },
          { key: "staff_category", label: "Category", required: true },
          { key: "job_title", label: "Job Title" },
          { key: "email", label: "Email" },
          { key: "phone", label: "Phone" },
        ]} />}
        {canCreate && campuses.length > 0 && <EducationRecordModal
          title="Add staff member"
          description="Create an Education staff record and optionally provision a linked login."
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
            { name: "staff_number", label: "Staff number", required: true, maxLength: 32, pattern: "[A-Za-z0-9._/-]+" },
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

    <section className="grid gap-3 sm:grid-cols-3">
      {[
        { label: "Staff members", value: staff.length.toLocaleString(), icon: Users },
        { label: "Teaching staff", value: staff.filter((member) => member.staff_category === "teaching").length.toLocaleString(), icon: BriefcaseBusiness },
        { label: "Campuses in your access", value: campuses.length.toLocaleString(), icon: Users },
      ].map(({ label, value, icon: Icon }) => <article key={label} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-950">{value}</p></div>
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><Icon className="h-5 w-5" /></span>
      </article>)}
    </section>

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <form method="get" action={getProductAppPath("think-education", "/staff")} className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-[minmax(220px,1fr)_220px_220px_auto_auto]">
        <label className="relative block">
          <span className="sr-only">Search staff by name or number</span>
          <Users className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input name="search" defaultValue={search} placeholder="Search name or staff number" className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
        </label>
        <select name="branch" defaultValue={selectedBranch} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">All assigned campuses</option>
          {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
        </select>
        <select name="category" defaultValue={selectedCategory} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">All categories</option>
          {STAFF_CATEGORIES.map((category) => <option key={category} value={category}>{category.replace("_", " ")}</option>)}
        </select>
        <button type="submit" className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100">Apply filters</button>
        {staff.length > 0 && <a href={csvHref} download={`education-staff-${new Date().toISOString().slice(0, 10)}.csv`} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Export CSV</a>}
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
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-4 py-3">Staff ID</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Campus</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3">Status</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {staff.map((member) => <tr key={member.id} className="hover:bg-slate-50/70">
              <td className="whitespace-nowrap px-4 py-3 font-semibold text-blue-800">{member.staff_number}</td>
              <td className="px-4 py-3 font-medium"><Link href={getProductAppPath("think-education", `/staff/${member.id}`)} className="text-blue-800 hover:underline">{member.first_name} {member.last_name}</Link></td>
              <td className="px-4 py-3 capitalize text-slate-600">{member.staff_category.replace("_", " ")}</td>
              <td className="px-4 py-3 text-slate-600">{member.job_title || "—"}</td>
              <td className="px-4 py-3 text-slate-600">{campusNameById.get(member.branch_id) ?? "Campus"}</td>
              <td className="px-4 py-3 text-slate-600">{member.email || "—"}</td>
              <td className="px-4 py-3"><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold capitalize text-emerald-800">{member.status.replace("_", " ")}</span></td>
            </tr>)}
          </tbody>
        </table>
      </div>}
    </section>

  </main>;
}
