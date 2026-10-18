import { describe, expect, it } from "vitest";
import { saveConversationSchema } from "@/lib/ai/conversation-validation";

const validConversation = {
  id: "a4b9d46e-f44b-4cad-b573-cf89a446785f",
  title: "Sales summary",
  messages: [
    { role: "user", content: "Summarize sales." },
    { role: "assistant", content: "Sales totaled 100." },
  ],
};

describe("saved AI conversation validation", () => {
  it("accepts a valid completed conversation", () => {
    expect(saveConversationSchema.safeParse(validConversation).success).toBe(true);
  });

  it("rejects malformed ownership identifiers and incomplete turns", () => {
    expect(saveConversationSchema.safeParse({ ...validConversation, id: "not-a-uuid" }).success).toBe(false);
    expect(saveConversationSchema.safeParse({
      ...validConversation,
      messages: [{ role: "user", content: "Summarize sales." }],
    }).success).toBe(false);
  });

  it("rejects non-alternating messages and oversized history", () => {
    expect(saveConversationSchema.safeParse({
      ...validConversation,
      messages: [
        { role: "user", content: "First" },
        { role: "assistant", content: "Answer" },
        { role: "assistant", content: "Unexpected second assistant message" },
      ],
    }).success).toBe(false);
    expect(saveConversationSchema.safeParse({
      ...validConversation,
      messages: Array.from({ length: 10 }, () => [
        { role: "user" as const, content: "x".repeat(3_000) },
        { role: "assistant" as const, content: "y".repeat(8_000) },
      ]).flat(),
    }).success).toBe(false);
  });
});
