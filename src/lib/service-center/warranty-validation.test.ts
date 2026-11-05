import { describe, expect, it } from "vitest";
import { getServiceAssetWarrantyStatus, parseServiceAssetWarranty } from "./warranty-validation";

describe("parseServiceAssetWarranty", () => {
  it("normalizes optional warranty details", () => {
    expect(parseServiceAssetWarranty({
      provider: "  Acme  ",
      reference: " W-123 ",
      startDate: "2026-01-01",
      endDate: "2027-01-01",
      terms: "Parts only",
    })).toEqual({
      ok: true,
      warranty: {
        warranty_provider: "Acme",
        warranty_reference: "W-123",
        warranty_start_date: "2026-01-01",
        warranty_end_date: "2027-01-01",
        warranty_terms: "Parts only",
      },
    });
  });

  it("rejects incomplete or invalid date ranges", () => {
    expect(parseServiceAssetWarranty({
      provider: "", reference: "", startDate: "2026-01-01", endDate: "", terms: "",
    })).toMatchObject({ ok: false });
    expect(parseServiceAssetWarranty({
      provider: "", reference: "", startDate: "2026-02-30", endDate: "2026-03-01", terms: "",
    })).toMatchObject({ ok: false });
    expect(parseServiceAssetWarranty({
      provider: "", reference: "", startDate: "2026-02-01", endDate: "2026-01-01", terms: "",
    })).toMatchObject({ ok: false });
  });
});

describe("getServiceAssetWarrantyStatus", () => {
  it("distinguishes upcoming, active, expired, and unrecorded coverage", () => {
    expect(getServiceAssetWarrantyStatus("2027-01-01", "2027-12-31", "2026-12-31")).toBe("upcoming");
    expect(getServiceAssetWarrantyStatus("2026-01-01", "2026-12-31", "2026-12-31")).toBe("active");
    expect(getServiceAssetWarrantyStatus("2025-01-01", "2025-12-31", "2026-01-01")).toBe("expired");
    expect(getServiceAssetWarrantyStatus(null, null, "2026-01-01")).toBe("not_recorded");
  });
});
