import { describe, expect, it } from "vitest";
import {
  getEducationPortalAuthRedirectTo,
  getEducationPortalPathFromInput,
  getEducationPortalPostLoginPath,
  getEducationPortalScopedPath,
  getEducationPortalStatusPath,
  getSafeAuthCallbackNext,
} from "./portal-auth";

describe("Think Education portal auth redirects", () => {
  const organizationId = "92235979-07d6-4f82-b29a-9d0b55076442";

  it("uses the configured site origin and exact portal destination", () => {
    expect(getEducationPortalAuthRedirectTo("https://school.example/some/path", "/teacher-education-portal"))
      .toBe("https://school.example/auth/callback?next=%2Fteacher-education-portal");
  });

  it("creates organization-scoped portal URLs and preserves them after password changes", () => {
    const scopedPath = getEducationPortalScopedPath("/student-education-portal", organizationId);
    expect(scopedPath).toBe(`/student-education-portal?org=${organizationId}`);
    expect(getEducationPortalPostLoginPath(scopedPath)).toBe(scopedPath);
    expect(getEducationPortalPathFromInput("/student-education-portal", organizationId)).toBe(scopedPath);
    expect(getEducationPortalStatusPath(scopedPath, "signin", "invalid"))
      .toBe(`/student-education-portal?org=${organizationId}&signin=invalid`);
    expect(getEducationPortalAuthRedirectTo("https://school.example", scopedPath))
      .toBe(`https://school.example/auth/callback?next=${encodeURIComponent(scopedPath)}`);
  });

  it("rejects unsupported portal paths", () => {
    expect(() => getEducationPortalAuthRedirectTo("https://school.example", "/login"))
      .toThrow("The requested Think Education portal is not supported.");
    expect(() => getEducationPortalScopedPath("/login", organizationId))
      .toThrow("The requested Think Education portal is not supported.");
    expect(() => getEducationPortalScopedPath("/student-education-portal", "not-an-org"))
      .toThrow("A valid organization is required for this Think Education portal link.");
    expect(getEducationPortalPathFromInput("/student-education-portal", "not-an-org")).toBeNull();
  });

  it("only accepts same-origin callback destinations", () => {
    expect(getSafeAuthCallbackNext("/student-education-portal", "https://school.example", "/onboarding"))
      .toBe("/student-education-portal");
    expect(getSafeAuthCallbackNext("//attacker.example", "https://school.example", "/onboarding"))
      .toBe("/onboarding");
    expect(getSafeAuthCallbackNext("https://attacker.example/path", "https://school.example", "/onboarding"))
      .toBe("/onboarding");
  });

  it("returns portal users to their portal after a forced password change", () => {
    expect(getEducationPortalPostLoginPath("/teacher-education-portal")).toBe("/teacher-education-portal");
    expect(getEducationPortalPostLoginPath(`/education-portal?org=${organizationId}`))
      .toBe(`/education-portal?org=${organizationId}`);
    expect(getEducationPortalPostLoginPath("/education-portal?org=invalid")).toBe("/product-hub");
    expect(getEducationPortalPostLoginPath(`/education-portal?org=${organizationId}&next=https://evil.example`))
      .toBe("/product-hub");
    expect(getEducationPortalPostLoginPath("/login")).toBe("/product-hub");
    expect(getEducationPortalPostLoginPath(null)).toBe("/product-hub");
  });
});
