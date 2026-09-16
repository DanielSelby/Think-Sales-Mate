import { NextResponse } from "next/server";
import { createPlatformAdminClient } from "@/lib/supabase/platform-admin";

export async function GET() {
  const platform = createPlatformAdminClient();
  const { data, error } = await platform
    .from("platform_settings")
    .select("value")
    .eq("key", "system_logo")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Unable to load system logo." }, { status: 500 });
  const value = data?.value;
  const logoUrl = value && typeof value === "object" && "url" in value && typeof value.url === "string" ? value.url : null;
  return NextResponse.json({ logoUrl }, { headers: { "Cache-Control": "no-store" } });
}
