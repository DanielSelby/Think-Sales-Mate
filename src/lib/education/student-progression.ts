import { z } from "zod";

function isValidEducationCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export const educationStudentTransferInputSchema = z.object({
  studentNumber: z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9._/-]+$/),
  sourceBranchId: z.string().uuid(),
  destinationBranchId: z.string().uuid(),
  effectiveOn: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isValidEducationCalendarDate),
  reason: z.string().trim().min(1).max(500),
}).refine((input) => input.sourceBranchId !== input.destinationBranchId, {
  message: "Source and destination campuses must differ.",
  path: ["destinationBranchId"],
});

export const educationStudentPromotionInputSchema = z.object({
  studentId: z.string().uuid(),
  sourceEnrollmentId: z.string().uuid(),
  action: z.enum(["promote", "graduate"]),
  destinationClassId: z.string().trim().optional().default(""),
}).superRefine((input, ctx) => {
  if (input.action === "promote" && !input.destinationClassId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A destination class is required for promotion.",
      path: ["destinationClassId"],
    });
    return;
  }

  if (input.action === "promote" && input.destinationClassId && !/^[0-9a-f-]{36}$/i.test(input.destinationClassId)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Destination class must be a valid UUID.",
      path: ["destinationClassId"],
    });
  }
});

export type EducationStudentTransferInput = z.infer<typeof educationStudentTransferInputSchema>;
export type EducationStudentPromotionInput = z.infer<typeof educationStudentPromotionInputSchema>;
