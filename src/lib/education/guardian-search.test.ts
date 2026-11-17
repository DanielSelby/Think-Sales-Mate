import { describe, expect, it } from "vitest";
import { normalizeGuardianSearchValue } from "./guardian-search";

describe("Think Education guardian search normalization", () => {
  it("keeps common names and student identifiers searchable without brittle sanitization", () => {
    expect(normalizeGuardianSearchValue("  José O'Neil  ")).toBe("Jose ONeil");
    expect(normalizeGuardianSearchValue("Müller - STU-204/5")).toBe("Muller - STU-204/5");
  });

  it("trims and caps the search string without dropping useful tokens", () => {
    expect(normalizeGuardianSearchValue("   A  B   C   ")).toBe("A B C");
    expect(normalizeGuardianSearchValue("x".repeat(200))).toHaveLength(60);
  });
});
