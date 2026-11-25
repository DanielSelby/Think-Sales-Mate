import { z } from "zod";

export const educationGuardianFeePaymentSchema = z.object({
  payment_id: z.string().uuid(),
  org_id: z.string().uuid(),
  student_id: z.string().uuid(),
  student_name: z.string(),
  school_name: z.string(),
  currency_code: z.string().regex(/^[A-Z]{3}$/),
  fee_description: z.string(),
  amount: z.number().positive(),
  payment_method: z.enum(["cash", "mobile_money", "bank_transfer", "card", "cheque", "other", "paystack"]),
  reference: z.string().max(120).nullable(),
  paid_at: z.string(),
});

export const educationGuardianFeePaymentsSchema = z.array(educationGuardianFeePaymentSchema);
export type EducationGuardianFeePayment = z.infer<typeof educationGuardianFeePaymentSchema>;
