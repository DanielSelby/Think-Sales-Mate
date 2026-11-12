import { createClient } from "@/lib/supabase/server";
import { cookies, headers } from "next/headers";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { isOrganizationSuperAdminMember } from "@/lib/organizations/member-access";
import {
  getRequiredProductSlugsForPermissionModule,
  hasAnyRequiredProductAccess,
  isOrganizationWidePermissionModule,
} from "@/lib/product-entitlement-routes";
import { isPlatformProductSlug, type PlatformProductSlug } from "@/types/platform-database";
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
  const { data, error } = await supabase
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

async function hasProductAccessForPermissionModule(
  orgId: string,
  module: string,
  action: PermissionAction,
  page?: string,
  tab?: string,
  requestedProduct?: PlatformProductSlug,
): Promise<boolean> {
  if (process.env.PRODUCT_ENTITLEMENTS_ENFORCED !== "true") return true;

  const supabase = await createClient();
  const requiredProducts = getRequiredProductSlugsForPermissionModule(module, page, tab);
  if (requestedProduct && !requiredProducts.includes(requestedProduct)) return false;
  const readableProducts = new Set<PlatformProductSlug>();
  for (const productSlug of requestedProduct ? [requestedProduct] : requiredProducts) {
    const { data: hasAccess, error } = await supabase.rpc("has_product_access", {
      p_organization_id: orgId,
      p_product_slug: productSlug,
      p_require_write: action !== "view" && action !== "view_audit",
    });
    if (error) throw new Error(`Could not verify product access for ${module}: ${error.message}`);
    if (!hasAccess) continue;

    const context = await getCurrentOrgContext(orgId);
    if (!context) return false;
    const isProductAdmin = isOrganizationSuperAdminMember({
      role: context.role,
      userId: context.userId,
      accessPermissions: context.accessPermissions,
    });
    if (!isProductAdmin) {
      const { data: assignment, error: assignmentError } = await supabase
        .from("organization_product_access_assignments")
        .select("product_slug")
        .eq("org_id", orgId)
        .eq("user_id", context.userId)
        .eq("product_slug", productSlug)
        .eq("is_active", true)
        .maybeSingle();
      if (assignmentError) {
        throw new Error(`Could not verify your assignment to ${productSlug}: ${assignmentError.message}`);
      }
      if (!assignment) continue;
    }
    readableProducts.add(productSlug);
  }
  return hasAnyRequiredProductAccess(requiredProducts, readableProducts);
}

async function getActiveProductSlug(): Promise<PlatformProductSlug | null> {
  const [requestHeaders, cookieStore] = await Promise.all([headers(), cookies()]);
  const headerSlug = requestHeaders.get("x-active-product-slug");
  if (headerSlug && isPlatformProductSlug(headerSlug)) return headerSlug;
  const cookieSlug = cookieStore.get("active_product_slug")?.value;
  return cookieSlug && isPlatformProductSlug(cookieSlug) ? cookieSlug : null;
}

async function loadProductPermissionMatrix(
  orgId: string,
  userId: string,
  productSlug: PlatformProductSlug,
): Promise<PermissionMatrix | null> {
  const supabase = await createClient();
  const { data: profile, error: profileError } = await supabase
    .from("organization_member_product_permissions")
    .select("role_key, permissions_mode, permissions")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .eq("product_slug", productSlug)
    .maybeSingle();
  if (profileError) throw new Error(`Could not load your ${productSlug} permissions: ${profileError.message}`);
  if (!profile) return null;

  const roleKey = canonicalRoleKey(profile.role_key);
  let templatePermissions: unknown;
  let hasTemplate = false;
  if (profile.permissions_mode !== "custom") {
    const { data: template, error: templateError } = await supabase
      .from("organization_product_role_templates")
      .select("permissions")
      .eq("org_id", orgId)
      .eq("product_slug", productSlug)
      .eq("role_key", roleKey)
      .maybeSingle();
    if (templateError) throw new Error(`Could not load the ${productSlug} role template: ${templateError.message}`);
    templatePermissions = template?.permissions;
    hasTemplate = template !== null;
  }
  return resolveMemberPermissionMatrix(profile, templatePermissions, hasTemplate, roleKey);
}

/** Server-side check using the signed-in user's active organization. */
export async function canPermission(
  module: string,
  action: PermissionAction,
  activeOrgId?: string,
  productModule = module,
): Promise<boolean> {
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return false;
  const activeProduct = isOrganizationWidePermissionModule(productModule)
    ? null
    : await getActiveProductSlug();
  if (!await hasProductAccessForPermissionModule(context.orgId, productModule, action, undefined, undefined, activeProduct ?? undefined)) {
    return false;
  }
  if (context.role === "owner") return true;
  const matrix = activeProduct
    ? await loadProductPermissionMatrix(context.orgId, context.userId, activeProduct)
    : await loadPermissionMatrix(context.orgId, context.role, context.accessPermissions);
  if (!matrix) return false;
  return hasPermission(matrix, module, action);
}

export async function canTabPermission(
  module: string,
  page: string,
  tab: string,
  action: PermissionAction,
  activeOrgId?: string,
  productModule = module,
): Promise<boolean> {
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return false;
  const activeProduct = isOrganizationWidePermissionModule(productModule)
    ? null
    : await getActiveProductSlug();
  if (!await hasProductAccessForPermissionModule(context.orgId, productModule, action, page, tab, activeProduct ?? undefined)) {
    return false;
  }
  if (context.role === "owner") return true;
  const matrix = activeProduct
    ? await loadProductPermissionMatrix(context.orgId, context.userId, activeProduct)
    : await loadPermissionMatrix(context.orgId, context.role, context.accessPermissions);
  if (!matrix) return false;
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
  const { error } = await supabase.from("organization_role_templates").upsert({
    org_id: orgId,
    role_key: roleKey,
    name: name ?? null,
    permissions: matrix,
    updated_at: new Date().toISOString()
  }, { onConflict: "org_id,role_key" });
  return error ? { error: error.message } : { success: true, permissions: matrix };
}
