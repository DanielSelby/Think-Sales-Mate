import {
  getProductAppPath,
  getProductAppPathPrefix,
  isOrganizationWideRoute,
  resolveProductAppRoute,
} from "./product-app-routes";
import { getRequiredProductSlugs } from "./product-entitlement-routes";

export type ProductNavigationScope = "thinksales-erp" | "restaurant" | "think-service-repairs";

type NavigationItem = { label: string };
type NavigationChild = { label: string; restaurantIntegration?: boolean; alwaysVisible?: boolean };

function isPathOrChild(pathname: string, path: string) {
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function getProductNavigationScope(pathname: string): ProductNavigationScope {
  const appRoute = resolveProductAppRoute(pathname);
  if (appRoute?.kind === "valid") return appRoute.productSlug;
  if (isPathOrChild(pathname, "/service-center")) return "think-service-repairs";
  if (isPathOrChild(pathname, "/restaurant")) return "restaurant";
  return "thinksales-erp";
}

export function getProductScopedHref(pathname: string, href: string): string | null {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const url = new URL(href, "http://localhost");
  const currentRoute = resolveProductAppRoute(pathname);
  if (!currentRoute || currentRoute.kind !== "valid") return href;

  const targetRoute = resolveProductAppRoute(url.pathname);
  if (targetRoute?.kind === "invalid") return null;
  if (targetRoute?.kind === "valid") {
    return targetRoute.productSlug === currentRoute.productSlug ? href : null;
  }
  if (isOrganizationWideRoute(url.pathname)) {
    return `${getProductAppPath(currentRoute.productSlug, url.pathname)}${url.search}${url.hash}`;
  }

  const pageProducts = getRequiredProductSlugs(url.pathname);
  if (!pageProducts?.includes(currentRoute.productSlug)) return null;

  const prefix = getProductAppPathPrefix(pathname);
  if (!prefix) return href;

  const legacyBase = currentRoute.productSlug === "restaurant"
    ? "/restaurant"
    : currentRoute.productSlug === "think-service-repairs" ? "/service-center" : "";
  const relativePath = legacyBase && (url.pathname === legacyBase || url.pathname.startsWith(`${legacyBase}/`))
    ? url.pathname.slice(legacyBase.length) || "/"
    : url.pathname;
  return `${getProductAppPath(currentRoute.productSlug, relativePath)}${url.search}${url.hash}`;
}

export function getProductNavigationItems<T extends NavigationItem>(
  items: readonly T[],
  scope: ProductNavigationScope,
): T[] {
  if (scope === "think-service-repairs") {
    return items.filter((item) => item.label === "Think Service & Repairs");
  }
  if (scope === "restaurant") {
    return items.filter((item) => item.label === "Restaurant");
  }
  return items.filter((item) => item.label !== "Think Service & Repairs" && item.label !== "Restaurant");
}

export function getVisibleNavigationChildren<T extends NavigationChild>(
  children: readonly T[] | undefined,
  parentLabel: string,
  enabledModules?: readonly string[],
): T[] {
  return (children ?? []).filter((child) =>
    child.alwaysVisible
    || child.restaurantIntegration
    || child.label === "Inventory Intelligence"
    || !enabledModules?.includes(`__children:${parentLabel}`)
    || enabledModules.includes(`${parentLabel}:${child.label}`)
  );
}
