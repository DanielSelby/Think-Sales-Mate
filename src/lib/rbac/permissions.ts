import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import type { MemberRole } from "@/lib/rbac";
import type { PermissionAction } from "@/lib/rbac";
import {
  canonicalRoleKey,
  hasModulePermission as hasPermission,
  hasTabPermission,
  isTabVisible,
  normalizePermissionMatrix,
  resolveMemberPermissionMatrix,
  resolveTabPermissionActions,
  type PermissionMatrix
} from "./permission-matrix";

export {
  canonicalRoleKey,
  defaultPermissionMatrixForRole,
  hasModulePermission,
  hasTabPermission,
  isTabVisible,
  normalizePermissionMatrix,
  resolveMemberPermissionMatrix,
  resolveTabPermissionActions,
  type PermissionMatrix
} from "./permission-matrix";

export { hasModulePermission as hasPermission } from "./permission-matrix";

function roleKeyForMember(role: MemberRole, accessPermissions: Record<string, unknown>): string {
  return canonicalRoleKey(typeof accessPermissions.role_key === "string" ? accessPermissions.role_key : role);
}

/** Custom member overrides are explicit; otherwise the current role template is authoritative. */
export async function loadPermissionMatrix(
  orgId: string,
  role: MemberRole,
  accessPermissions: Record<string, unknown> = {}
): Promise<PermissionMatrix> {
  const roleKey = roleKeyForMember(role, accessPermissions);
  if (accessPermissions.permissions_mode === "custom") {
    return normalizePermissionMatrix(accessPermissions.permissions);
  }
  const supabase = await createClient();
  const { data, error } = await (supabase as any)
    .from("organization_role_templates")
    .select("permissions")
    .eq("org_id", orgId)
    .eq("role_key", roleKey)
    .maybeSingle();
  if (error) throw new Error(`Could not load the role permission template: ${error.message}`);
  return resolveMemberPermissionMatrix(
    accessPermissions,
    data?.permissions,
    data !== null && data !== undefined,
    roleKey
  );
}

/** Server-side check using the signed-in user's active organization. */
export async function canPermission(
  module: string,
  action: PermissionAction,
  activeOrgId?: string
): Promise<boolean> {
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return false;
  if (context.role === "owner") return true;
  const matrix = await loadPermissionMatrix(context.orgId, context.role, context.accessPermissions);
  return hasPermission(matrix, module, action);
}

export async function canTabPermission(
  module: string,
  page: string,
  tab: string,
  action: PermissionAction,
  activeOrgId?: string
): Promise<boolean> {
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return false;
  if (context.role === "owner") return true;
  const matrix = await loadPermissionMatrix(context.orgId, context.role, context.accessPermissions);
  return hasTabPermission(matrix, module, page, tab, action);
}

/** Fail closed for server actions that require an explicit module capability. */
export async function requirePermission(
  module: string,
  action: PermissionAction
): Promise<void> {
  if (!(await canPermission(module, action))) {
    throw new Error(`You do not have permission to ${action} ${module}.`);
  }
}

export async function requireTabPermission(
  module: string,
  page: string,
  tab: string,
  action: PermissionAction
): Promise<void> {
  if (!(await canTabPermission(module, page, tab, action))) {
    throw new Error(`You do not have permission to ${action} the ${tab} tab.`);
  }
}

/** Save a role template after validating the matrix shape. */
export async function savePermissionTemplate(
  orgId: string,
  roleKey: string,
  permissions: unknown,
  name?: string
) {
  const matrix = normalizePermissionMatrix(permissions);
  const supabase = await createClient();
  const { error } = await (supabase as any).from("organization_role_templates").upsert({
    org_id: orgId,
    role_key: roleKey,
    name: name ?? null,
    permissions: matrix,
    updated_at: new Date().toISOString()
  }, { onConflict: "org_id,role_key" });
  return error ? { error: error.message } : { success: true, permissions: matrix };
}
