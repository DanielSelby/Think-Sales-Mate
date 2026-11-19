import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Building2 } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import { saveEducationDepartment } from "../../actions";

type DepartmentType = "academic" | "administrative" | "support";

const DEPARTMENT_TYPES: { value: DepartmentType; label: string }[] = [
  { value: "academic", label: "Academic" },
  { value: "administrative", label: "Administrative" },
  { value: "support", label: "Support" },
];

export default async function EducationDepartmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_academics", "academics", "departments", "view")) {
    redirect("/dashboard?accessDenied=think-education.departments");
  }

  const params = await searchParams;
  const { campuses, hasOrganizationScope } = await getAccessibleEducationCampuses(
    context.orgId,
    context.userId,
    { includeInactive: true },
  );
  const branchIds = campuses.map((campus) => campus.id);
  const supabase = await createClient();
  const [globalResult, campusResult, canCreate, canEdit] = await Promise.all([
    hasOrganizationScope
      ? supabase.from("education_departments")
        .select("id, branch_id, name, department_type, is_active")
        .eq("org_id", context.orgId).is("branch_id", null).order("name")
      : Promise.resolve({ data: [], error: null }),
    branchIds.length
      ? supabase.from("education_departments")
        .select("id, branch_id, name, department_type, is_active")
        .eq("org_id", context.orgId).in("branch_id", branchIds).order("name")
      : Promise.resolve({ data: [], error: null }),
    canTabPermission("education_academics", "academics", "departments", "create"),
    canTabPermission("education_academics", "academics", "departments", "edit"),
  ]);
  if (globalResult.error) throw new Error(`Could not load organization departments: ${globalResult.error.message}`);
  if (campusResult.error) throw new Error(`Could not load campus departments: ${campusResult.error.message}`);

  const departments = [...(globalResult.data ?? []), ...(campusResult.data ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name));
  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const activeCampuses = campuses.filter(
    (campus) => campus.education_status === "active" && campus.is_active,
  );
  const errorMessage = params.error === "duplicate"
    ? "A department with those details already exists."
    : params.error === "invalid"
      ? "Check the department name, type, and campus."
      : params.error === "not-found"
        ? "That department is no longer available."
        : params.error === "save"
          ? "The department could not be saved. Please try again."
          : null;

  return <main className="mx-auto w-full max-w-[1440px] space-y-6 p-4 md:p-6 xl:p-8">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <Link href={getProductAppPath("think-education", "/academics")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
          <ArrowLeft className="h-4 w-4" /> Academic Management
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Departments</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">Manage academic, administrative, and support departments across your authorized campuses.</p>
      </div>
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
        <Building2 className="h-5 w-5 text-blue-700" />
        <span><strong className="text-slate-900">{departments.length}</strong> departments in your access scope</span>
      </div>
    </header>

    {params.saved === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Department saved.</p>}
    {errorMessage && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{errorMessage}</p>}

    {canCreate && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-bold text-slate-950">Create department</h2>
      <p className="mt-1 text-sm text-slate-500">Departments can be organization-wide or assigned to one active campus.</p>
      <form action={saveEducationDepartment} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <input type="hidden" name="department_id" value="" />
        <input type="hidden" name="is_active" value="true" />
        <label className="space-y-1 text-sm font-medium text-slate-700">
          <span>Department name</span>
          <input required maxLength={120} name="name" className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="e.g. Mathematics" />
        </label>
        <label className="space-y-1 text-sm font-medium text-slate-700">
          <span>Type</span>
          <select name="department_type" defaultValue="academic" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
            {DEPARTMENT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium text-slate-700">
          <span>Campus scope</span>
          <select name="branch_id" defaultValue={hasOrganizationScope ? "" : activeCampuses[0]?.id ?? ""} required={!hasOrganizationScope} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
            {hasOrganizationScope && <option value="">All campuses (organization-wide)</option>}
            {activeCampuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
        </label>
        <div className="flex items-end">
          <button type="submit" className="w-full rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Create department</button>
        </div>
      </form>
    </section>}

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="font-bold text-slate-950">Department register</h2>
        <p className="mt-1 text-sm text-slate-500">Inactive departments remain available for historical references and can be reactivated.</p>
      </div>
      {departments.length === 0
        ? <p className="p-6 text-sm text-slate-500">No departments are available in your current access scope.</p>
        : <div className="divide-y divide-slate-100">
          {departments.map((department) => <form key={department.id} action={saveEducationDepartment} className="grid gap-3 px-5 py-4 md:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr_0.8fr_auto] xl:items-end">
            <input type="hidden" name="department_id" value={department.id} />
            <input type="hidden" name="branch_id" value={department.branch_id ?? ""} />
            <label className="space-y-1 text-sm font-medium text-slate-700">
              <span>Department name</span>
              <input required maxLength={120} name="name" defaultValue={department.name} disabled={!canEdit} className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-50 disabled:text-slate-500" />
            </label>
            <label className="space-y-1 text-sm font-medium text-slate-700">
              <span>Type</span>
              <select name="department_type" defaultValue={department.department_type} disabled={!canEdit} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 disabled:bg-slate-50 disabled:text-slate-500">
                {DEPARTMENT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
            </label>
            <div className="space-y-1 text-sm">
              <span className="block font-medium text-slate-700">Campus</span>
              <span className="block rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600">
                {department.branch_id ? campusNameById.get(department.branch_id) ?? "Campus outside current scope" : "All campuses"}
              </span>
            </div>
            <label className="space-y-1 text-sm font-medium text-slate-700">
              <span>Status</span>
              <select name="is_active" defaultValue={department.is_active ? "true" : "false"} disabled={!canEdit} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 disabled:bg-slate-50 disabled:text-slate-500">
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </label>
            {canEdit && <button type="submit" className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100">Save</button>}
          </form>)}
        </div>}
    </section>
  </main>;
}
