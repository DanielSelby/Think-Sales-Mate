import { cookies } from "next/headers";
import type { User as AuthUser } from "@supabase/supabase-js";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canPermission } from "@/lib/rbac/permissions";
import { UserManagement, type ManagedUser, type UserBranch } from "@/components/dashboard/user-management";
import type { ApprovalPermission, AuditLogEntry, InvitationRecord } from "@/components/dashboard/user-management/types";
import { DEFAULT_ROLES } from "@/components/dashboard/user-management/constants";
import { normalizePermissionMatrix } from "@/lib/rbac/permissions";
import { isOrganizationSuperAdminMember } from "@/lib/organizations/member-access";

export default async function OrganizationSettingsPage() {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const supabase = await createClient();
  const [membersResult, locationsResult, companyProfileResult, employeesResult, roleTemplatesResult, auditsResult] = await Promise.all([
    supabase
      .from("organization_members")
      .select("id, user_id, invited_email, contact_email, username, employee_id, phone, department, branch_scope, secondary_location_ids, access_permissions, can_view_other_users_transactions, can_check_cross_branch_stock, role, status, location_id, created_at, organizations(created_by), profiles(avatar_url)")
      .eq("org_id", context.orgId),
    supabase.from("business_locations").select("id, name").eq("org_id", context.orgId).eq("is_active", true).order("name"),
    supabase.from("company_profile").select("website").eq("org_id", context.orgId).maybeSingle(),
    supabase.from("employees").select("full_name").eq("org_id", context.orgId).order("full_name")
    , (supabase as any).from("organization_role_templates").select("role_key, name, permissions").eq("org_id", context.orgId)
    , supabase.from("audit_logs").select("id, actor_id, action, entity_type, entity_id, metadata, created_at").eq("org_id", context.orgId).order("created_at", { ascending: false }).limit(500)
  ]);
  for (const result of [membersResult, locationsResult, companyProfileResult, employeesResult, roleTemplatesResult, auditsResult]) {
    if (result.error) throw new Error(`Could not load user management data: ${result.error.message}`);
  }
  const memberRows = membersResult.data;
  const locationRows = locationsResult.data;
  const companyProfile = companyProfileResult.data;
  const employeeRows = employeesResult.data;
  const roleTemplateRows = roleTemplatesResult.data;
  const auditRows = auditsResult.data;
  const { data: roleThemeRows, error: roleThemeError } = await supabase
    .from("organization_role_themes")
    .select("role_key, theme_key")
    .eq("org_id", context.orgId);
  const roleThemes = Object.fromEntries((roleThemeRows ?? []).map((row) => [row.role_key, row.theme_key]));
  if (roleThemeError && /organization_role_themes|schema cache|relation .* does not exist/i.test(roleThemeError.message)) {
    for (const row of memberRows ?? []) {
      const accessPermissions = (row.access_permissions as Record<string, unknown> | null) ?? {};
      const roleKey = typeof accessPermissions.role_key === "string" ? accessPermissions.role_key : null;
      const roleTheme = typeof accessPermissions.role_theme === "string" ? accessPermissions.role_theme : null;
      if (roleKey && roleTheme && !roleThemes[roleKey]) roleThemes[roleKey] = roleTheme;
    }
  } else if (roleThemeError) {
    throw new Error(`Could not load role themes: ${roleThemeError.message}`);
  }
  const savedTemplates = new Map(
    ((roleTemplateRows ?? []) as Array<{ role_key: string; name: string | null; permissions: Record<string, unknown> | null }>)
      .map((row) => [row.role_key, row] as const)
  );
  const roles = DEFAULT_ROLES.map((role) => {
    const saved = savedTemplates.get(role.key);
    if (!saved) return role;
    const permissions = saved.permissions
      ? normalizePermissionMatrix(saved.permissions)
      : role.permissions;
    return {
      ...role,
      name: saved.name || role.name,
      permissions,
      permissionCount: Object.values(permissions).reduce((count, actions) => count + actions.length, 0)
    };
  });
  for (const [roleKey, saved] of savedTemplates) {
    if (roles.some((role) => role.key === roleKey)) continue;
    const permissions = normalizePermissionMatrix(saved.permissions);
    roles.push({
      id: `role-${roleKey}`,
      key: roleKey,
      name: saved.name || roleKey.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
      description: "Custom organization permission template.",
      userCount: 0,
      permissionCount: Object.values(permissions).reduce((count, actions) => count + actions.length, 0),
      isSystem: false,
      scope: "branch_specific",
      badgeColor: "bg-purple-100 text-purple-700 border-purple-200",
      permissions,
      approvalCapabilities: {
        stockTransfers: false,
        purchases: false,
        expenses: false,
        priceUpdates: false,
        stockAdjustments: false
      }
    });
  }

  const branches: UserBranch[] = (locationRows ?? []).map((l) => ({ id: l.id, name: l.name }));
  const branchById = new Map(branches.map((b) => [b.id, b.name]));
  const memberByUserId = new Map((memberRows ?? []).filter((row) => row.user_id).map((row) => [row.user_id as string, row]));
  const admin = createAdminClient();
  const pendingAuthIds = new Set((memberRows ?? []).map((row) => row.user_id).filter((id): id is string => Boolean(id)));
  const authUsers = new Map<string, AuthUser>();
  let authPage = 1;
  const authPageSize = 1000;
  while (pendingAuthIds.size > 0) {
    const { data, error } = await admin.auth.admin.listUsers({ page: authPage, perPage: authPageSize });
    if (error) throw new Error(`Could not load member authentication details: ${error.message}`);
    for (const authUser of data.users) {
      if (pendingAuthIds.delete(authUser.id)) authUsers.set(authUser.id, authUser);
    }
    if (data.users.length < authPageSize) break;
    authPage++;
  }
  const auditLogs: AuditLogEntry[] = (auditRows ?? []).map((row) => {
    const member = row.actor_id ? memberByUserId.get(row.actor_id) : null;
    return {
      id: row.id,
      timestamp: row.created_at,
      userId: row.actor_id ?? "",
      userName: member?.contact_email ?? member?.invited_email ?? "System",
      userEmail: member?.contact_email ?? member?.invited_email ?? "",
      role: member?.role ?? "",
      branch: member?.location_id ? branchById.get(member.location_id) ?? "Branch" : "All branches",
      module: row.entity_type,
      action: row.action,
      recordType: row.entity_type,
      recordId: row.entity_id ?? undefined,
      device: "Application",
      ipAddress: "—",
      status: "success",
      details: row.metadata ? JSON.stringify(row.metadata) : undefined
    };
  });
  const users: ManagedUser[] = [];

  for (const row of memberRows ?? []) {
    let email = row.contact_email ?? row.invited_email ?? "";
    const authUser = row.user_id ? authUsers.get(row.user_id) : null;
    if (!email && authUser?.email && !authUser.email.endsWith("@internal.thinksales.local")) email = authUser.email;
    const lastSignInAt = authUser?.last_sign_in_at ?? null;
    const nameFromAuth = authUser?.user_metadata?.full_name || authUser?.user_metadata?.name || null;

    const fallbackName = nameFromAuth || email.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
    const organization = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
    const isOwner = isOrganizationSuperAdminMember({
      role: row.role,
      userId: row.user_id,
      createdBy: organization?.created_by,
      accessPermissions: row.access_permissions,
    });
    const accessRole = isOwner
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
      avatarUrl: row.profiles?.avatar_url ?? row.avatar_url,
      employeeId: row.employee_id ?? "",
      role: accessRole,
      roleLabel: isOwner ? "Super Admin" : accessRole ? accessRole.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()) : "Staff",
      status: isOwner ? "active" : row.status as any,
      department: row.department ?? "",
      locationId: row.location_id,
      locationName: isOwner ? "All branches" : row.location_id ? branchById.get(row.location_id) ?? null : null,
      lastSignInAt,
      joinedAt: row.created_at,
      isSelf: row.user_id === context.userId,
      twoFactorEnabled: null,
      branchScope: isOwner ? "all" : row.branch_scope ?? "assigned",
      secondaryBranches: isOwner ? [] : row.secondary_location_ids ?? [],
      secondaryBranchNames: isOwner ? [] : (row.secondary_location_ids ?? []).map((id) => branchById.get(id) ?? id),
      canViewOtherTransactions: isOwner || row.can_view_other_users_transactions !== false,
      canCheckCrossBranchStock: isOwner || row.can_check_cross_branch_stock === true,
      approvalPermissions: isOwner
        ? {
            stockTransfers: true,
            purchases: true,
            expenses: true,
            priceUpdates: true,
            stockAdjustments: true,
            customerOrders: true,
            maxExpenseAmount: Number.MAX_SAFE_INTEGER,
            maxPurchaseAmount: Number.MAX_SAFE_INTEGER
          }
        : (row.access_permissions?.approvals ?? {
            stockTransfers: false,
            purchases: false,
            expenses: false,
            priceUpdates: false,
            stockAdjustments: false,
            customerOrders: false
          }) as ApprovalPermission,
      accessPermissions: row.access_permissions ?? {}
      , priceGroups: isOwner ? ["retail", "wholesale", "vip", "special"] : (Array.isArray(row.access_permissions?.price_groups) ? row.access_permissions.price_groups : ["retail", "wholesale", "vip", "special"])
    });
  }
  const userByMemberId = new Map(users.map((user) => [user.id, user]));
  const invitations: InvitationRecord[] = (memberRows ?? [])
    .filter((row) => row.status === "invited")
    .map((row) => {
      const user = userByMemberId.get(row.id);
      const email = row.contact_email ?? row.invited_email ?? "";
      return {
        id: row.id,
        name: user?.fullName || email.split("@")[0],
        email,
        role: String(user?.role ?? row.role ?? "staff"),
        roleLabel: user?.roleLabel ?? "Staff",
        branchId: row.location_id ?? "",
        branchName: row.location_id ? branchById.get(row.location_id) ?? "Unassigned" : "Unassigned",
        invitedBy: "",
        invitedAt: row.created_at,
        status: "pending"
      };
    });
  const canManageUsers = await canPermission("user_management", "edit", context.orgId);
  return (
    <div className="mx-auto max-w-[1680px] space-y-6">
      <UserManagement
        users={users}
        branches={branches}
        roles={roles}
        auditLogs={auditLogs}
        invitations={invitations}
        canManage={canManageUsers}
        orgName={context.orgName}
        companyWebsite={companyProfile?.website}
        employeeNames={Array.from(new Set((employeeRows ?? []).map((employee) => employee.full_name.trim()).filter(Boolean)))}
        roleThemes={roleThemes}
        canManageThemes={canManageUsers}
      />
    </div>
  );
}