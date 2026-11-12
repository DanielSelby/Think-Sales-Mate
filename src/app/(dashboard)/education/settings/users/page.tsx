import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Users2 } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import { grantEducationMemberBranchScope, revokeEducationMemberBranchScope } from "../../actions";

type EducationScope = {
  user_id: string;
  scope_type: "organization" | "branch";
  branch_id: string | null;
};

export default async function EducationUserAccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_user_management", "users", "directory", "view")) {
    redirect("/dashboard?accessDenied=think-education.users");
  }

  const params = await searchParams;
  const canEdit = await canTabPermission("education_user_management", "users", "branch_access", "edit");
  const { campuses, hasOrganizationScope } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const supabase = await createClient();
  const [membersResult, scopesResult] = await Promise.all([
    supabase.from("organization_members")
      .select("user_id, role, status, username, contact_email, invited_email")
      .eq("org_id", context.orgId)
      .eq("status", "active")
      .not("user_id", "is", null)
      .order("username"),
    supabase.from("education_member_branch_scopes")
      .select("user_id, scope_type, branch_id")
      .eq("org_id", context.orgId),
  ]);
  if (membersResult.error) throw new Error(`Could not load Think Education members: ${membersResult.error.message}`);
  if (scopesResult.error) throw new Error(`Could not load Think Education campus access: ${scopesResult.error.message}`);

  const members = membersResult.data ?? [];
  const memberIds = members.flatMap((member) => member.user_id ? [member.user_id] : []);
  const { data: profiles, error: profilesError } = memberIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", memberIds)
    : { data: [], error: null };
  if (profilesError) throw new Error(`Could not load Think Education member names: ${profilesError.message}`);

  const namesByUserId = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]));
  const campusNamesById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const memberLabel = (member: (typeof members)[number]) =>
    namesByUserId.get(member.user_id ?? "")?.trim()
      || member.username
      || member.contact_email
      || member.invited_email
      || "Member";
  const membersById = new Map(members.flatMap((member) => member.user_id ? [[member.user_id, member] as const] : []));
  const scopes = (scopesResult.data ?? []) as EducationScope[];
  const errorMessage = params.error === "invalid"
    ? "Choose an active member and a valid access scope."
    : params.error === "duplicate"
      ? "That access scope is already assigned."
      : params.error === "not-found"
        ? "That access scope no longer exists."
        : params.error === "save"
          ? "The access change could not be saved. Please try again."
          : null;

  return <main className="mx-auto max-w-[1200px] space-y-5 p-4 md:p-6">
    <header>
      <Link href={getProductAppPath("think-education", "/dashboard")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-950">Think Education User Access</h1>
      <p className="mt-1 text-sm text-slate-600">Assign explicit organization or campus scope to active organization members.</p>
    </header>

    {params.updated === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Campus access updated.</p>}
    {errorMessage && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{errorMessage}</p>}

    {canEdit && <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-slate-950">Grant access</h2>
      <form action={grantEducationMemberBranchScope} className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="text-sm font-medium text-slate-700">Member
          <select required name="user_id" defaultValue="" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="" disabled>Select a member</option>
            {members.map((member) => member.user_id
              ? <option key={member.user_id} value={member.user_id}>{memberLabel(member)}</option>
              : null)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Scope
          <select required name="scope_type" defaultValue="branch" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="branch">Campus access</option>
            {hasOrganizationScope && <option value="organization">Organization-wide access</option>}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Campus
          <select name="branch_id" defaultValue="" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">Not applicable for organization-wide access</option>
            {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
        </label>
        <div className="sm:col-span-3">
          <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Grant access</button>
        </div>
      </form>
      {!hasOrganizationScope && <p className="mt-3 text-xs text-slate-500">Organization-wide access can only be granted by a member who already has explicit organization-wide access.</p>}
    </section>}

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-5">
        <h2 className="font-semibold text-slate-950">Current access</h2>
        <p className="mt-1 text-sm text-slate-500">Members without an explicit scope cannot open Think Education records.</p>
      </div>
      {scopes.length === 0 ? <div className="p-8 text-center">
        <Users2 className="mx-auto h-10 w-10 text-slate-300" />
        <p className="mt-3 font-medium text-slate-800">No education access assigned</p>
        <p className="mt-1 text-sm text-slate-500">Grant access to a member to enable their assigned Think Education scope.</p>
      </div> : <div className="divide-y divide-slate-100">
        {scopes.map((scope) => {
          const member = membersById.get(scope.user_id);
          const branchName = scope.branch_id ? campusNamesById.get(scope.branch_id) : null;
          const canRevoke = canEdit
            && (scope.scope_type === "branch"
              ? Boolean(scope.branch_id && (
                hasOrganizationScope || campuses.some((campus) => campus.id === scope.branch_id)
              ))
              : context.role === "owner" && scope.user_id !== context.userId);
          return <div key={`${scope.user_id}:${scope.scope_type}:${scope.branch_id ?? "org"}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div>
              <p className="font-medium text-slate-900">{member ? memberLabel(member) : "Organization member"}</p>
              <p className="mt-1 text-sm text-slate-500">{scope.scope_type === "organization" ? "Organization-wide" : branchName ?? "Assigned campus"}</p>
            </div>
            {canRevoke && <form action={revokeEducationMemberBranchScope}>
              <input type="hidden" name="user_id" value={scope.user_id} />
              <input type="hidden" name="scope_type" value={scope.scope_type} />
              {scope.branch_id && <input type="hidden" name="branch_id" value={scope.branch_id} />}
              <button type="submit" className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50">Revoke access</button>
            </form>}
          </div>;
        })}
      </div>}
    </section>
  </main>;
}
