import { describe, expect, it } from "vitest";
import { normalizeEducationLibrarySearch } from "./library-search";

describe("Think Education library search", () => {
  it("preserves accented titles and turns apostrophes into phrase separators", () => {
    expect(normalizeEducationLibrarySearch("  José O’Neil  ")).toBe("José O%Neil");
    expect(normalizeEducationLibrarySearch("Müller - STU-204/5")).toBe("Müller - STU-204/5");
  });

  it("removes filter syntax and bounds the search term", () => {
    expect(normalizeEducationLibrarySearch("Book,(author).")).toBe("Book author");
    expect(normalizeEducationLibrarySearch("x".repeat(200))).toHaveLength(100);
  });
});
