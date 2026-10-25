import { describe, expect, it } from "vitest";
import {
  ALL_PLATFORM_ADMIN_PAGES,
  normalizePlatformAdminPages,
  platformRoleCanAccessPage,
} from "./platform-admin-pages";

describe("Platform Admin page permissions", () => {
  it("defaults legacy records to all pages", () => {
    expect(normalizePlatformAdminPages(null)).toEqual(ALL_PLATFORM_ADMIN_PAGES);
  });

  it("keeps only recognized page keys and removes duplicates", () => {
    expect(normalizePlatformAdminPages(["Overview", "Overview", "Unknown"])).toEqual(["Overview"]);
  });

  it("restricts non-owner access to explicitly assigned pages", () => {
    expect(platformRoleCanAccessPage("support_administrator", ["Complaints & Support"], "Complaints & Support")).toBe(true);
    expect(platformRoleCanAccessPage("support_administrator", ["Complaints & Support"], "Organizations")).toBe(false);
  });

  it("keeps all pages available to Platform Owners", () => {
    expect(platformRoleCanAccessPage("platform_owner", [], "Organizations")).toBe(true);
  });
});
