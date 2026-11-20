import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const PORTAL_PATHS = new Set([
  "/student-education-portal",
  "/education-portal",
  "/teacher-education-portal",
]);

function redirectAfterAuthFailure(origin: string, next: string, message: string) {
  if (PORTAL_PATHS.has(next)) {
    const portalUrl = new URL(next, origin);
    portalUrl.searchParams.set("signin", "expired");
    return NextResponse.redirect(portalUrl);
  }
  const loginUrl = new URL("/login", origin);
  loginUrl.searchParams.set("error", message);
  return NextResponse.redirect(loginUrl);
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = searchParams.get("next") ?? (type === "invite" ? "/reset-password" : "/onboarding");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("Auth callback — exchangeCodeForSession failed:", error.message);
      return redirectAfterAuthFailure(origin, next, `Confirmation link failed: ${error.message}`);
    }
  } else if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as "invite" | "magiclink" | "signup" | "recovery" | "email" | "email_change"
    });

    if (error) {
      console.error("Auth callback — verifyOtp failed:", error.message);
      return redirectAfterAuthFailure(origin, next, `Invitation link failed: ${error.message}`);
    }
  } else {
    const clientCallback = new URL("/auth/callback/client", origin);
    clientCallback.searchParams.set("next", next);
    return NextResponse.redirect(clientCallback);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
