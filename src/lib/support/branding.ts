export const DEFAULT_SUPPORT_CENTER_HERO_IMAGE_URL = "/support-center-artwork.jpeg";

export function getSupportCenterHeroStoragePath(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const path = (value as Record<string, unknown>).hero_storage_path;
  return typeof path === "string" && /^support-center\/hero\/[a-f0-9-]{36}\.(?:jpg|png|svg|webp)$/.test(path)
    ? path
    : null;
}
