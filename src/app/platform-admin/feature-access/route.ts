import { NextResponse } from "next/server";
import { getPlatformAdmin, platformRoleCan } from "@/lib/platform-auth";
import { createPlatformServerClient } from "@/lib/supabase/platform-server";

const accessModes = new Set(["enabled", "disabled", "read_only"]);

export async function POST(request: Request) {
  const admin = await getPlatformAdmin();
  if (!admin || !platformRoleCan(admin.role, "manage_platform")) {
    return NextResponse.json({ error: "You do not have permission to manage feature access." }, { status: 403 });
  }

  const body = await request.json() as { organizationId?: string; module?: string; accessMode?: string; permissionOptions?: Record<string, boolean> };
  if (!body.organizationId || !body.module || !body.accessMode || !accessModes.has(body.accessMode)) {
    return NextResponse.json({ error: "Organization, module, and a valid access mode are required." }, { status: 400 });
  }

  const supabase = await createPlatformServerClient();
  const accessMode = body.accessMode as "enabled" | "disabled" | "read_only";
  const { data: previous } = await supabase.from("platform_organization_features").select("access_mode, permission_options").eq("organization_id", body.organizationId).eq("module", body.module).maybeSingle();
  const { data, error } = await supabase.from("platform_organization_features").upsert({
    organization_id: body.organizationId,
    module: body.module,
    enabled: accessMode !== "disabled",
    access_mode: accessMode,
    permission_options: body.permissionOptions ?? previous?.permission_options ?? {},
    updated_by: admin.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: "organization_id,module" }).select("organization_id, module, enabled, access_mode").single();

  if (error) {
    const schemaError = error.message.includes("access_mode") && error.message.includes("schema cache");
    return NextResponse.json({
      error: schemaError
        ? "Feature access schema is not loaded in Platform Supabase. Apply 0004_repair_feature_access_schema.sql, then retry."
        : error.message,
    }, { status: 400 });
  }
  await supabase.from("platform_audit_logs").insert({
    admin_id: admin.id,
    organization_id: body.organizationId,
    action: "feature_access_updated",
    module: "feature_access",
    metadata: { feature: body.module, previousValue: previous, newValue: { accessMode, permissionOptions: body.permissionOptions ?? previous?.permission_options ?? {} } },
  });
  return NextResponse.json({ data });
}
