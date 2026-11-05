import { describe, expect, it } from "vitest";
import { parseServiceInvoiceDueDate } from "./invoice-validation";

describe("parseServiceInvoiceDueDate", () => {
  it("accepts today and future dates", () => {
    expect(parseServiceInvoiceDueDate("2026-11-04", "2026-11-04")).toEqual({
      ok: true,
      dueDate: "2026-11-04",
    });
    expect(parseServiceInvoiceDueDate("2026-12-01", "2026-11-04")).toEqual({
      ok: true,
      dueDate: "2026-12-01",
    });
  });

  it("rejects malformed, impossible, and past dates", () => {
    expect(parseServiceInvoiceDueDate("2026-02-30", "2026-01-01")).toMatchObject({ ok: false });
    expect(parseServiceInvoiceDueDate("2026-11-03", "2026-11-04")).toMatchObject({ ok: false });
    expect(parseServiceInvoiceDueDate("", "2026-11-04")).toMatchObject({ ok: false });
  });
});
