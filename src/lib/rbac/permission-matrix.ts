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

export function hasModulePermission(matrix: PermissionMatrix, module: string, action: PermissionAction): boolean {
  const canonical = MODULE_ALIASES[module] ?? module;
  return matrix[canonical]?.includes(action) === true || matrix[module]?.includes(action) === true;
}

export function hasTabPermission(
  matrix: PermissionMatrix,
  module: string,
  page: string,
  tab: string,
  action: PermissionAction
): boolean {
  const canonical = MODULE_ALIASES[module] ?? module;
  const exactKey = `${canonical}.${page}.${tab}`;
  if (Object.prototype.hasOwnProperty.call(matrix, exactKey)) return matrix[exactKey].includes(action);
  const legacyKey = `${module}.${page}.${tab}`;
  if (Object.prototype.hasOwnProperty.call(matrix, legacyKey)) return matrix[legacyKey].includes(action);
  return hasModulePermission(matrix, module, action);
}

export function isTabVisible(matrix: PermissionMatrix, module: string, page: string, tab: string): boolean {
  return hasTabPermission(matrix, module, page, tab, "view");
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

export function resolveTabPermissionActions(
  matrix: PermissionMatrix,
  module: string,
  page: string,
  tab: string
): PermissionAction[] {
  const key = `${module}.${page}.${tab}`;
  return Object.prototype.hasOwnProperty.call(matrix, key)
    ? matrix[key]
    : matrix[module] ?? [];
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
