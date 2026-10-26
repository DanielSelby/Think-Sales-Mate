import { NextResponse } from "next/server";
import { createPlatformServerClient } from "@/lib/supabase/platform-server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedNext = url.searchParams.get("next");
  const next = requestedNext?.startsWith("/platform-admin/") && !requestedNext.startsWith("//")
    ? requestedNext
    : "/platform-admin/reset-password";
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const supabase = await createPlatformServerClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(new URL("/platform-admin/login?error=reset_link_invalid", url.origin));
  } else if (tokenHash && (type === "invite" || type === "recovery")) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return NextResponse.redirect(new URL("/platform-admin/login?error=reset_link_invalid", url.origin));
  } else {
    return NextResponse.redirect(new URL("/platform-admin/login?error=reset_link_invalid", url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
