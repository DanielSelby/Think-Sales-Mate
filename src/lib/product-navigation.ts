export type ProductNavigationScope = "thinksales-erp" | "restaurant" | "think-service-repairs";

type NavigationItem = { label: string };
type NavigationChild = { label: string; restaurantIntegration?: boolean };

function isPathOrChild(pathname: string, path: string) {
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function getProductNavigationScope(pathname: string): ProductNavigationScope {
  if (isPathOrChild(pathname, "/service-center")) return "think-service-repairs";
  if (isPathOrChild(pathname, "/restaurant")) return "restaurant";
  return "thinksales-erp";
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
    child.restaurantIntegration
    || child.label === "Inventory Intelligence"
    || !enabledModules?.includes(`__children:${parentLabel}`)
    || enabledModules.includes(`${parentLabel}:${child.label}`)
  );
}
