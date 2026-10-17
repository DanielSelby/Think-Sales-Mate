import "server-only";
import type { CurrentOrgContext } from "@/lib/organizations/current";
import { createAdminClient } from "@/lib/supabase/admin";

export type UsageReservation =
  | { ok: true; id: string }
  | { ok: false; reason: "limited" | "unavailable" };

export async function reserveAiUsage(
  context: Pick<CurrentOrgContext, "orgId" | "userId">,
  model: string
): Promise<UsageReservation> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("reserve_ai_usage_request", {
      p_org_id: context.orgId,
      p_user_id: context.userId,
      p_model: model,
    });
    if (error) {
      console.error("AI usage reservation failed.", { orgId: context.orgId });
      return { ok: false, reason: "unavailable" };
    }
    if (!data) return { ok: false, reason: "limited" };
    return { ok: true, id: data };
  } catch {
    console.error("AI usage reservation failed.", { orgId: context.orgId });
    return { ok: false, reason: "unavailable" };
  }
}

export async function finishAiUsage(input: {
  id: string;
  orgId: string;
  userId: string;
  status: "succeeded" | "failed";
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  errorCode?: string;
}): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("ai_usage_events")
      .update({
        status: input.status,
        input_tokens: Math.max(0, Math.trunc(input.inputTokens)),
        output_tokens: Math.max(0, Math.trunc(input.outputTokens)),
        latency_ms: Math.max(0, Math.trunc(input.latencyMs)),
        error_code: input.errorCode ?? null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", input.id)
      .eq("org_id", input.orgId)
      .eq("user_id", input.userId)
      .eq("status", "pending");
    if (error) {
      console.error("AI usage event finalization failed.", { requestId: input.id, orgId: input.orgId });
      return false;
    }
    return true;
  } catch {
    console.error("AI usage event finalization failed.", { requestId: input.id, orgId: input.orgId });
    return false;
  }
}
