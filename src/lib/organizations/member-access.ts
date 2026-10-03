type OrganizationMemberIdentity = {
  role?: string | null;
  userId?: string | null;
  createdBy?: string | null;
  accessPermissions?: unknown;
};

export function isSuperAdminRole(role: string | null | undefined): boolean {
  const normalizedRole = role?.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return normalizedRole === "owner" || normalizedRole === "super_admin";
}

export function isOrganizationSuperAdminMember({
  role,
  userId,
  createdBy,
  accessPermissions,
}: OrganizationMemberIdentity): boolean {
  const permissions =
    accessPermissions && typeof accessPermissions === "object" && !Array.isArray(accessPermissions)
      ? (accessPermissions as Record<string, unknown>)
      : null;
  const permissionRole = typeof permissions?.role_key === "string" ? permissions.role_key : null;

  return isSuperAdminRole(role) || isSuperAdminRole(permissionRole) || Boolean(userId && createdBy === userId);
}
