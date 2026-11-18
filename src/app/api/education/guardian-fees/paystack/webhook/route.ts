import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { settleGuardianPaystackReference } from "../settlement";

const REFERENCE_PATTERN = /^EDU-[A-F0-9]{32}$/;
const MAX_WEBHOOK_BYTES = 64_000;

async function readWebhookBody(request: NextRequest): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_WEBHOOK_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function POST(request: NextRequest) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) return new NextResponse("Paystack is not configured.", { status: 503 });
  const signature = request.headers.get("x-paystack-signature");
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_WEBHOOK_BYTES) return new NextResponse("Webhook payload is too large.", { status: 413 });
  let rawBody: string | null;
  try {
    rawBody = await readWebhookBody(request);
  } catch {
    return new NextResponse("Could not read webhook payload.", { status: 400 });
  }
  if (rawBody === null) return new NextResponse("Webhook payload is too large.", { status: 413 });
  if (!signature || !/^[0-9a-f]{128}$/i.test(signature)) {
    return new NextResponse("Invalid Paystack signature.", { status: 401 });
  }
  const expected = createHmac("sha512", secretKey).update(rawBody).digest();
  const supplied = Buffer.from(signature, "hex");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
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
  if (typeof reference !== "string" || !REFERENCE_PATTERN.test(reference)) {
    return new NextResponse("Invalid guardian fee payment reference.", { status: 400 });
  }

  const admin = createAdminClient();
  try {
    const result = await settleGuardianPaystackReference(admin, reference);
    if (result === "review") {
      console.error("Verified Paystack transaction does not match guardian fee reservation:", reference);
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Could not verify guardian Paystack webhook:", error instanceof Error ? error.message : "unknown verification error");
    return new NextResponse("Could not verify guardian fee payment.", { status: 502 });
  }
}
