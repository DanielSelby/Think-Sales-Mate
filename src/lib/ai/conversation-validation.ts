import { z } from "zod";

const persistedMessageSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("user"), content: z.string().trim().min(1).max(3_000) }).strict(),
  z.object({ role: z.literal("assistant"), content: z.string().trim().min(1).max(8_000) }).strict(),
]);

export const saveConversationSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(100),
  messages: z.array(persistedMessageSchema).min(2).max(100),
}).strict().superRefine(({ messages }, issueContext) => {
  let contentLength = 0;
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    contentLength += message.content.length;
    if ((index % 2 === 0 && message.role !== "user") || (index % 2 === 1 && message.role !== "assistant")) {
      issueContext.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["messages", index],
        message: "Conversation messages must alternate between user and assistant.",
      });
    }
  }
  if (messages[messages.length - 1]?.role !== "assistant") {
    issueContext.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["messages"],
      message: "A saved conversation must end with an assistant response.",
    });
  }
  if (contentLength > 100_000) {
    issueContext.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["messages"],
      message: "Conversation history is too large to save.",
    });
  }
});
