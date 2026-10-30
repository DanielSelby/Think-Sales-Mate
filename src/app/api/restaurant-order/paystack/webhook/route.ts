import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPaystackTransaction } from "@/lib/restaurant/paystack";

export async function POST(request: NextRequest) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) return new NextResponse("Paystack is not configured.", { status: 503 });
  const signature = request.headers.get("x-paystack-signature");
  const rawBody = await request.text();
  if (rawBody.length > 64_000) return new NextResponse("Webhook payload is too large.", { status: 413 });
  if (!signature) return new NextResponse("Missing Paystack signature.", { status: 401 });
  if (!/^[0-9a-f]{128}$/i.test(signature)) return new NextResponse("Invalid Paystack signature.", { status: 401 });
  const expectedSignature = createHmac("sha512", secretKey).update(rawBody).digest("hex");
  const signatureBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");
  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return new NextResponse("Invalid Paystack signature.", { status: 401 });
  }

  let event: unknown;
  try {
    event = JSON.parse(rawBody) as unknown;
  } catch {
    return new NextResponse("Invalid webhook payload.", { status: 400 });
  }
  if (typeof event !== "object" || event === null || Array.isArray(event)) {
    return new NextResponse("Invalid webhook payload.", { status: 400 });
  }
  const parsedEvent = event as { event?: unknown; data?: unknown };
  if (parsedEvent.event !== "charge.success" && parsedEvent.event !== "charge.failed") {
    return NextResponse.json({ received: true });
  }
  const eventData = parsedEvent.data;
  const reference = typeof eventData === "object" && eventData !== null && !Array.isArray(eventData)
    ? (eventData as { reference?: unknown }).reference
    : null;
  if (typeof reference !== "string" || reference.length > 100) {
    return new NextResponse("Invalid Paystack transaction reference.", { status: 400 });
  }

  const admin = createAdminClient();
  const { data: attempt, error: attemptError } = await admin.from("restaurant_online_payment_attempts")
    .select("reference").eq("reference", reference).maybeSingle();
  if (attemptError) {
    console.error("Could not check Paystack Restaurant reference:", attemptError.message);
    return new NextResponse("Could not check restaurant payment.", { status: 500 });
  }
  if (!attempt) return NextResponse.json({ received: true });

  if (parsedEvent.event === "charge.failed") {
    const { error } = await admin.rpc("cancel_restaurant_online_payment_attempt", { p_reference: reference });
    if (error) {
      console.error("Could not cancel failed Paystack Restaurant attempt:", error.message);
      return new NextResponse("Could not update restaurant payment status.", { status: 500 });
    }
    return NextResponse.json({ received: true });
  }

  let transaction;
  try {
    transaction = await verifyPaystackTransaction(reference);
  } catch (error) {
    console.error("Could not verify Paystack Restaurant transaction:", error instanceof Error ? error.message : "unknown provider error");
    return new NextResponse("Could not verify restaurant payment.", { status: 502 });
  }
  if (transaction.status !== "success") {
    return new NextResponse("Paystack transaction has not been verified as successful.", { status: 503 });
  }
  const { error } = await admin.rpc("record_restaurant_online_payment", {
    p_reference: reference,
    p_amount_minor: transaction.amount,
    p_currency: transaction.currency,
  });
  if (error) {
    console.error("Could not record verified Paystack Restaurant payment:", error.message);
    return new NextResponse("Could not record restaurant payment.", { status: 500 });
  }
  return NextResponse.json({ received: true });
}
