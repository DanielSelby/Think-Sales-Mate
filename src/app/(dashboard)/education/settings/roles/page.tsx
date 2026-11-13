import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { ProductPermissionsTab } from "@/components/dashboard/user-management/tabs/product-permissions-tab";
import {
  DEFAULT_ROLES,
  MODULE_CONFIGS,
  PERMISSION_PAGE_CONFIGS,
} from "@/components/dashboard/user-management/constants";
import type { ManagedUser } from "@/components/dashboard/user-management/types";
import { getProductAppPath } from "@/lib/product-app-routes";
import { isOrganizationSuperAdminMember } from "@/lib/organizations/member-access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { getOrganizationAccessibleProductOptions } from "@/lib/supabase/organization-product-access";
import { createClient } from "@/lib/supabase/server";
import type { PlatformProductSlug } from "@/types/platform-database";

export default async function EducationRolesPage() {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!isOrganizationSuperAdminMember({
    role: context.role,
    userId: context.userId,
    accessPermissions: context.accessPermissions,
  })) {
    redirect("/dashboard?accessDenied=think-education.roles");
  }

  const products = await getOrganizationAccessibleProductOptions(context.orgId);
  const educationProduct = products.find((product) => product.slug === "think-education");
  if (!educationProduct) {
    return <main className="mx-auto max-w-[1400px] space-y-4 p-4 md:p-6">
      <header>
        <Link href={getProductAppPath("think-education", "/dashboard")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">Roles &amp; Permissions</h1>
      </header>
      <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Think Education is not currently enabled for this organization.
      </p>
    </main>;
  }

  const supabase = await createClient();
  const [membersResult, assignmentsResult, templatesResult, memberRolesResult] = await Promise.all([
    supabase.from("organization_members")
      .select("id, user_id, invited_email, contact_email, username, employee_id, phone, department, access_permissions, role, status, location_id, branch_scope, secondary_location_ids, created_at")
      .eq("org_id", context.orgId)
      .eq("status", "active")
      .not("user_id", "is", null),
    supabase.from("organization_product_access_assignments")
      .select("user_id, product_slug")
      .eq("org_id", context.orgId)
      .eq("product_slug", "think-education")
      .eq("is_active", true),
    supabase.from("organization_product_role_templates")
      .select("product_slug, role_key, name, permissions")
      .eq("org_id", context.orgId)
      .eq("product_slug", "think-education"),
    supabase.from("organization_member_product_permissions")
      .select("user_id, product_slug, role_key")
      .eq("org_id", context.orgId)
      .eq("product_slug", "think-education"),
  ]);
  if (membersResult.error) throw new Error(`Could not load Think Education members: ${membersResult.error.message}`);
  if (assignmentsResult.error) throw new Error(`Could not load Think Education product assignments: ${assignmentsResult.error.message}`);
  if (templatesResult.error) throw new Error(`Could not load Think Education role templates: ${templatesResult.error.message}`);
  if (memberRolesResult.error) throw new Error(`Could not load Think Education member roles: ${memberRolesResult.error.message}`);

  const members = membersResult.data ?? [];
  const userIds = members.flatMap((member) => member.user_id ? [member.user_id] : []);
  const { data: profiles, error: profilesError } = userIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", userIds)
    : { data: [], error: null };
  if (profilesError) throw new Error(`Could not load Think Education member names: ${profilesError.message}`);

  const profileNameById = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]));
  const users: ManagedUser[] = members.flatMap((member) => {
    if (!member.user_id) return [];
    const name = profileNameById.get(member.user_id)?.trim()
      || member.username
      || member.contact_email
      || member.invited_email
      || "Member";
    return [{
      id: member.id,
      userId: member.user_id,
      name,
      fullName: name,
      username: member.username,
      email: member.contact_email ?? member.invited_email ?? "",
      phone: member.phone ?? "",
      employeeId: member.employee_id ?? "",
      role: member.role,
      status: member.status,
      department: member.department ?? "",
      locationId: member.location_id,
      locationName: null,
      lastSignInAt: null,
      joinedAt: member.created_at,
      isSelf: member.user_id === context.userId,
      branchScope: member.branch_scope,
      secondaryBranches: member.secondary_location_ids ?? [],
      accessPermissions: member.access_permissions ?? {},
    }];
  });

  const assignments: Record<string, string[]> = {};
  for (const assignment of assignmentsResult.data ?? []) {
    assignments[assignment.user_id] = [assignment.product_slug];
  }

  return <main className="mx-auto max-w-[1600px] space-y-5 p-4 md:p-6">
    <header>
      <Link href={getProductAppPath("think-education", "/dashboard")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>
      <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold text-slate-950">
        <ShieldCheck className="h-6 w-6 text-blue-700" /> Think Education Roles &amp; Permissions
      </h1>
      <p className="mt-1 text-sm text-slate-600">Manage role permissions and member roles for Think Education without opening system-wide user management.</p>
    </header>
    <ProductPermissionsTab
      users={users}
      products={[{ slug: educationProduct.slug as PlatformProductSlug, name: educationProduct.name }]}
      assignments={assignments}
      templates={(templatesResult.data ?? []).map((template) => ({
        ...template,
        product_slug: "think-education",
        permissions: template.permissions && typeof template.permissions === "object" && !Array.isArray(template.permissions)
          ? template.permissions as Record<string, unknown>
          : null,
      }))}
      memberRoles={(memberRolesResult.data ?? []).map((memberRole) => ({
        ...memberRole,
        product_slug: "think-education",
      }))}
      roles={DEFAULT_ROLES}
      moduleConfigs={MODULE_CONFIGS}
      pageConfigs={PERMISSION_PAGE_CONFIGS}
      activeProductSlug="think-education"
    />
  </main>;
}
