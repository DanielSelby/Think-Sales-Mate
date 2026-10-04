import { describe, expect, it } from "vitest";
import { isOrganizationSuperAdminMember, isSuperAdminRole } from "./member-access";

describe("organization super-admin membership", () => {
  it.each(["owner", "super_admin", "Super Admin", "super-admin"])(
    "recognizes the %s role",
    (role) => {
      expect(isSuperAdminRole(role)).toBe(true);
    }
  );

  it("does not recognize unrelated roles", () => {
    expect(isSuperAdminRole("admin")).toBe(false);
    expect(isSuperAdminRole(null)).toBe(false);
  });

  it("recognizes a super-admin role stored in access permissions", () => {
    expect(isOrganizationSuperAdminMember({
      role: "staff",
      accessPermissions: { role_key: "super_admin" },
    })).toBe(true);
  });

  it("recognizes the organization creator as an owner", () => {
    expect(isOrganizationSuperAdminMember({
      role: "admin",
      userId: "user-1",
      createdBy: "user-1",
    })).toBe(true);
  });

  it("does not treat a different member as the creator", () => {
    expect(isOrganizationSuperAdminMember({
      role: "admin",
      userId: "user-1",
      createdBy: "user-2",
    })).toBe(false);
  });
});
