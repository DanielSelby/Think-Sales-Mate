import { getProductAppPath } from "@/lib/product-app-routes";

const PRODUCT_LAUNCH_PATHS: Record<string, string> = {
  "thinksales-erp": getProductAppPath("thinksales-erp"),
  restaurant: getProductAppPath("restaurant"),
  "think-service-repairs": getProductAppPath("think-service-repairs"),
  "think-education": getProductAppPath("think-education"),
};

export function getProductLaunchPath(productSlug: string): string | null {
  return PRODUCT_LAUNCH_PATHS[productSlug] ?? null;
}
