import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(
          `Confirmation link failed: ${error.message}`
        )}`
      );
    }
  } else if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as "invite" | "recovery" | "email" | "email_change"
    });

    if (error) {
      console.error("Auth callback — verifyOtp failed:", error.message);
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(
          `Invitation link failed: ${error.message}`
        )}`
      );
    }
  } else {
    console.error("Auth callback — no code present in URL:", request.url);
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("Confirmation link was missing its code.")}`
    );
  }

  return NextResponse.redirect(`${origin}${next}`);
}
