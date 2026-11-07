import { describe, expect, it } from "vitest";
import { getProductLaunchPath } from "./product-launch-path";

describe("product launch paths", () => {
  it("opens each registered application at its existing dashboard", () => {
    expect(getProductLaunchPath("thinksales-erp")).toBe("/dashboard");
    expect(getProductLaunchPath("restaurant")).toBe("/restaurant/dashboard");
    expect(getProductLaunchPath("think-service-repairs")).toBe("/service-center");
  });

  it("does not invent a destination for an unregistered application", () => {
    expect(getProductLaunchPath("think-school")).toBeNull();
  });
});
