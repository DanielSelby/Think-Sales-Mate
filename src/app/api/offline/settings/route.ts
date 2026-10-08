import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) {
    return NextResponse.json({ error: "No active organization." }, { status: 401 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("org_general_settings")
    .select("offline_enabled, offline_sync_mode, offline_data_load_mode")
    .eq("org_id", context.orgId)
    .maybeSingle();
  if (error) {
    console.error("Could not load organization offline preferences:", error.message);
    return NextResponse.json({ error: "Could not load offline settings." }, { status: 500 });
  }

  return NextResponse.json({
    enabled: data?.offline_enabled ?? true,
    syncMode: data?.offline_sync_mode ?? "automatic",
    dataLoadMode: data?.offline_data_load_mode ?? "automatic",
  }, { headers: { "Cache-Control": "no-store" } });
}
