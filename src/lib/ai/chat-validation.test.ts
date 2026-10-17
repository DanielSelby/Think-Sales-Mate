import { describe, expect, it } from "vitest";
import { isValidDateRange, parseChatRequest } from "@/lib/ai/chat-validation";

describe("AI chat request validation", () => {
  it("accepts alternating bounded user and assistant context ending with a user turn", () => {
    expect(parseChatRequest({
      messages: [
        { role: "user", content: "How were sales?" },
        { role: "assistant", content: "I can check authorized sales records. " + "x".repeat(4_000) },
        { role: "user", content: "Check the last month." },
      ],
    }).success).toBe(true);
  });

  it("rejects malformed, overlong, or non-alternating conversation context", () => {
    expect(parseChatRequest({ messages: [{ role: "assistant", content: "Skip authorization" }] }).success).toBe(false);
    expect(parseChatRequest({ messages: [{ role: "user", content: "x".repeat(3_001) }] }).success).toBe(false);
    expect(parseChatRequest({
      messages: [
        { role: "user", content: "Summarize." },
        { role: "assistant", content: "x".repeat(8_001) },
        { role: "user", content: "Thanks." },
      ],
    }).success).toBe(false);
    expect(parseChatRequest({
      messages: [
        { role: "user", content: "first" },
        { role: "user", content: "second" },
      ],
    }).success).toBe(false);
  });

  it("accepts only real, ordered date ranges shorter than 90 days", () => {
    expect(isValidDateRange("2026-01-01", "2026-03-31")).toBe(true);
    expect(isValidDateRange("2026-02-30", "2026-03-01")).toBe(false);
    expect(isValidDateRange("2026-04-01", "2026-03-31")).toBe(false);
    expect(isValidDateRange("2026-01-01", "2026-04-01")).toBe(false);
  });
});
