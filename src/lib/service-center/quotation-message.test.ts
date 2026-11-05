import { describe, expect, it } from "vitest";
import { buildServiceQuotationMessage } from "./quotation-message";

describe("buildServiceQuotationMessage", () => {
  it("includes saved line totals, tax, total, notes, and job reference", () => {
    expect(buildServiceQuotationMessage({
      customerName: "Amina",
      jobNumber: "SR-0012",
      version: 2,
      currency: "GHS",
      items: [{ description: "Screen replacement", quantity: 1, line_total: 250 }],
      subtotal: 250,
      taxRate: 5,
      taxAmount: 12.5,
      total: 262.5,
      notes: "Ready in two days.",
    })).toContain("Screen replacement x 1: GHS 250.00\nSubtotal: GHS 250.00\nTax (5%): GHS 12.50\nTotal: GHS 262.50\nNotes: Ready in two days.");
  });

  it("omits an empty note", () => {
    const message = buildServiceQuotationMessage({
      customerName: "Amina",
      jobNumber: "SR-0012",
      version: 1,
      currency: "USD",
      items: [{ description: "Inspection", quantity: 1, line_total: 0 }],
      subtotal: 0,
      taxRate: 0,
      taxAmount: 0,
      total: 0,
      notes: null,
    });

    expect(message).not.toContain("Notes:");
  });
});
