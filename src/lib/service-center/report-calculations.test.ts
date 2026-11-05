import { describe, expect, it } from "vitest";
import {
  calculateAverageServiceTurnaroundDays,
  calculateServicePartsSummary,
  calculateServicePaymentSummary,
} from "./report-calculations";

describe("service report calculations", () => {
  it("summarizes collected payments by method", () => {
    expect(calculateServicePaymentSummary([
      { amount: 25, payment_method: "Cash" },
      { amount: 75, payment_method: "Card" },
      { amount: 10, payment_method: "Cash" },
    ])).toEqual({
      total: 110,
      count: 3,
      methods: [
        { name: "Card", count: 1, amount: 75 },
        { name: "Cash", count: 2, amount: 35 },
      ],
    });
  });

  it("calculates net parts value after recorded returns", () => {
    expect(calculateServicePartsSummary([
      { movement_type: "issued", quantity: 3, unit_cost: 20 },
      { movement_type: "returned", quantity: 1, unit_cost: 20 },
    ])).toEqual({ issuedQuantity: 3, returnedQuantity: 1, netCost: 40 });
  });

  it("averages only valid closed-job turnaround durations", () => {
    expect(calculateAverageServiceTurnaroundDays([
      { id: "one", created_at: "2026-01-01T00:00:00.000Z" },
      { id: "two", created_at: "2026-01-01T00:00:00.000Z" },
      { id: "not-closed", created_at: "2026-01-01T00:00:00.000Z" },
    ], new Map([
      ["one", "2026-01-03T00:00:00.000Z"],
      ["two", "2026-01-05T00:00:00.000Z"],
      ["unknown", "2026-01-10T00:00:00.000Z"],
    ]))).toBe(3);

    expect(calculateAverageServiceTurnaroundDays([], new Map())).toBeNull();
  });
});
