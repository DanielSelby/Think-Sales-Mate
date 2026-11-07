const PRODUCT_LAUNCH_PATHS: Record<string, string> = {
  "thinksales-erp": "/dashboard",
  restaurant: "/restaurant/dashboard",
  "think-service-repairs": "/service-center",
};

export function getProductLaunchPath(productSlug: string): string | null {
  return PRODUCT_LAUNCH_PATHS[productSlug] ?? null;
}
