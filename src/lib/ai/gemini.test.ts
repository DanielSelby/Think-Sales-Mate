import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { geminiErrorCode, safeGeminiErrorDetails, userFacingGeminiError } from "@/lib/ai/gemini";

describe("Gemini error handling", () => {
  it("turns common provider setup failures into actionable safe messages", () => {
    const invalidKey = Object.assign(new Error("API key not valid"), { status: 400 });
    const missingModel = Object.assign(new Error("Model not found"), { status: 404 });

    expect(geminiErrorCode(invalidKey)).toBe("provider_auth");
    expect(userFacingGeminiError(geminiErrorCode(invalidKey))).toContain("GEMINI_API_KEY");
    expect(geminiErrorCode(missingModel)).toBe("provider_model");
    expect(userFacingGeminiError(geminiErrorCode(missingModel))).toContain("gemini-3.8-flash");
    expect(userFacingGeminiError(geminiErrorCode(missingModel))).toContain("Google AI Studio");
  });

  it("does not expose provider details for temporary service failures", () => {
    const unavailable = Object.assign(new Error("Internal infrastructure details"), { status: 503 });

    expect(geminiErrorCode(unavailable)).toBe("provider_unavailable");
    expect(userFacingGeminiError(geminiErrorCode(unavailable))).not.toContain("infrastructure");
  });

  it("redacts API keys and URLs from diagnostic log details", () => {
    const error = Object.assign(
      new Error("API key=AIzaSy012345678901234567890123456789012345 at https://example.test/path"),
      { status: 404 }
    );
    const details = safeGeminiErrorDetails(error);

    expect(details.providerStatus).toBe(404);
    expect(details.providerMessage).not.toContain("AIzaSy");
    expect(details.providerMessage).not.toContain("https://");
    expect(details.providerMessage).toContain("[redacted]");
  });
});
