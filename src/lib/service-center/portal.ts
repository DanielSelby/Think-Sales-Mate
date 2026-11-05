import { createHash, randomBytes } from "node:crypto";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function createServiceRepairPortalToken() {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

export function hashServiceRepairPortalToken(token: string): string | null {
  if (!TOKEN_PATTERN.test(token)) return null;
  return createHash("sha256").update(token).digest("hex");
}

export function getServiceRepairPortalBaseUrl(configuredUrl: string | undefined): string | null {
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

export function getServiceRepairPortalUrl(baseUrl: string, token: string): string {
  return new URL(`/service-repair/${encodeURIComponent(token)}`, baseUrl).toString();
}
