import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRestaurantOnlineBaseUrl, getRestaurantOrderTrackingUrl, isRestaurantPaystackAvailable } from "./online-ordering";

describe("restaurant online payment configuration", () => {
  beforeEach(() => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "paystack-test-secret");
    vi.stubEnv("SITE_URL", "https://restaurant.example");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://restaurant.example");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("only enables Paystack for configured URLs and supported currencies", () => {
    expect(isRestaurantPaystackAvailable("GHS")).toBe(true);
    expect(isRestaurantPaystackAvailable("EUR")).toBe(false);
    vi.stubEnv("PAYSTACK_SECRET_KEY", "");
    expect(isRestaurantPaystackAvailable("GHS")).toBe(false);
  });

  it("requires HTTPS for public payment callbacks but permits local development", () => {
    vi.stubEnv("SITE_URL", "http://restaurant.example");
    expect(getRestaurantOnlineBaseUrl()).toBeNull();
    vi.stubEnv("SITE_URL", "http://localhost:3000");
    expect(getRestaurantOnlineBaseUrl()).toBe("http://localhost:3000");
  });

  it("creates a public tracking link from the configured site origin", () => {
    expect(getRestaurantOrderTrackingUrl("a-token")).toBe("https://restaurant.example/restaurant-order/track/a-token");
    vi.stubEnv("SITE_URL", "http://restaurant.example");
    expect(getRestaurantOrderTrackingUrl("a-token")).toBeNull();
  });
});
