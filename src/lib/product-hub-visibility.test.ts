import { describe, expect, it } from "vitest";
import { shouldShowProductInHub } from "./product-hub-visibility";

describe("product hub visibility", () => {
  it("hides suspended, cancelled, and unentitled products", () => {
    expect(shouldShowProductInHub("suspended")).toBe(false);
    expect(shouldShowProductInHub("cancelled")).toBe(false);
    expect(shouldShowProductInHub("not_entitled")).toBe(false);
  });

  it("keeps products visible during active, pending, and read-only billing states", () => {
    expect(shouldShowProductInHub("active")).toBe(true);
    expect(shouldShowProductInHub("trial")).toBe(true);
    expect(shouldShowProductInHub("pending")).toBe(true);
    expect(shouldShowProductInHub("grace")).toBe(true);
    expect(shouldShowProductInHub("expired")).toBe(true);
  });
});
