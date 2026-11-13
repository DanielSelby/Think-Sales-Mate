import { describe, expect, it } from "vitest";
import {
  getEducationLibraryCirculationStatus,
  summarizeEducationLibraryCirculation,
} from "./library-report";

describe("education library circulation report", () => {
  it("classifies returned, currently due, and overdue loans", () => {
    expect(getEducationLibraryCirculationStatus(
      { branch_id: "campus-a", due_on: "2026-11-11", returned_on: "2026-11-12" },
      "2026-11-12",
    )).toBe("returned");
    expect(getEducationLibraryCirculationStatus(
      { branch_id: "campus-a", due_on: "2026-11-12", returned_on: null },
      "2026-11-12",
    )).toBe("open");
    expect(getEducationLibraryCirculationStatus(
      { branch_id: "campus-a", due_on: "2026-11-11", returned_on: null },
      "2026-11-12",
    )).toBe("overdue");
  });

  it("summarizes loan counts by campus and circulation status without borrower details", () => {
    expect(summarizeEducationLibraryCirculation([
      { branch_id: "campus-b", due_on: "2026-11-11", returned_on: null },
      { branch_id: "campus-a", due_on: "2026-11-20", returned_on: null },
      { branch_id: "campus-b", due_on: "2026-11-10", returned_on: "2026-11-11" },
      { branch_id: "campus-b", due_on: "2026-11-12", returned_on: null },
    ], "2026-11-12")).toEqual([
      { branch_id: "campus-a", status: "open", loan_count: 1 },
      { branch_id: "campus-b", status: "open", loan_count: 1 },
      { branch_id: "campus-b", status: "overdue", loan_count: 1 },
      { branch_id: "campus-b", status: "returned", loan_count: 1 },
    ]);
  });
});
