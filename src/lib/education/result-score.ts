import { z } from "zod";

const scoreValueSchema = z.string()
  .trim()
  .regex(/^\d{1,6}(?:\.\d{1,2})?$/)
  .transform(Number);

export const educationResultScoreInputSchema = z.object({
  resultId: z.string().uuid(),
  score: scoreValueSchema,
  maximumScore: scoreValueSchema,
  gradeOverride: z.string().trim().max(10),
}).superRefine(({ score, maximumScore }, context) => {
  if (maximumScore <= 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["maximumScore"],
      message: "Maximum score must be greater than zero.",
    });
  }
  if (score > maximumScore) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["score"],
      message: "Score cannot exceed the maximum score.",
    });
  }
});

export type EducationResultScoreInput = z.infer<typeof educationResultScoreInputSchema>;
