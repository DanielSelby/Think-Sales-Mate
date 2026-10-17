import { NextResponse } from "next/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { can } from "@/lib/rbac";
import { canPermission } from "@/lib/rbac/permissions";
import { isGeminiConfigured } from "@/lib/ai/gemini";

export const dynamic = "force-dynamic";

function configResponse(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  let context;
  try {
    context = await getCurrentOrgContext();
  } catch {
    console.error("AI configuration session lookup failed.");
    return configResponse({ error: "Your session could not be verified. Please try again." }, 503);
  }
  if (!context) return configResponse({ error: "Sign in to use the AI Assistant." }, 401);
  let permitted: boolean;
  try {
    permitted = can(context.role, "ai.view") && await canPermission("ai", "view");
  } catch {
    console.error("AI configuration permission lookup failed.", { orgId: context.orgId });
    return configResponse({ error: "Your access could not be verified. Please try again." }, 503);
  }
  if (!permitted) {
    return configResponse({ error: "You do not have permission to view the AI Assistant." }, 403);
  }
  return configResponse({ configured: isGeminiConfigured() });
}
