import { describe, expect, it } from "vitest";
import { getEducationPortalAuthRedirectTo, getSafeAuthCallbackNext } from "./portal-auth";

describe("Think Education portal auth redirects", () => {
  it("uses the configured site origin and exact portal destination", () => {
    expect(getEducationPortalAuthRedirectTo("https://school.example/some/path", "/teacher-education-portal"))
      .toBe("https://school.example/auth/callback?next=%2Fteacher-education-portal");
  });

  it("rejects unsupported portal paths", () => {
    expect(() => getEducationPortalAuthRedirectTo("https://school.example", "/login"))
      .toThrow("The requested Think Education portal is not supported.");
  });

  it("only accepts same-origin callback destinations", () => {
    expect(getSafeAuthCallbackNext("/student-education-portal", "https://school.example", "/onboarding"))
      .toBe("/student-education-portal");
    expect(getSafeAuthCallbackNext("//attacker.example", "https://school.example", "/onboarding"))
      .toBe("/onboarding");
    expect(getSafeAuthCallbackNext("https://attacker.example/path", "https://school.example", "/onboarding"))
      .toBe("/onboarding");
  });
});
