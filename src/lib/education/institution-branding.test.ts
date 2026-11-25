import { describe, expect, it } from "vitest";
import {
  getEducationInstitutionDisplayName,
  getEducationInstitutionLogoUrl,
} from "./institution-branding";

describe("Think Education institution branding", () => {
  it("uses the organization name until an institution name is configured", () => {
    expect(getEducationInstitutionDisplayName(null, "Northstar Group")).toBe("Northstar Group");
    expect(getEducationInstitutionDisplayName("   ", "Northstar Group")).toBe("Northstar Group");
    expect(getEducationInstitutionDisplayName("Northstar Academy", "Northstar Group")).toBe("Northstar Academy");
  });

  it("prefers an institution logo and otherwise falls back to the organization logo", () => {
    expect(getEducationInstitutionLogoUrl("  https://cdn.example/academy.png  ", "https://cdn.example/group.png"))
      .toBe("https://cdn.example/academy.png");
    expect(getEducationInstitutionLogoUrl(null, "https://cdn.example/group.png"))
      .toBe("https://cdn.example/group.png");
    expect(getEducationInstitutionLogoUrl(null, null)).toBeNull();
  });
});
