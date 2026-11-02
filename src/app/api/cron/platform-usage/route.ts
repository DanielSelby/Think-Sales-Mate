import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { syncPlatformUsageSnapshot } from "@/lib/supabase/platform-usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: Request, secret: string) {
  const authorization = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(authorization);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function GET(request: Request) {
  const secret = process.env.PLATFORM_USAGE_SYNC_SECRET;
  if (!secret) {
    console.error("Platform usage sync secret is not configured.");
    return NextResponse.json({ error: "Usage synchronization is not configured." }, { status: 503 });
  }
  if (!isAuthorized(request, secret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await syncPlatformUsageSnapshot();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Platform usage synchronization failed:", error);
    return NextResponse.json({ error: "Usage synchronization failed." }, { status: 500 });
  }
}
