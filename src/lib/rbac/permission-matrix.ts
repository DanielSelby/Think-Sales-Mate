import { DEFAULT_ROLES } from "@/components/dashboard/user-management/constants";
import type { PermissionAction } from "@/lib/rbac";

export type PermissionMatrix = Record<string, PermissionAction[]>;

const ACTIONS = new Set<PermissionAction>([
  "view", "create", "edit", "delete", "approve", "import", "export", "print"
]);

export function canonicalRoleKey(role: string): string {
  switch (role.toLowerCase()) {
    case "admin":
      return "administrator";
    case "branch_manager":
      return "manager";
    case "super_admin":
      return "owner";
    default:
      return role.toLowerCase();
  }
}

export function normalizePermissionMatrix(value: unknown): PermissionMatrix {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: PermissionMatrix = {};
  for (const [module, actions] of Object.entries(value)) {
    if (!Array.isArray(actions)) continue;
    const valid = actions.filter((action): action is PermissionAction =>
      typeof action === "string" && ACTIONS.has(action as PermissionAction)
    );
    result[module] = Array.from(new Set(valid));
  }
  return result;
}

export function defaultPermissionMatrixForRole(role: string): PermissionMatrix {
  const normalizedRole = canonicalRoleKey(role);
  const roleDefinition = DEFAULT_ROLES.find((item) => item.key.toLowerCase() === normalizedRole);
  return normalizePermissionMatrix(roleDefinition?.permissions);
}

export function resolveMemberPermissionMatrix(
  accessPermissions: Record<string, unknown>,
  roleTemplate: unknown,
  hasRoleTemplate: boolean,
  roleKey: string
): PermissionMatrix {
  if (accessPermissions.permissions_mode === "custom") {
    return normalizePermissionMatrix(accessPermissions.permissions);
  }
  if (hasRoleTemplate) return normalizePermissionMatrix(roleTemplate);
  if (accessPermissions.role_defaults_fallback) {
    return normalizePermissionMatrix(accessPermissions.role_defaults_fallback);
  }
  return defaultPermissionMatrixForRole(roleKey);
}
