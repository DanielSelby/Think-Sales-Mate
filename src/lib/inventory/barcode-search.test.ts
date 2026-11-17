import { describe, expect, it } from "vitest";
import { findExactProductMatch, normalizeInventorySearchToken } from "./barcode-search";

describe("normalizeInventorySearchToken", () => {
  it("normalizes scanner input by trimming spaces and lowercasing", () => {
    expect(normalizeInventorySearchToken(" ABC-123 ")).toBe("abc-123");
    expect(normalizeInventorySearchToken("  MX  123 ")).toBe("mx123");
  });
});

describe("findExactProductMatch", () => {
  it("returns a single product when the scanner input matches one product exactly", () => {
    const products = [
      { id: "1", name: "Laptop Stand", sku: "LS-001", barcode: "ABC-123" },
      { id: "2", name: "Keyboard", sku: "KB-002", barcode: "DEF-456" },
    ];

    expect(findExactProductMatch(products, " ABC-123 ")).toEqual(products[0]);
    expect(findExactProductMatch(products, "LS-001")).toEqual(products[0]);
  });

  it("returns null when a scanned value has multiple candidate matches or no match", () => {
    const products = [
      { id: "1", name: "Laptop Stand", sku: "LS-001", barcode: "ABC-123" },
      { id: "2", name: "Keyboard", sku: "AB C-123", barcode: "DEF-456" },
    ];

    expect(findExactProductMatch(products, "abc123")).toBeNull();
    expect(findExactProductMatch(products, "UNKNOWN")).toBeNull();
  });
});
