import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sendPendingServiceStatusNotifications } from "@/lib/supabase/service-status-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: Request, secret: string) {
  const authorization = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(authorization);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function GET(request: Request) {
  const secret = process.env.SERVICE_STATUS_NOTIFICATION_SECRET;
  if (!secret) {
    console.error("Service status notification secret is not configured.");
    return NextResponse.json({ error: "Repair status notification processing is not configured." }, { status: 503 });
  }
  if (!isAuthorized(request, secret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    return NextResponse.json(await sendPendingServiceStatusNotifications());
  } catch (error) {
    console.error("Automatic repair status notification processing failed:", error);
    return NextResponse.json({ error: "Repair status notification processing failed." }, { status: 500 });
  }
}
