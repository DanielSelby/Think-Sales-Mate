import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: mocks.rpc }),
}));
vi.mock("@/lib/supabase/platform-admin", () => ({
  createPlatformAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: mocks.maybeSingle,
        }),
      }),
    }),
  }),
}));

import { increasesOrganizationSeatUsage, withOrganizationCapacity } from "./capacity";

describe("organization capacity reservations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.maybeSingle.mockResolvedValue({
      data: { plan_id: null, max_users_override: 5, max_branches_override: 2 },
      error: null,
    });

  });

  it("reserves before running the operation and releases afterward", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: "reservation-id", error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    const operation = vi.fn().mockResolvedValue("created");

    await expect(withOrganizationCapacity("org-id", "users", operation)).resolves.toBe("created");

    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "reserve_organization_capacity", {
      p_organization_id: "org-id",
      p_resource: "users",
      p_limit: 5,
      p_additional: 1,
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "release_organization_capacity", {
      p_reservation_id: "reservation-id",
    });
  });

  describe("organization seat usage transitions", () => {
    it("reserves a seat when reactivating a suspended member", () => {
      expect(increasesOrganizationSeatUsage("suspended", "active")).toBe(true);
    });

    it("does not reserve another seat when activating an invited member already counted", () => {
      expect(increasesOrganizationSeatUsage("invited", "active")).toBe(false);
    });

    it("does not reserve a seat for transitions that do not activate a suspended member", () => {
      expect(increasesOrganizationSeatUsage("active", "suspended")).toBe(false);
      expect(increasesOrganizationSeatUsage("invited", "suspended")).toBe(false);
    });
  });

  it("does not run the operation when reservation fails", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "capacity reached" } });
    const operation = vi.fn();

    await expect(withOrganizationCapacity("org-id", "branches", operation)).rejects.toThrow("capacity reached");

    expect(operation).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("releases a reservation when the operation fails and preserves the operation error", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: "reservation-id", error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    const operation = vi.fn().mockRejectedValue(new Error("member insert failed"));

    await expect(withOrganizationCapacity("org-id", "users", operation)).rejects.toThrow("member insert failed");

    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });

  it("does not reserve when the plan has no capacity limit", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { plan_id: null, max_users_override: null, max_branches_override: null },
      error: null,
    });
    const operation = vi.fn().mockResolvedValue("created");

    await expect(withOrganizationCapacity("org-id", "users", operation)).resolves.toBe("created");

    expect(operation).toHaveBeenCalledOnce();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects invalid reservation sizes before reading limits", async () => {
    await expect(withOrganizationCapacity("org-id", "users", async () => "created", 0))
      .rejects.toThrow("Additional organization capacity must be a positive integer.");

    expect(mocks.maybeSingle).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
