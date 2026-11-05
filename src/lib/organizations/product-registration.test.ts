import { describe, expect, it } from "vitest";
import { parseRequestedProductSlugs, ProductSelectionError } from "./product-registration";

const publishedProducts = ["thinksales-erp", "restaurant", "think-service-repairs"] as const;

describe("parseRequestedProductSlugs", () => {
  it("accepts one or more published products", () => {
    expect(parseRequestedProductSlugs(["restaurant"], publishedProducts)).toEqual(["restaurant"]);
    expect(parseRequestedProductSlugs(["restaurant", "thinksales-erp"], publishedProducts))
      .toEqual(["restaurant", "thinksales-erp"]);
    expect(parseRequestedProductSlugs(["think-service-repairs"], publishedProducts))
      .toEqual(["think-service-repairs"]);
  });

  it("rejects empty or unpublished product selections", () => {
    expect(() => parseRequestedProductSlugs([], publishedProducts))
      .toThrow(new ProductSelectionError("Select at least one product for your workspace."));
    expect(() => parseRequestedProductSlugs(["school"] as FormDataEntryValue[], publishedProducts))
      .toThrow("Choose only products currently available for registration.");
  });

  it("ignores duplicate form values", () => {
    expect(parseRequestedProductSlugs(["restaurant", "restaurant"], publishedProducts))
      .toEqual(["restaurant"]);
  });

  it("rejects file values", () => {
    const file = new File(["value"], "product.txt");
    expect(() => parseRequestedProductSlugs([file], publishedProducts))
      .toThrow("Choose only products currently available for registration.");
  });
});
