import { describe, expect, it } from "vitest";
import { summarizeEducationAssets, summarizeEducationInventory } from "./inventory-report";

describe("summarizeEducationInventory", () => {
  it("summarizes active stock and counts items at or below reorder levels", () => {
    expect(summarizeEducationInventory([
      { branch_id: "campus-b", category: "Stationery", unit: "box", quantity_on_hand: 4, reorder_level: 5, status: "active" },
      { branch_id: "campus-a", category: "Science", unit: "piece", quantity_on_hand: 10, reorder_level: 2, status: "active" },
      { branch_id: "campus-b", category: "Stationery", unit: "box", quantity_on_hand: 5, reorder_level: 5, status: "active" },
      { branch_id: "campus-b", category: "Stationery", unit: "box", quantity_on_hand: 100, reorder_level: 1, status: "archived" },
    ])).toEqual([
      {
        branch_id: "campus-a",
        category: "Science",
        unit: "piece",
        item_count: 1,
        quantity_on_hand: 10,
        low_stock_count: 0,
      },
      {
        branch_id: "campus-b",
        category: "Stationery",
        unit: "box",
        item_count: 2,
        quantity_on_hand: 9,
        low_stock_count: 2,
      },
    ]);
  });
});

describe("summarizeEducationAssets", () => {
  it("groups assets by campus, category, and status", () => {
    expect(summarizeEducationAssets([
      { branch_id: "campus-b", category: "Laptop", status: "assigned" },
      { branch_id: "campus-a", category: "Furniture", status: "available" },
      { branch_id: "campus-b", category: "Laptop", status: "assigned" },
      { branch_id: "campus-b", category: "Laptop", status: "maintenance" },
    ])).toEqual([
      { branch_id: "campus-a", category: "Furniture", status: "available", asset_count: 1 },
      { branch_id: "campus-b", category: "Laptop", status: "assigned", asset_count: 2 },
      { branch_id: "campus-b", category: "Laptop", status: "maintenance", asset_count: 1 },
    ]);
  });
});
