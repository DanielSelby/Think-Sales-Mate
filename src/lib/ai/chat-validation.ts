import { z } from "zod";

export const MAX_CHAT_REQUEST_BYTES = 24_000;
export const MAX_CHAT_MESSAGES = 20;
export const MAX_CHAT_MESSAGE_CHARS = 3_000;
export const MAX_CHAT_ASSISTANT_MESSAGE_CHARS = 8_000;
export const MAX_CHAT_CONTEXT_CHARS = 18_000;

const chatMessageSchema = z.discriminatedUnion("role", [
  z.object({
    role: z.literal("user"),
    content: z.string().trim().min(1).max(MAX_CHAT_MESSAGE_CHARS),
  }).strict(),
  z.object({
    role: z.literal("assistant"),
    content: z.string().trim().min(1).max(MAX_CHAT_ASSISTANT_MESSAGE_CHARS),
  }).strict(),
]);

export const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(MAX_CHAT_MESSAGES),
}).strict().superRefine(({ messages }, ctx) => {
  let totalChars = 0;
  messages.forEach((message, index) => {
    totalChars += message.content.length;
    if ((index === 0 && message.role !== "user") || (index > 0 && message.role === messages[index - 1].role)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["messages", index, "role"],
        message: "Conversation turns must alternate and start with a user message.",
      });
    }
  });
  if (messages[messages.length - 1]?.role !== "user") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["messages"],
      message: "The final conversation turn must be a user message.",
    });
  }
  if (totalChars > MAX_CHAT_CONTEXT_CHARS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["messages"],
      message: "Conversation context is too long.",
    });
  }
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;

export function parseChatRequest(value: unknown) {
  return chatRequestSchema.safeParse(value);
}

export function isValidDateRange(from: string, to: string, maxDays = 90): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return false;
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T00:00:00.000Z`);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) return false;
  if (fromDate.toISOString().slice(0, 10) !== from || toDate.toISOString().slice(0, 10) !== to) return false;
  const dayCount = (toDate.getTime() - fromDate.getTime()) / 86_400_000;
  return dayCount >= 0 && dayCount < maxDays;
}
