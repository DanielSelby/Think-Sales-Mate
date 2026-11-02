import type { PlatformProductSlug } from "@/types/platform-database";

const ACCESSIBLE_WITH_EITHER_PRODUCT = [
  "/accounting/restaurant-ledger",
  "/approvals",
  "/assets",
  "/banking/cash-closing",
  "/communication",
  "/expenses",
  "/fraud",
  "/hrm",
  "/settings",
] as const;

const ENTITLEMENT_EXEMPT_PATHS = [
  "/api/cron",
  "/api/platform-admin",
  "/api/restaurant-order",
  "/api/system-logo",
  "/auth/",
  "/login",
  "/onboarding",
  "/platform-admin",
  "/registration-status",
  "/reset-password",
  "/signup",
  "/subscription-status",
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

export function getRequiredProductSlugs(pathname: string): PlatformProductSlug[] | null {
  if (ENTITLEMENT_EXEMPT_PATHS.some((path) =>
    path.endsWith("/") ? pathname.startsWith(path) : isPathOrChild(pathname, path)
  )) {
    return null;
  }
  if (isPathOrChild(pathname, "/settings/customer-ordering")) {
    return ["thinksales-erp"];
  }
  if (pathname === "/dashboard" || pathname === "/") {
    return ["thinksales-erp", "restaurant"];
  }
  if (isPathOrChild(pathname, "/restaurant")) {
    return ["restaurant"];
  }
  if (ACCESSIBLE_WITH_EITHER_PRODUCT.some((path) => isPathOrChild(pathname, path))) {
    return ["thinksales-erp", "restaurant"];
  }
  return ["thinksales-erp"];
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
