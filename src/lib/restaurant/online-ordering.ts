export const PAYSTACK_CURRENCIES = ["GHS", "NGN", "USD", "ZAR"] as const;

export function getRestaurantOnlineBaseUrl() {
  const configuredUrl = process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  if (!configuredUrl) return null;
  try {
    const url = new URL(configuredUrl);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function getRestaurantOrderTrackingUrl(token: string) {
  const baseUrl = getRestaurantOnlineBaseUrl();
  if (!baseUrl) return null;
  return new URL(`/restaurant-order/track/${encodeURIComponent(token)}`, baseUrl).toString();
}

export function isRestaurantPaystackAvailable(currency: string) {
  return Boolean(process.env.PAYSTACK_SECRET_KEY?.trim())
    && Boolean(getRestaurantOnlineBaseUrl())
    && PAYSTACK_CURRENCIES.includes(currency as typeof PAYSTACK_CURRENCIES[number]);
}
