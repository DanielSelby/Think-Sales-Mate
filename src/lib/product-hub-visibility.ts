import type { EffectiveProductStatus } from "./product-entitlements";

export function shouldShowProductInHub(status: EffectiveProductStatus): boolean {
  return status !== "suspended" && status !== "cancelled" && status !== "not_entitled";
}
