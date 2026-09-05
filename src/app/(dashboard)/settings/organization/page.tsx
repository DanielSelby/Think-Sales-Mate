import { cookies } from "next/headers";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { can, isSuperAdmin } from "@/lib/rbac";
import { UserManagement, type ManagedUser, type UserBranch } from "@/components/dashboard/user-management";

export default async function OrganizationSettingsPage() {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const supabase = await createClient();
  const [{ data: memberRows }, { data: locationRows }] = await Promise.all([
    supabase
      .from("organization_members")
      .select("id, user_id, invited_email, contact_email, username, employee_id, phone, department, branch_scope, secondary_location_ids, access_permissions, can_view_other_users_transactions, can_check_cross_branch_stock, role, status, location_id, created_at")
      .eq("org_id", context.orgId),
    supabase.from("business_locations").select("id, name").eq("org_id", context.orgId).eq("is_active", true).order("name")
  ]);
  const { data: roleThemeRows } = await supabase
    .from("organization_role_themes")
    .select("role_key, theme_key")
    .eq("org_id", context.orgId);
  const roleThemes = Object.fromEntries((roleThemeRows ?? []).map((row) => [row.role_key, row.theme_key]));

  const branches: UserBranch[] = (locationRows ?? []).map((l) => ({ id: l.id, name: l.name }));
  const branchById = new Map(branches.map((b) => [b.id, b.name]));

  const admin = createAdminClient();
  const users: ManagedUser[] = [];

  for (let i = 0; i < (memberRows ?? []).length; i++) {
    const row = (memberRows ?? [])[i];
    let email = row.contact_email ?? row.invited_email ?? "";
    let lastSignInAt: string | null = null;
    let nameFromAuth: string | null = null;

    if (row.user_id) {
      const { data } = await admin.auth.admin.getUserById(row.user_id);
      if (!email && data.user?.email && !data.user.email.endsWith("@internal.thinksales.local")) email = data.user.email;
      lastSignInAt = data.user?.last_sign_in_at ?? null;
      nameFromAuth = data.user?.user_metadata?.full_name || data.user?.user_metadata?.name || null;
    }

    const fallbackName = nameFromAuth || email.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
    const accessRole = row.role === "owner"
      ? "owner"
      : typeof row.access_permissions?.role_key === "string"
      ? row.access_permissions.role_key
      : row.role;

    users.push({
      id: row.id,
      userId: row.user_id,
      name: fallbackName,
      fullName: fallbackName,
      username: row.username,
      email,
      phone: row.phone ?? "",
      employeeId: row.employee_id ?? `TS-EMP-0${i + 1}`,
      role: accessRole,
      roleLabel: row.role === "owner" ? "Super Admin" : accessRole ? accessRole.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()) : "Staff",
      status: row.status as any,
      department: row.department ?? "Sales & Marketing",
      locationId: row.location_id,
      locationName: row.location_id ? branchById.get(row.location_id) ?? null : null,
      lastSignInAt,
      joinedAt: row.created_at,
      isSelf: row.user_id === context.userId,
      twoFactorEnabled: true,
      branchScope: row.branch_scope ?? "assigned",
      secondaryBranches: row.secondary_location_ids ?? [],
      secondaryBranchNames: (row.secondary_location_ids ?? []).map((id) => branchById.get(id) ?? id),
      canViewOtherTransactions: row.can_view_other_users_transactions !== false,
      canCheckCrossBranchStock: row.can_check_cross_branch_stock === true,
      accessPermissions: row.access_permissions ?? {}
    });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <UserManagement
        users={users}
        branches={branches}
        canManage={isSuperAdmin(context.role) || can(context.role, "org.manage_members")}
        orgName={context.orgName}
        roleThemes={roleThemes}
        canManageThemes={isSuperAdmin(context.role) || can(context.role, "org.manage_members")}
      />
    </div>
  );
}