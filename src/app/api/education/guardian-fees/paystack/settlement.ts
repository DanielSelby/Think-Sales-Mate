import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { verifyPaystackTransaction } from "@/lib/restaurant/paystack";
import { isMatchingVerifiedTransaction } from "./validation";

const AttemptSchema = z.object({
  reference: z.string().regex(/^EDU-[A-F0-9]{32}$/),
  amount_minor: z.number().int().positive().refine(Number.isSafeInteger),
  currency: z.string().regex(/^[A-Z]{3}$/),
  status: z.enum(["pending", "paid", "failed", "expired"]),
  expires_at: z.string(),
  payment_id: z.string().uuid().nullable(),
});

export type GuardianPaystackSettlement = "paid" | "failed" | "pending" | "review" | "unknown";

export async function settleGuardianPaystackReference(
  admin: SupabaseClient<Database>,
  reference: string
): Promise<GuardianPaystackSettlement> {
  const { data: attemptData, error: attemptError } = await admin.rpc(
    "education_guardian_paystack_get_attempt",
    { p_reference: reference }
  );
  if (attemptError) throw attemptError;
  const parsedAttempt = AttemptSchema.safeParse(attemptData);
  if (!parsedAttempt.success) return "unknown";
  const attempt = parsedAttempt.data;

  const transaction = await verifyPaystackTransaction(reference);
  if (transaction.status === "success") {
    if (!isMatchingVerifiedTransaction({
      reference: attempt.reference,
      amountMinor: attempt.amount_minor,
      currency: attempt.currency,
    }, transaction)) {
      return "review";
    }
    const { error: recordError } = await admin.rpc("education_guardian_paystack_record_payment", {
      p_reference: reference,
      p_amount_minor: transaction.amount,
      p_currency: transaction.currency,
    });
    if (recordError) throw recordError;
    return "paid";
  }
  if (transaction.status === "failed") {
    const { error: failError } = await admin.rpc("education_guardian_paystack_mark_failed", {
      p_reference: reference,
    });
    if (failError) throw failError;
    return "failed";
  }
  if (attempt.status === "paid") return "paid";
  if (attempt.status === "failed") return "failed";
  return "pending";
}
