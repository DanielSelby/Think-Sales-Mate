const EDUCATION_PORTAL_PATHS = new Set([
  "/student-education-portal",
  "/student-education-portal/assistant",
  "/student-education-portal/assignments",
  "/student-education-portal/attendance",
  "/student-education-portal/results",
  "/student-education-portal/timetable",
  "/education-portal",
  "/teacher-education-portal",
  "/teacher-education-portal/assignments",
  "/teacher-education-portal/classes",
  "/teacher-education-portal/attendance",
  "/teacher-education-portal/timetable",
]);

const EDUCATION_ORGANIZATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isEducationOrganizationId(value: unknown): value is string {
  return typeof value === "string" && EDUCATION_ORGANIZATION_ID_PATTERN.test(value);
}

export function getEducationPortalScopedPath(portalPath: string, organizationId: string) {
  if (!EDUCATION_PORTAL_PATHS.has(portalPath)) {
    throw new Error("The requested Think Education portal is not supported.");
  }
  if (!isEducationOrganizationId(organizationId)) {
    throw new Error("A valid organization is required for this Think Education portal link.");
  }

  const scopedPath = new URL(portalPath, "https://portal.invalid");
  scopedPath.searchParams.set("org", organizationId.toLowerCase());
  return `${scopedPath.pathname}${scopedPath.search}`;
}

export function getEducationPortalPathFromInput(portalPath: string, organizationId: unknown) {
  if (organizationId === null || organizationId === undefined || organizationId === "") return portalPath;
  if (!isEducationOrganizationId(organizationId)) return null;
  return getEducationPortalScopedPath(portalPath, organizationId);
}

export function getEducationPortalPostLoginPath(next: string | null) {
  if (!next) return "/product-hub";

  try {
    const destination = new URL(next, "https://portal.invalid");
    if (destination.origin !== "https://portal.invalid" || !EDUCATION_PORTAL_PATHS.has(destination.pathname)) {
      return "/product-hub";
    }

    const organizationIds = destination.searchParams.getAll("org");
    if (
      [...destination.searchParams.keys()].some((key) => key !== "org")
      || organizationIds.length > 1
      || destination.hash
    ) {
      return "/product-hub";
    }
    if (!organizationIds.length) return destination.pathname;
    if (!isEducationOrganizationId(organizationIds[0])) return "/product-hub";

    return getEducationPortalScopedPath(destination.pathname, organizationIds[0]);
  } catch {
    return "/product-hub";
  }
}

export function getEducationPortalStatusPath(
  portalPath: string,
  key: "signin" | "claim" | "profile" | "assignment" | "attendance",
  value: string
) {
  const safePath = getEducationPortalPostLoginPath(portalPath);
  if (safePath === "/product-hub") {
    throw new Error("The requested Think Education portal is not supported.");
  }

  const destination = new URL(safePath, "https://portal.invalid");
  destination.searchParams.set(key, value);
  return `${destination.pathname}${destination.search}`;
}

export function getEducationPortalAuthRedirectTo(siteUrl: string, portalPath: string) {
  const safePortalPath = getEducationPortalPostLoginPath(portalPath);
  if (safePortalPath === "/product-hub") {
    throw new Error("The requested Think Education portal is not supported.");
  }

  const configuredUrl = new URL(siteUrl);
  if (configuredUrl.protocol !== "http:" && configuredUrl.protocol !== "https:") {
    throw new Error("The application URL must use HTTP or HTTPS.");
  }

  const callbackUrl = new URL("/auth/callback", configuredUrl.origin);
  callbackUrl.searchParams.set("next", safePortalPath);
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
