import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/onboarding";

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
  } else {
    console.error("Auth callback — no code present in URL:", request.url);
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("Confirmation link was missing its code.")}`
    );
  }

  return NextResponse.redirect(`${origin}${next}`);
}
