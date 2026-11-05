import { describe, expect, it } from "vitest";
import { parseServiceQuotationLines } from "./quotation-validation";

describe("parseServiceQuotationLines", () => {
  it("parses valid items and ignores completely empty rows", () => {
    expect(parseServiceQuotationLines(
      ["Replacement part", ""],
      ["2.5", ""],
      ["12.40", ""],
    )).toEqual({
      ok: true,
      items: [{ description: "Replacement part", quantity: 2.5, unit_price: 12.4 }],
    });
  });

  it("rejects incomplete or invalid numeric values", () => {
    expect(parseServiceQuotationLines(["Repair labor"], [""], ["25"])).toMatchObject({ ok: false });
    expect(parseServiceQuotationLines(["Repair labor"], ["1"], ["1.234"])).toMatchObject({ ok: false });
    expect(parseServiceQuotationLines(["Repair labor"], ["0"], ["25"])).toMatchObject({ ok: false });
  });

  it("requires at least one item and caps the number of items", () => {
    expect(parseServiceQuotationLines([""], [""], [""])).toMatchObject({ ok: false });
    const descriptions = Array.from({ length: 51 }, (_, index) => `Item ${index + 1}`);
    expect(parseServiceQuotationLines(descriptions, descriptions.map(() => "1"), descriptions.map(() => "0"))).toMatchObject({ ok: false });
  });
});
