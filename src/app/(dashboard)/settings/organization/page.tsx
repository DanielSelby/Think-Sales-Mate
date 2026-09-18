import { cookies } from "next/headers";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { can, isSuperAdmin } from "@/lib/rbac";
import { UserManagement, type ManagedUser, type UserBranch } from "@/components/dashboard/user-management";
import type { ApprovalPermission, AuditLogEntry, LoginSession } from "@/components/dashboard/user-management/types";
import { DEFAULT_ROLES } from "@/components/dashboard/user-management/constants";
import { normalizePermissionMatrix } from "@/lib/rbac/permissions";

export default async function OrganizationSettingsPage() {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const supabase = await createClient();
  const [{ data: memberRows }, { data: locationRows }, { data: companyProfile }, { data: employeeRows }, { data: roleTemplateRows }, { data: auditRows }] = await Promise.all([
    supabase
      .from("organization_members")
      .select("id, user_id, invited_email, contact_email, username, employee_id, phone, department, branch_scope, secondary_location_ids, access_permissions, can_view_other_users_transactions, can_check_cross_branch_stock, role, status, location_id, created_at, organizations(created_by)")
      .eq("org_id", context.orgId),
    supabase.from("business_locations").select("id, name").eq("org_id", context.orgId).eq("is_active", true).order("name"),
    supabase.from("company_profile").select("website").eq("org_id", context.orgId).maybeSingle(),
    supabase.from("employees").select("full_name").eq("org_id", context.orgId).order("full_name")
    , (supabase as any).from("organization_role_templates").select("role_key, name, permissions").eq("org_id", context.orgId)
    , supabase.from("audit_logs").select("id, actor_id, action, entity_type, entity_id, metadata, created_at").eq("org_id", context.orgId).order("created_at", { ascending: false }).limit(500)
  ]);
  const { data: roleThemeRows } = await supabase
    .from("organization_role_themes")
    .select("role_key, theme_key")
    .eq("org_id", context.orgId);
  const roleThemes = Object.fromEntries((roleThemeRows ?? []).map((row) => [row.role_key, row.theme_key]));
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
    const organization = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
    const isOwner = row.role === "owner" || organization?.created_by === row.user_id;
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
      employeeId: row.employee_id ?? `TS-EMP-0${i + 1}`,
      role: accessRole,
      roleLabel: isOwner ? "Super Admin" : accessRole ? accessRole.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()) : "Staff",
      status: isOwner ? "active" : row.status as any,
      department: row.department ?? "Sales & Marketing",
      locationId: row.location_id,
      locationName: row.location_id ? branchById.get(row.location_id) ?? null : null,
      lastSignInAt,
      joinedAt: row.created_at,
      isSelf: row.user_id === context.userId,
      twoFactorEnabled: true,
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
  const sessions: LoginSession[] = users
    .filter((user) => user.userId && user.lastSignInAt)
    .map((user) => ({
      id: `auth-${user.userId}`,
      sessionId: `auth-${user.userId}`,
      userId: user.userId!,
      userName: user.fullName || user.name,
      userEmail: user.email,
      userAvatar: user.avatarUrl,
      role: user.roleLabel || String(user.role),
      branch: user.locationName || "Unassigned",
      loginTime: user.lastSignInAt!,
      lastActivity: user.lastSignInAt!,
      logoutTime: null,
      durationMinutes: 0,
      device: "Authenticated device",
      browser: "Not provided by authentication provider",
      os: "Not provided by authentication provider",
      ipAddress: "Not available",
      location: user.locationName || "Unknown",
      status: "active",
      isCurrent: user.userId === context.userId
    }));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <UserManagement
        users={users}
        branches={branches}
        roles={roles}
        auditLogs={auditLogs}
        sessions={sessions}
        canManage={isSuperAdmin(context.role) || can(context.role, "org.manage_members")}
        orgName={context.orgName}
        companyWebsite={companyProfile?.website}
        employeeNames={Array.from(new Set((employeeRows ?? []).map((employee) => employee.full_name.trim()).filter(Boolean)))}
        roleThemes={roleThemes}
        canManageThemes={isSuperAdmin(context.role) || can(context.role, "org.manage_members")}
      />
    </div>
  );
}