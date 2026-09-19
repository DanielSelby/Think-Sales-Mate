import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import type { MemberRole } from "@/lib/rbac";
import type { PermissionAction } from "@/lib/rbac";

export type PermissionMatrix = Record<string, PermissionAction[]>;

const ACTIONS = new Set<PermissionAction>([
  "view", "create", "edit", "delete", "approve", "export", "print"
]);

const MODULE_ALIASES: Record<string, string> = {
  hrm: "hrm_payroll",
  payroll: "hrm_payroll",
  payslip: "payslips",
  "cash-closing": "cash_closing",
  fraud_detection: "fraud",
  customer_messaging: "communication",
  "route-sales": "route_sales",
  "stock-adjustment": "stock_adjustments",
  "stock-request": "stock_requests",
  "price-management": "price_management",
  "product-duplicates": "product_duplicates"
};

function canonicalModule(module: string) {
  return MODULE_ALIASES[module] ?? module;
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

export function hasPermission(matrix: PermissionMatrix, module: string, action: PermissionAction): boolean {
  const key = canonicalModule(module);
  return matrix[key]?.includes(action) === true || matrix[module]?.includes(action) === true;
}

function roleKeyForMember(role: MemberRole, accessPermissions: Record<string, unknown>): string {
  return typeof accessPermissions.role_key === "string" ? accessPermissions.role_key : role;
}

/** Load the effective matrix for a member. Explicit member permissions override its role template. */
export async function loadPermissionMatrix(
  orgId: string,
  role: MemberRole,
  accessPermissions: Record<string, unknown> = {}
): Promise<PermissionMatrix> {
  const explicit = normalizePermissionMatrix(accessPermissions.permissions);
  if (Object.keys(explicit).length > 0) return explicit;

  const supabase = await createClient();
  const roleKey = roleKeyForMember(role, accessPermissions);
  const { data } = await (supabase as any)
    .from("organization_role_templates")
    .select("permissions")
    .eq("org_id", orgId)
    .eq("role_key", roleKey)
    .maybeSingle();
  return normalizePermissionMatrix(data?.permissions);
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

/** Fail closed for server actions that require an explicit module capability. */
export async function requirePermission(
  module: string,
  action: PermissionAction
): Promise<void> {
  if (!(await canPermission(module, action))) {
    throw new Error(`You do not have permission to ${action} ${module}.`);
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
