import { beforeEach, describe, expect, it, vi } from "vitest";

const { appRpc, platformRpc } = vi.hoisted(() => ({
  appRpc: vi.fn(),
  platformRpc: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: appRpc }),
}));
vi.mock("@/lib/supabase/platform-admin", () => ({
  createPlatformAdminClient: () => ({ rpc: platformRpc }),
}));

import { syncPlatformUsageSnapshot } from "./platform-usage";

describe("syncPlatformUsageSnapshot", () => {
  beforeEach(() => {
    appRpc.mockReset();
    platformRpc.mockReset();
  });

  it("synchronizes measurable usage metrics for the rolling 30-day window", async () => {
    const now = new Date("2026-11-02T12:00:00.000Z");
    const snapshots = [{
      organization_id: "org-1",
      active_users: 3,
      branches: 2,
      products: 15,
      customers: 8,
      orders: 6,
      purchase_count: 2,
      sales_volume: 940.5,
      ai_usage: 12,
      monthly_activity: 8,
    }];
    appRpc.mockResolvedValue({ data: snapshots, error: null });
    platformRpc
      .mockResolvedValueOnce({ data: 1, error: null })
      .mockResolvedValueOnce({ data: [], error: null });

    await expect(syncPlatformUsageSnapshot(now)).resolves.toEqual({
      organizations: 1,
      synchronized: 1,
      skipped: [],
      windowStart: "2026-10-03T12:00:00.000Z",
    });
    expect(appRpc).toHaveBeenCalledWith("get_platform_usage_snapshot", {
      p_since: "2026-10-03T12:00:00.000Z",
    });
    expect(platformRpc).toHaveBeenCalledWith("sync_platform_usage_snapshot", {
      p_snapshots: snapshots,
    });
    expect(platformRpc).toHaveBeenCalledWith("get_unmatched_platform_usage_organizations", {
      p_organization_ids: ["org-1"],
    });
  });

  it("reports IDs and reasons for organizations missing from Platform Admin", async () => {
    const organizationIds = ["org-1", "org-2", "org-3"];
    appRpc.mockResolvedValue({
      data: organizationIds.map((organization_id) => ({
        organization_id,
        active_users: 0,
        branches: 0,
        products: 0,
        customers: 0,
        orders: 0,
        purchase_count: 0,
        sales_volume: 0,
        ai_usage: 0,
        monthly_activity: 0,
      })),
      error: null,
    });
    platformRpc
      .mockResolvedValueOnce({ data: 1, error: null })
      .mockResolvedValueOnce({ data: ["org-2", "org-3"], error: null });

    await expect(syncPlatformUsageSnapshot()).resolves.toMatchObject({
      organizations: 3,
      synchronized: 1,
      skipped: [
        { organizationId: "org-2", reason: "not_registered_in_platform_admin" },
        { organizationId: "org-3", reason: "not_registered_in_platform_admin" },
      ],
    });
  });

  it("surfaces application snapshot errors without writing partial metrics", async () => {
    appRpc.mockResolvedValue({ data: null, error: { message: "application database unavailable" } });

    await expect(syncPlatformUsageSnapshot()).rejects.toThrow(
      "Could not read application usage snapshots: application database unavailable"
    );
    expect(platformRpc).not.toHaveBeenCalled();
  });

  it("rejects malformed or failed Platform Admin synchronization responses", async () => {
    appRpc.mockResolvedValue({ data: [], error: null });
    platformRpc.mockResolvedValue({ data: null, error: { message: "platform database unavailable" } });

    await expect(syncPlatformUsageSnapshot()).rejects.toThrow(
      "Could not update Platform Admin usage metrics: platform database unavailable"
    );

    platformRpc.mockResolvedValue({ data: "one", error: null });
    await expect(syncPlatformUsageSnapshot()).rejects.toThrow(
      "Platform Admin usage synchronization returned an invalid result."
    );
  });

  it("surfaces diagnostics failures and inconsistent skipped counts", async () => {
    appRpc.mockResolvedValue({
      data: [
        { organization_id: "org-1" },
        { organization_id: "org-2" },
      ],
      error: null,
    });
    platformRpc
      .mockResolvedValueOnce({ data: 1, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "diagnostics unavailable" } });

    await expect(syncPlatformUsageSnapshot()).rejects.toThrow(
      "Could not identify unmatched Platform Admin organizations: diagnostics unavailable"
    );

    platformRpc
      .mockResolvedValueOnce({ data: 1, error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    await expect(syncPlatformUsageSnapshot()).rejects.toThrow(
      "Platform Admin usage diagnostics returned an inconsistent result."
    );
  });
});
