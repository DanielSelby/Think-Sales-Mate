import { describe, expect, it } from "vitest";
import { calculateCustomerOutstandingBalances } from "./customer-outstanding";

describe("calculateCustomerOutstandingBalances", () => {
  it("uses the unpaid remainder of partially paid invoices", () => {
    const balances = calculateCustomerOutstandingBalances([], [], [
      { customer_name: "Acme Catering", amount: 250, amount_paid: 90 },
      { customer_name: "Acme Catering", amount: 40, amount_paid: 40 },
    ]);

    expect(balances.byCustomerName.get("acme catering")).toBe(160);
  });

  it("keeps legacy invoice rows without a paid amount fully outstanding", () => {
    const balances = calculateCustomerOutstandingBalances([], [], [
      { customer_name: "Acme Catering", amount: 125 },
    ]);

    expect(balances.byCustomerName.get("acme catering")).toBe(125);
  });
});
