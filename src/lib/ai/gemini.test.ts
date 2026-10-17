import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { geminiErrorCode, userFacingGeminiError } from "@/lib/ai/gemini";

describe("Gemini error handling", () => {
  it("turns common provider setup failures into actionable safe messages", () => {
    const invalidKey = Object.assign(new Error("API key not valid"), { status: 400 });
    const missingModel = Object.assign(new Error("Model not found"), { status: 404 });

    expect(geminiErrorCode(invalidKey)).toBe("provider_auth");
    expect(userFacingGeminiError(geminiErrorCode(invalidKey))).toContain("GEMINI_API_KEY");
    expect(geminiErrorCode(missingModel)).toBe("provider_model");
    expect(userFacingGeminiError(geminiErrorCode(missingModel))).toContain("gemini-2.5-flash");
    expect(userFacingGeminiError(geminiErrorCode(missingModel))).toContain("Google AI Studio");
  });

  it("does not expose provider details for temporary service failures", () => {
    const unavailable = Object.assign(new Error("Internal infrastructure details"), { status: 503 });

    expect(geminiErrorCode(unavailable)).toBe("provider_unavailable");
    expect(userFacingGeminiError(geminiErrorCode(unavailable))).not.toContain("infrastructure");
  });
});
