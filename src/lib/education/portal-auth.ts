const EDUCATION_PORTAL_PATHS = new Set([
  "/student-education-portal",
  "/education-portal",
  "/teacher-education-portal",
]);

export function getEducationPortalAuthRedirectTo(siteUrl: string, portalPath: string) {
  if (!EDUCATION_PORTAL_PATHS.has(portalPath)) {
    throw new Error("The requested Think Education portal is not supported.");
  }

  const configuredUrl = new URL(siteUrl);
  if (configuredUrl.protocol !== "http:" && configuredUrl.protocol !== "https:") {
    throw new Error("The application URL must use HTTP or HTTPS.");
  }

  const callbackUrl = new URL("/auth/callback", configuredUrl.origin);
  callbackUrl.searchParams.set("next", portalPath);
  return callbackUrl.toString();
}

export function getSafeAuthCallbackNext(next: string | null, origin: string, fallback: string) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;

  try {
    const destination = new URL(next, origin);
    if (destination.origin !== origin) return fallback;
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return fallback;
  }
}
