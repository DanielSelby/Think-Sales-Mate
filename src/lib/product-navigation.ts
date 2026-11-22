import {
  getProductAppPath,
  getProductAppPathPrefix,
  isOrganizationWideRoute,
  PRODUCT_APP_ROUTES,
  resolveProductAppRoute,
} from "./product-app-routes";
import { getRequiredProductSlugs } from "./product-entitlement-routes";
import { CalendarClock } from "lucide-react";
import type { ComponentType } from "react";
import type { PlatformProductSlug } from "@/types/platform-database";

export type ProductNavigationScope = PlatformProductSlug;

type NavigationChild = {
  label: string;
  href: string;
  icon?: ComponentType<{ className?: string }>;
  restaurantIntegration?: boolean;
  alwaysVisible?: boolean;
};
type NavigationItem = {
  label: string;
  href: string;
  icon?: ComponentType<{ className?: string }>;
  status?: "live" | "soon";
  children?: readonly NavigationChild[];
  alwaysVisible?: boolean;
};

function isPathOrChild(pathname: string, path: string) {
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function getProductNavigationScope(pathname: string): ProductNavigationScope {
  const appRoute = resolveProductAppRoute(pathname);
  if (appRoute?.kind === "valid") return appRoute.productSlug;
  if (isPathOrChild(pathname, "/education")) return "think-education";
  if (isPathOrChild(pathname, "/service-center")) return "think-service-repairs";
  if (isPathOrChild(pathname, "/restaurant")) return "restaurant";
  return "thinksales-erp";
}

export function getProductScopedHref(pathname: string, href: string): string | null {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const url = new URL(href, "http://localhost");
  const currentRoute = resolveProductAppRoute(pathname);
  if (!currentRoute || currentRoute.kind !== "valid") {
    const isSupportRoute = url.pathname === "/support" || url.pathname.startsWith("/support/");
    const legacyProducts = isSupportRoute ? getRequiredProductSlugs(pathname) : null;
    if (legacyProducts?.length === 1) {
      return `${getProductAppPath(legacyProducts[0], url.pathname)}${url.search}${url.hash}`;
    }
    return href;
  }

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

  const legacyBase = PRODUCT_APP_ROUTES.find((route) => route.productSlug === currentRoute.productSlug)?.legacyPrefix ?? "";
  const relativePath = legacyBase && (url.pathname === legacyBase || url.pathname.startsWith(`${legacyBase}/`))
    ? url.pathname.slice(legacyBase.length) || "/"
    : url.pathname;
  return `${getProductAppPath(currentRoute.productSlug, relativePath)}${url.search}${url.hash}`;
}

export function getProductNavigationItems(
  items: readonly NavigationItem[],
  scope: ProductNavigationScope,
): NavigationItem[] {
  let scopedItems: NavigationItem[];
  if (scope === "think-service-repairs") {
    scopedItems = items.filter((item) => item.label === "Think Service & Repairs");
  } else if (scope === "restaurant") {
    scopedItems = items.filter((item) => item.label === "Restaurant");
  } else if (scope === "think-education") {
    scopedItems = items.filter((item) => item.label === "Think Education");
  } else if (scope === "thinksales-erp") {
    scopedItems = items.filter((item) =>
      item.label !== "Think Service & Repairs" && item.label !== "Restaurant" && item.label !== "Think Education"
    );
    return scopedItems;
  } else {
    scopedItems = [];
  }

  const attendanceItem = items.find((item) => item.label === "HRM & Payroll")
    ?.children?.find((child) => child.label === "Attendance Management");
  if (!attendanceItem) return scopedItems;

  return [{
    label: attendanceItem.label,
    href: attendanceItem.href,
    icon: attendanceItem.icon ?? CalendarClock,
    status: "live",
    alwaysVisible: true,
  }, ...scopedItems];
}

export function getVisibleNavigationChildren(
  children: readonly NavigationChild[] | undefined,
  parentLabel: string,
  enabledModules?: readonly string[],
): NavigationChild[] {
  return (children ?? []).filter((child) =>
    child.alwaysVisible
    || child.restaurantIntegration
    || child.label === "Inventory Intelligence"
    || !enabledModules?.includes(`__children:${parentLabel}`)
    || enabledModules.includes(`${parentLabel}:${child.label}`)
  );
}
