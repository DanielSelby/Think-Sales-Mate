import { describe, expect, it } from "vitest";
import { getProductLaunchPath } from "./product-launch-path";

describe("product launch paths", () => {
  it("opens each registered application at its existing dashboard", () => {
    expect(getProductLaunchPath("thinksales-erp")).toBe("/app/thinksales/dashboard");
    expect(getProductLaunchPath("restaurant")).toBe("/app/restaurant");
    expect(getProductLaunchPath("think-service-repairs")).toBe("/app/think-service");
    expect(getProductLaunchPath("think-education")).toBe("/app/think-education/dashboard");
  });

  it("does not invent a destination for an unregistered application", () => {
    expect(getProductLaunchPath("think-school")).toBeNull();
  });
});
