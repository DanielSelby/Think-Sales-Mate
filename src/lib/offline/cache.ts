export type OfflineDataLoadMode = "automatic" | "approval" | "manual";

export interface OfflineCachePayload {
  products: { id: string; name: string; sku: string; barcode?: string | null; price?: number | null }[];
  customers: { id: string; name: string; phone?: string | null }[];
  locations: { id: string; name: string }[];
  fetchedAt: string;
}

const OFFLINE_CACHE_KEY = "thinksales-offline-cache";

export function readOfflineCache(): OfflineCachePayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(OFFLINE_CACHE_KEY);
    return raw ? (JSON.parse(raw) as OfflineCachePayload) : null;
  } catch {
    return null;
  }
}

export function writeOfflineCache(payload: OfflineCachePayload) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(OFFLINE_CACHE_KEY, JSON.stringify(payload));
}

export async function loadOfflineData(): Promise<OfflineCachePayload | null> {
  try {
    const response = await fetch("/api/offline/cache");
    if (!response.ok) return null;
    const data = (await response.json()) as OfflineCachePayload;
    writeOfflineCache(data);
    return data;
  } catch {
    return null;
  }
}

export function getOfflineDataLoadMode(): OfflineDataLoadMode {
  if (typeof window === "undefined") return "automatic";
  const value = window.localStorage.getItem("thinksales-offline-data-load-mode");
  return value === "approval" || value === "manual" ? value : "automatic";
}

export function setOfflineDataLoadMode(mode: OfflineDataLoadMode) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("thinksales-offline-data-load-mode", mode);
}
