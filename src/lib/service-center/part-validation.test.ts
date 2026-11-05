import { describe, expect, it } from "vitest";
import { parseServiceJobParts } from "./part-validation";

const productA = "192c7116-3868-4b54-a809-52026070f451";
const productB = "30d11175-ab3f-4d16-bada-a569b6459937";

describe("parseServiceJobParts", () => {
  it("parses integer quantities and combines duplicate product lines", () => {
    expect(parseServiceJobParts([productA, productB, productA], ["2", "1", "3"])).toEqual({
      ok: true,
      items: [
        { product_id: productA, quantity: 5 },
        { product_id: productB, quantity: 1 },
      ],
    });
  });

  it("rejects malformed products and fractional quantities", () => {
    expect(parseServiceJobParts(["not-a-uuid"], ["1"])).toMatchObject({ ok: false });
    expect(parseServiceJobParts([productA], ["1.5"])).toMatchObject({ ok: false });
  });

  it("requires parts and enforces the maximum quantity", () => {
    expect(parseServiceJobParts([""], [""])).toMatchObject({ ok: false });
    expect(parseServiceJobParts([productA], ["10001"])).toMatchObject({ ok: false });
    expect(parseServiceJobParts([productA, productA], ["6000", "5000"])).toMatchObject({ ok: false });
  });
});
