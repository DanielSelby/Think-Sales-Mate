import type { PlatformProductSlug } from "@/types/platform-database";
import {
  getProductAppPath,
  isOrganizationWideRoute,
  PRODUCT_APP_ROUTES,
  resolveProductAppRoute,
} from "@/lib/product-app-routes";

const ACCESSIBLE_WITH_EITHER_PRODUCT = PRODUCT_APP_ROUTES
  .flatMap((route) => route.sharedPaths ?? [])
  .concat("/settings");

const ENTITLEMENT_EXEMPT_PATHS = [
  "/api/cron",
  "/api/platform-admin",
  "/api/restaurant-order",
  "/api/system-logo",
  "/education-portal",
  "/student-education-portal",
  "/auth/",
  "/login",
  "/onboarding",
  "/organization-expired",
  "/platform-admin",
  "/registration-status",
  "/reset-password",
  "/service-repair/",
  "/product-hub",
  "/signup",
  "/subscription-status",
  "/support",
] as const;

const PERMISSION_MODULE_PATHS: Record<string, string> = {
  accounting: "/accounting",
  approvals: "/approvals",
  assets: "/assets",
  banking: "/banking",
  cash_closing: "/banking/cash-closing",
  communication: "/communication",
  customer_messaging: "/communication",
  customer_orders: "/orders",
  education: "/education",
  education_dashboard: "/education/dashboard",
  education_organization: "/education/organization",
  education_academics: "/education/academics",
  education_admissions: "/education/admissions",
  education_guardians: "/education/guardians",
  education_attendance: "/education/attendance",
  education_communication: "/education/communication",
  education_documents: "/education/documents",
  education_notifications: "/education/notifications",
  education_audit: "/education/activity",
  education_examinations: "/education/examinations",
  education_expenses: "/education/expenses",
  education_finance: "/education/finance",
  education_library: "/education/library",
  education_inventory_assets: "/education/inventory",
  education_promotion: "/education/promotion",
  education_reports: "/education/reports",
  education_results: "/education/results",
  education_settings: "/education/settings",
  education_staff: "/education/staff",
  education_students: "/education/students",
  education_timetables: "/education/timetables",
  education_transport: "/education/transport",
  education_transfers: "/education/transfers",
  education_user_management: "/education/settings/users",
  education_roles: "/education/settings/roles",
  customer_assets: "/service-center/assets",
  crm: "/crm",
  expenses: "/expenses",
  fraud: "/fraud",
  fraud_detection: "/fraud",
  hrm: "/hrm",
  hrm_payroll: "/hrm",
  inventory: "/inventory",
  orders: "/orders",
  payroll: "/hrm/payroll",
  pos: "/pos",
  purchases: "/purchases",
  reports: "/reports/sales",
  service_activities: "/service-center/activity",
  service_appointments: "/service-center/appointments",
  service_assets: "/service-center/assets",
  service_customers: "/service-center/customers",
  service_invoices: "/service-center/invoices",
  service_inventory: "/service-center/parts",
  service_jobs: "/service-center/jobs",
  service_job_cards: "/service-center/job-cards",
  service_payments: "/service-center/invoices",
  service_quotations: "/service-center/quotations",
  service_reports: "/service-center/reports",
  service_settings: "/service-center/settings",
  service_suppliers: "/service-center/suppliers",
  service_technicians: "/service-center/technicians",
  service_warranty: "/service-center/warranty",
  service_workshop: "/service-center/workshop",
  restaurant: "/restaurant",
  route_sales: "/route-sales",
  sales: "/sales",
  settings: "/settings",
  transfers: "/inventory/transfers",
  user_management: "/settings/organization",
};

function isPathOrChild(pathname: string, path: string) {
  return pathname === path || pathname.startsWith(`${path}/`);
}

