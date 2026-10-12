import { describe, expect, it } from "vitest";
import { normalizeBankTransactionSearch } from "./transaction-search";

describe("normalizeBankTransactionSearch", () => {
  it("preserves international letters and numbers while normalizing whitespace", () => {
    expect(normalizeBankTransactionSearch("  Café   payment #42  ")).toBe("Café payment 42");
  });

  it("removes filter syntax characters from search input", () => {
    expect(normalizeBankTransactionSearch("deposit,(vendor)%*")).toBe("deposit vendor");
  });

  it("returns an empty string when no searchable characters remain", () => {
    expect(normalizeBankTransactionSearch(" %,* ")).toBe("");
  });
});
