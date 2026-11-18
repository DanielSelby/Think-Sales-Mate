import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/types/database";

const { verifyPaystackTransaction } = vi.hoisted(() => ({
  verifyPaystackTransaction: vi.fn(),
}));

vi.mock("@/lib/restaurant/paystack", () => ({ verifyPaystackTransaction }));

import { settleGuardianPaystackReference } from "./settlement";

describe("settleGuardianPaystackReference", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records a verified success even if an earlier failure event marked the attempt failed", async () => {
    const reference = `EDU-${"A".repeat(32)}`;
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: {
          reference,
          amount_minor: 12545,
          currency: "GHS",
          status: "failed",
          expires_at: "2026-11-18T12:00:00.000Z",
          payment_id: null,
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: "payment-id", error: null });
    const admin = { rpc } as unknown as SupabaseClient<Database>;
    verifyPaystackTransaction.mockResolvedValue({
      reference,
      status: "success",
      amount: 12545,
      currency: "GHS",
    });

    await expect(settleGuardianPaystackReference(admin, reference)).resolves.toBe("paid");
    expect(rpc).toHaveBeenNthCalledWith(2, "education_guardian_paystack_record_payment", {
      p_reference: reference,
      p_amount_minor: 12545,
      p_currency: "GHS",
    });
  });
});
