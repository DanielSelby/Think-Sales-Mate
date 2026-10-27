export type VerifiedPaystackTransaction = {
  reference: string;
  status: string;
  amount: number;
  currency: string;
};

export async function verifyPaystackTransaction(reference: string): Promise<VerifiedPaystackTransaction> {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) throw new Error("Paystack is not configured on the server.");
  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
    cache: "no-store",
  });
  const result = await response.json() as {
    status?: unknown;
    message?: unknown;
    data?: { reference?: unknown; status?: unknown; amount?: unknown; currency?: unknown };
  };
  if (!response.ok || result.status !== true || !result.data) {
    throw new Error(typeof result.message === "string" ? result.message : "Could not verify the Paystack transaction.");
  }
  const { reference: verifiedReference, status, amount, currency } = result.data;
  if (verifiedReference !== reference || typeof status !== "string"
    || typeof amount !== "number" || !Number.isSafeInteger(amount)
    || typeof currency !== "string") {
    throw new Error("Paystack returned an invalid transaction verification response.");
  }
  return { reference, status, amount, currency };
}
