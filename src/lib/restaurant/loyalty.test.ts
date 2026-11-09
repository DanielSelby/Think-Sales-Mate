import { describe, expect, it } from "vitest";
import {
  calculateRestaurantLoyaltyDiscount,
  calculateRestaurantLoyaltyPointsEarned,
} from "./loyalty";

describe("Restaurant loyalty calculations", () => {
  it("redeems 100 points for one currency unit", () => {
    expect(calculateRestaurantLoyaltyDiscount(350, 20)).toBe(3.5);
  });

  it("caps redemption at the order total", () => {
    expect(calculateRestaurantLoyaltyDiscount(500, 2.25)).toBe(2.25);
  });

  it("does not apply invalid or negative loyalty values", () => {
    expect(calculateRestaurantLoyaltyDiscount(1.5, 20)).toBe(0);
    expect(calculateRestaurantLoyaltyDiscount(-1, 20)).toBe(0);
  });

  it("earns one point per whole currency unit paid", () => {
    expect(calculateRestaurantLoyaltyPointsEarned(17.99)).toBe(17);
    expect(calculateRestaurantLoyaltyPointsEarned(0.99)).toBe(0);
    expect(calculateRestaurantLoyaltyPointsEarned(0)).toBe(0);
  });
});
