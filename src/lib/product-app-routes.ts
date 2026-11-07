import type { PlatformProductSlug } from "@/types/platform-database";

export interface ProductAppRoute {
  productSlug: PlatformProductSlug;
  namespace: string;
  defaultPath: string;
  defaultLegacyPath: string;
  legacyPrefix: string;
  sharedPaths?: readonly string[];
}

export const PRODUCT_APP_ROUTES: readonly ProductAppRoute[] = [
  { productSlug: "thinksales-erp", namespace: "thinksales", defaultPath: "/dashboard", defaultLegacyPath: "/dashboard", legacyPrefix: "" },
  {
    productSlug: "restaurant",
    namespace: "restaurant",
    defaultPath: "",
    defaultLegacyPath: "/restaurant",
    legacyPrefix: "/restaurant",
    sharedPaths: [
      "/accounting/restaurant-ledger",
      "/approvals",
      "/assets",
      "/banking/cash-closing",
      "/communication",
      "/expenses",
      "/fraud",
      "/hrm",
    ],
  },
  { productSlug: "think-service-repairs", namespace: "think-service", defaultPath: "", defaultLegacyPath: "/service-center", legacyPrefix: "/service-center" },
];

export type ResolvedProductAppRoute =
  | { kind: "valid"; productSlug: PlatformProductSlug; appPath: string }
  | { kind: "invalid" };

export function resolveProductAppRoute(pathname: string): ResolvedProductAppRoute | null {
  if (pathname !== "/app" && !pathname.startsWith("/app/")) return null;

  const [, , namespace, ...segments] = pathname.split("/");
  const productRoute = PRODUCT_APP_ROUTES.find((route) => route.namespace === namespace);
  if (!productRoute) return { kind: "invalid" };

  const suffix = segments.length ? `/${segments.join("/")}` : "";
  const isSharedPath = productRoute.sharedPaths?.some((path) =>
    suffix === path || suffix.startsWith(`${path}/`)
  );
  const isContextualOrganizationPath = isOrganizationWideRoute(suffix);
  return {
    kind: "valid",
    productSlug: productRoute.productSlug,
    appPath: suffix
      ? isSharedPath || isContextualOrganizationPath ? suffix : `${productRoute.legacyPrefix}${suffix}`
      : productRoute.defaultLegacyPath,
  };
}

export function getProductAppPath(productSlug: PlatformProductSlug, appPath?: string): string {
  const route = PRODUCT_APP_ROUTES.find((item) => item.productSlug === productSlug);
  if (!route) throw new Error(`No application route is registered for product "${productSlug}".`);
  const path = appPath ?? (route.defaultPath || "/");
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error("Product application paths must be local absolute paths.");
  }
  return `/app/${route.namespace}${path === "/" ? "" : path}`;
}

export function getProductAppPathPrefix(pathname: string): string | null {
  const route = resolveProductAppRoute(pathname);
  if (!route || route.kind !== "valid") return null;
  const productRoute = PRODUCT_APP_ROUTES.find((item) => item.productSlug === route.productSlug);
  return productRoute ? `/app/${productRoute.namespace}` : null;
}

export function isOrganizationWideRoute(pathname: string): boolean {
  if (pathname === "/settings/customer-ordering" || pathname.startsWith("/settings/customer-ordering/")) {
    return false;
  }
  return pathname === "/settings"
    || pathname.startsWith("/settings/")
    || pathname === "/subscription-status"
    || pathname.startsWith("/subscription-status/")
    || pathname === "/product-hub"
    || pathname.startsWith("/product-hub/")
    || pathname === "/support"
    || pathname.startsWith("/support/");
}
