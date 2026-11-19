import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, Building2, MapPin, Search } from "lucide-react";
import { createEducationCampus, grantOwnEducationOrganizationScope, updateEducationCampus } from "../actions";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { getProductAppPath } from "@/lib/product-app-routes";
import { createClient } from "@/lib/supabase/server";
import { EducationRecordModal } from "@/components/education/education-record-modal";
import { EducationImportModal } from "@/components/education/education-import-modal";

export default async function EducationOrganizationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_organization", "organization", "campuses", "view")) {
    redirect("/dashboard?accessDenied=think-education.organization");
  }
  const params = await searchParams;
  const search = typeof params.search === "string" ? params.search.trim().slice(0, 80).toLowerCase() : "";
  const { campuses, hasOrganizationScope } = await getAccessibleEducationCampuses(
    context.orgId, context.userId, { includeInactive: true },
  );
  const [canCreate, canEdit, canExport, canViewMembers, canEditCampusAdmins] = await Promise.all([
    hasOrganizationScope && canTabPermission("education_organization", "organization", "campuses", "create"),
    canTabPermission("education_organization", "organization", "campuses", "edit"),
    canTabPermission("education_organization", "organization", "campuses", "export"),
    canTabPermission("education_user_management", "users", "directory", "view"),
    canTabPermission("education_user_management", "users", "branch_access", "edit"),
  ]);
  const canManageCampusAdmins = canViewMembers && canEditCampusAdmins;
  const supabase = await createClient();
  const [membersResult, scopesResult] = await Promise.all([
    canViewMembers
      ? supabase.from("organization_members")
        .select("user_id, username, contact_email, invited_email")
        .eq("org_id", context.orgId)
        .eq("status", "active")
        .not("user_id", "is", null)
        .order("username")
      : Promise.resolve({ data: [], error: null }),
    canManageCampusAdmins
      ? supabase.from("education_member_branch_scopes")
        .select("user_id, scope_type, branch_id")
        .eq("org_id", context.orgId)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (membersResult.error) throw new Error(`Could not load active Think Education administrators: ${membersResult.error.message}`);
  if (scopesResult.error) throw new Error(`Could not load Think Education campus access: ${scopesResult.error.message}`);
  const activeMembers = membersResult.data ?? [];
  const memberIds = activeMembers.flatMap((member) => member.user_id ? [member.user_id] : []);
  const { data: profiles, error: profilesError } = memberIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", memberIds)
    : { data: [], error: null };
  if (profilesError) throw new Error(`Could not load administrator names: ${profilesError.message}`);
  const profileNameById = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]));
  const memberById = new Map(activeMembers.flatMap((member) => member.user_id ? [[member.user_id, member] as const] : []));
  const memberLabelById = new Map(memberIds.map((userId) => {
    const member = memberById.get(userId);
    return [userId, profileNameById.get(userId)?.trim() || member?.username || member?.contact_email || member?.invited_email || "Member"];
  }));
  const scopesByUserId = new Map<string, Array<{ scope_type: string; branch_id: string | null }>>();
  for (const scope of scopesResult.data ?? []) {
    const userScopes = scopesByUserId.get(scope.user_id) ?? [];
    userScopes.push(scope);
    scopesByUserId.set(scope.user_id, userScopes);
  }
  const campusAdminOptions = (branchId: string) => activeMembers
    .filter((member) => member.user_id && (scopesByUserId.get(member.user_id) ?? []).some((scope) =>
      scope.scope_type === "organization" || (scope.scope_type === "branch" && scope.branch_id === branchId)
    ))
    .flatMap((member) => member.user_id ? [{
      id: member.user_id,
      label: memberLabelById.get(member.user_id) ?? "Member",
    }] : []);
  const filteredCampuses = campuses.filter((campus) =>
    !search || [campus.name, campus.code, campus.city, campus.region]
      .some((value) => value?.toLowerCase().includes(search))
  );
  const csvRows = [
    ["Campus", "Campus code", "City", "Region", "Status", "Access scope"],
    ...filteredCampuses.map((campus) => [
      campus.name,
      campus.code ?? "—",
      campus.city ?? "—",
      campus.region ?? "—",
      campus.education_status,
      hasOrganizationScope ? "Organization-wide" : "Assigned campus",
    ]),
  ];
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(csvRows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n"))}`;
  const errorMessage = params.error === "duplicate"
    ? "That campus name or code is already in use in this organization."
    : params.error === "invalid"
      ? "Check the campus details, status, and administrator assignment."
      : params.error === "not-found"
        ? "That campus no longer exists or is outside your assigned scope."
        : params.error === "save" ? "The campus could not be saved. Please try again." : null;
  const activeCampusCount = campuses.filter((campus) =>
    campus.education_status === "active" && campus.is_active
  ).length;

  return <main className="mx-auto w-full max-w-[1680px] space-y-6 p-4 md:p-6 xl:p-8">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <Link href={getProductAppPath("think-education", "/dashboard")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Organization &amp; Branch Management</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">Manage {context.orgName} campuses and their education-specific settings.</p>
      </div>
      <div className="flex gap-2">
        <Link href={getProductAppPath("think-education", "/students")} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50">
          Students <ArrowRight className="h-4 w-4" />
        </Link>
        <div className="flex flex-wrap gap-2">
          {canCreate && <EducationImportModal entity="campuses" label="campuses" columns={[
            { key: "name", label: "Campus", required: true },
            { key: "code", label: "Campus Code", required: true },
            { key: "address", label: "Address" },
            { key: "city", label: "City" },
            { key: "region", label: "Region" },
            { key: "country", label: "Country" },
            { key: "phone", label: "Phone" },
            { key: "email", label: "Email" },
          ]} />}
          {canCreate && <EducationRecordModal
            title="Add campus"
            description="Create an Education campus and register it as an organization branch."
            buttonLabel="Add campus"
            submitLabel="Create campus"
            action={createEducationCampus}
            fields={[
              { name: "name", label: "Campus name", required: true, maxLength: 120 },
              { name: "code", label: "Campus code", required: true, maxLength: 32, pattern: "[A-Za-z0-9-]+" },
              { name: "address", label: "Address", maxLength: 200 },
              { name: "city", label: "City", maxLength: 100 },
              { name: "region", label: "Region", maxLength: 100 },
              { name: "country", label: "Country", maxLength: 100 },
              { name: "phone", label: "Phone", type: "tel", maxLength: 32 },
              { name: "email", label: "Email", type: "email", maxLength: 254 },
            ]}
          />}
        </div>
      </div>
    </header>

    {params.created === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Campus created and added to your organization.</p>}
    {params.updated === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Campus details updated.</p>}
    {errorMessage && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{errorMessage}</p>}

    <section data-education-metrics className="grid gap-3 sm:grid-cols-3">
      {[
        { label: "Campuses in your access", value: campuses.length.toLocaleString(), icon: Building2 },
        { label: "Active campuses", value: activeCampusCount.toLocaleString(), icon: MapPin },
        { label: "Institution", value: context.orgName, icon: Building2 },
      ].map(({ label, value, icon: Icon }) => <article key={label} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 truncate text-xl font-bold text-slate-950">{value}</p></div>
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><Icon className="h-5 w-5" /></span>
      </article>)}
    </section>

    {campuses.length === 0 && context.role === "owner" && <section className="rounded-xl border border-blue-200 bg-blue-50 p-5">
      <h2 className="font-semibold text-blue-950">Choose your Think Education access scope</h2>
      <p className="mt-1 text-sm text-blue-900">Organization-wide access is not assigned automatically. Grant it explicitly to manage all campuses, or have an administrator assign selected branches.</p>
      <form action={grantOwnEducationOrganizationScope} className="mt-4">
        <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">Grant me access to all campuses</button>
      </form>
    </section>}

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <form method="get" action={getProductAppPath("think-education", "/organization")} className="flex flex-wrap items-end gap-3 border-b border-slate-200 bg-slate-50/70 p-4 md:p-5">
        <label className="relative min-w-[240px] flex-1">
          <span className="sr-only">Search campuses</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input name="search" defaultValue={search} placeholder="Search campus name, code, or location" className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
        </label>
        <button type="submit" className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100">Search campuses</button>
        {canExport && filteredCampuses.length > 0 && <a href={csvHref} download={`education-campuses-${new Date().toISOString().slice(0, 10)}.csv`} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Export CSV</a>}
      </form>
      {filteredCampuses.length === 0 ? <div className="p-8 text-center">
        <Building2 className="mx-auto h-10 w-10 text-slate-300" />
        <h2 className="mt-3 font-semibold text-slate-900">{campuses.length ? "No campuses match your search" : "No campuses in your assigned scope"}</h2>
        <p className="mt-1 text-sm text-slate-500">{campuses.length ? "Try another name, campus code, or location." : "Ask an authorized Think Education administrator to assign your campus access."}</p>
      </div> : <div className="overflow-x-auto">
        <table className="w-full min-w-[1120px] text-left text-sm">
          <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <tr><th className="px-4 py-3">#</th><th className="px-4 py-3">Campus</th><th className="px-4 py-3">Campus code</th><th className="px-4 py-3">Location</th><th className="px-4 py-3">Administrator</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Scope</th>{canEdit && <th className="px-4 py-3">Actions</th>}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredCampuses.map((campus, index) => <tr key={campus.id} className="transition-colors hover:bg-slate-50/80">
              <td className="whitespace-nowrap px-4 py-3 text-slate-500">{index + 1}</td>
              <td className="px-4 py-3 font-semibold text-slate-900">{campus.name}</td>
              <td className="px-4 py-3"><span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800">{campus.code ?? "—"}</span></td>
              <td className="px-4 py-3 text-slate-600">{[campus.city, campus.region].filter(Boolean).join(", ") || "—"}</td>
              <td className="px-4 py-3 text-slate-600">{canViewMembers && campus.administrator_user_id ? memberLabelById.get(campus.administrator_user_id) ?? "Former or unavailable member" : campus.administrator_user_id ? "Assigned member" : "—"}</td>
              <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${campus.education_status === "active" && campus.is_active ? "bg-emerald-50 text-emerald-800" : campus.education_status === "archived" ? "bg-slate-100 text-slate-700" : "bg-amber-50 text-amber-800"}`}>{campus.is_active ? campus.education_status : "Location inactive"}</span></td>
              <td className="px-4 py-3 text-slate-600">{hasOrganizationScope ? "Organization-wide" : "Assigned campus"}</td>
              {canEdit && <td className="px-4 py-3">
                <details className="min-w-[280px]">
                  <summary className="cursor-pointer font-semibold text-blue-700 hover:text-blue-900">Edit campus</summary>
                  <form action={updateEducationCampus} className="mt-3 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <input type="hidden" name="branch_id" value={campus.id} />
                    <label className="text-xs font-medium text-slate-600">Campus name
                      <input required name="name" maxLength={120} defaultValue={campus.name} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-normal text-slate-900" />
                    </label>
                    <label className="text-xs font-medium text-slate-600">Campus code
                      <input required name="code" maxLength={32} pattern="[A-Za-z0-9-]+" defaultValue={campus.code ?? ""} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-normal uppercase text-slate-900" />
                    </label>
                    <label className="text-xs font-medium text-slate-600">Address
                      <input name="address" maxLength={200} defaultValue={campus.address ?? ""} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-normal text-slate-900" />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-xs font-medium text-slate-600">City
                        <input name="city" maxLength={100} defaultValue={campus.city ?? ""} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-normal text-slate-900" />
                      </label>
                      <label className="text-xs font-medium text-slate-600">Region
                        <input name="region" maxLength={100} defaultValue={campus.region ?? ""} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-normal text-slate-900" />
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-xs font-medium text-slate-600">Country
                        <input name="country" maxLength={100} defaultValue={campus.country ?? ""} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-normal text-slate-900" />
                      </label>
                      <label className="text-xs font-medium text-slate-600">Phone
                        <input name="phone" type="tel" maxLength={32} defaultValue={campus.phone ?? ""} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-normal text-slate-900" />
                      </label>
                    </div>
                    <label className="text-xs font-medium text-slate-600">Email
                      <input name="email" type="email" maxLength={254} defaultValue={campus.email ?? ""} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-normal text-slate-900" />
                    </label>
                    <label className="text-xs font-medium text-slate-600">Education status
                      <select name="status" defaultValue={campus.education_status} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-normal text-slate-900">
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="archived">Archived</option>
                      </select>
                    </label>
                    {canManageCampusAdmins ? <>
                      <label className="text-xs font-medium text-slate-600">Campus administrator
                        <select name="administrator_user_id" defaultValue={campus.administrator_user_id ?? ""} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-normal text-slate-900">
                          <option value="">Unassigned</option>
                          {campus.administrator_user_id && !campusAdminOptions(campus.id).some((member) => member.id === campus.administrator_user_id)
                            && <option value={campus.administrator_user_id}>{memberLabelById.get(campus.administrator_user_id) ?? "Current assignee"}</option>}
                          {campusAdminOptions(campus.id).map((member) => <option key={member.id} value={member.id}>{member.label}</option>)}
                        </select>
                      </label>
                      <p className="text-[11px] text-slate-500">Administrators must already have Think Education access to this campus.</p>
                    </> : <input type="hidden" name="administrator_user_id" value={campus.administrator_user_id ?? ""} />}
                    <button type="submit" className="mt-1 rounded-md bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800">Save campus</button>
                  </form>
                </details>
              </td>}
            </tr>)}
          </tbody>
        </table>
      </div>}
    </section>

  </main>;
}
