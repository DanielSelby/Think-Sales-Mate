import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getEnabledOrganizationModules } from "@/lib/supabase/platform-admin";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim() ?? "";
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) {
    return NextResponse.json({ error: "The phone scanner pairing link is invalid." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const returnPath = `/mobile-scan/pair?token=${encodeURIComponent(token)}`;
  if (!user) {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(returnPath)}`, url.origin));
  }

  const admin = createAdminClient() as any;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { data: session, error } = await admin.from("pos_mobile_scanner_sessions")
    .select("org_id, created_by, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) {
    console.error("Could not verify mobile scanner pairing:", error.message);
    return NextResponse.json({ error: "Could not verify the phone scanner pairing." }, { status: 503 });
  }
  if (!session || session.created_by !== user.id || session.revoked_at || Date.parse(session.expires_at) <= Date.now()) {
    return NextResponse.json({ error: "This scanner link is expired, disconnected, or belongs to a different user." }, { status: 403 });
  }

  const [context, enabledFeatures] = await Promise.all([
    getCurrentOrgContext(session.org_id),
    getEnabledOrganizationModules(session.org_id),
  ]);
  if (!context || context.userId !== user.id || !enabledFeatures.includes("POS:Mobile Scanner")) {
    return NextResponse.json({ error: "You no longer have access to phone barcode scanning for this organization." }, { status: 403 });
  }

  const cookieStore = await cookies();
  cookieStore.set("active_org_id", session.org_id, {
    httpOnly: true,
    sameSite: "lax",
    secure: url.protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return NextResponse.redirect(new URL(`/mobile-scan?token=${encodeURIComponent(token)}`, url.origin));
}