function getLegacyRequiredProductSlugs(pathname: string): PlatformProductSlug[] | null {
  if (pathname === "/") return null;
  if (ENTITLEMENT_EXEMPT_PATHS.some((path) =>
    path.endsWith("/") ? pathname.startsWith(path) : isPathOrChild(pathname, path)
  )) {
    return null;
  }
  if (isPathOrChild(pathname, "/settings/customer-ordering")) {
    return ["thinksales-erp"];
  }
  if (isPathOrChild(pathname, "/education") || isPathOrChild(pathname, "/api/education")) {
    return ["think-education"];
  }
  if (pathname === "/dashboard") return ["thinksales-erp"];
  if (isPathOrChild(pathname, "/restaurant")) {
    return ["restaurant"];
  }
  if (isPathOrChild(pathname, "/api/service-center") || isPathOrChild(pathname, "/service-center")) {
    return ["think-service-repairs"];
  }
  if (ACCESSIBLE_WITH_EITHER_PRODUCT.some((path) => isPathOrChild(pathname, path))) {
    return ["thinksales-erp", "restaurant"];
  }
  return ["thinksales-erp"];
}

export function getRequiredProductSlugs(pathname: string): PlatformProductSlug[] | null {
  const appRoute = resolveProductAppRoute(pathname);
  if (!appRoute) return getLegacyRequiredProductSlugs(pathname);
  if (appRoute.kind === "invalid") return [];
  if (isOrganizationWideRoute(appRoute.appPath)) return [appRoute.productSlug];

  const pageProducts = getLegacyRequiredProductSlugs(appRoute.appPath);
  if (!pageProducts?.includes(appRoute.productSlug)) return [];
  return [appRoute.productSlug];
}

export function getLegacyProductAppPath(pathname: string): string | null {
  if (pathname.startsWith("/api/") || isOrganizationWideRoute(pathname)) return null;
  const requiredProducts = getLegacyRequiredProductSlugs(pathname);
  if (!requiredProducts || requiredProducts.length !== 1) return null;
  const legacyBase = PRODUCT_APP_ROUTES.find((route) => route.productSlug === requiredProducts[0])?.legacyPrefix ?? "";
  const relativePath = legacyBase && (pathname === legacyBase || pathname.startsWith(`${legacyBase}/`))
    ? pathname.slice(legacyBase.length) || "/"
    : pathname;
  return getProductAppPath(requiredProducts[0], relativePath);
}

export function hasAnyRequiredProductAccess(
  requiredProducts: readonly PlatformProductSlug[],
  readableProducts: ReadonlySet<PlatformProductSlug>,
): boolean {
  return requiredProducts.some((productSlug) => readableProducts.has(productSlug));
}

export function getRequiredProductSlugsForPermissionModule(
  module: string,
  page?: string,
  tab?: string,
): PlatformProductSlug[] {
  const moduleKey = module.toLowerCase().replace(/[\s-]+/g, "_");
  if (moduleKey === "banking" && page === "banking" && tab === "reconciliation") {
    return getRequiredProductSlugs("/banking/cash-closing") ?? ["thinksales-erp"];
  }
  return getRequiredProductSlugs(PERMISSION_MODULE_PATHS[moduleKey] ?? `/__permission/${moduleKey}`)
    ?? ["thinksales-erp"];
}

export function isOrganizationWidePermissionModule(module: string): boolean {
  const moduleKey = module.toLowerCase().replace(/[\s-]+/g, "_");
  const path = PERMISSION_MODULE_PATHS[moduleKey];
  return Boolean(path && isOrganizationWideRoute(path));
}

export function filterPermissionMatrixForProduct(
  permissions: Record<string, unknown>,
  productSlug: PlatformProductSlug,
): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(permissions).filter(([key]) => {
      const moduleKey = key.split(".", 1)[0];
      return !isOrganizationWidePermissionModule(moduleKey)
        && getRequiredProductSlugsForPermissionModule(moduleKey).includes(productSlug);
    }).flatMap(([key, actions]) =>
      Array.isArray(actions) && actions.every((action) => typeof action === "string")
        ? [[key, actions]]
        : []
    ),
  );
}
