import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { syncPendingProductEntitlements } from "@/lib/supabase/product-entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: Request, secret: string) {
  const authorization = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(authorization);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function GET(request: Request) {
  const secret = process.env.PRODUCT_ENTITLEMENT_SYNC_SECRET;
  if (!secret) {
    console.error("Product entitlement sync secret is not configured.");
    return NextResponse.json({ error: "Entitlement synchronization is not configured." }, { status: 503 });
  }
  if (!isAuthorized(request, secret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await syncPendingProductEntitlements();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Product entitlement synchronization failed:", error);
    return NextResponse.json({ error: "Entitlement synchronization failed." }, { status: 500 });
  }
}
