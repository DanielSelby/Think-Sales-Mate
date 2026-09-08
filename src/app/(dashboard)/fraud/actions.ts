"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { can } from "@/lib/rbac";

export async function markFraudAlerts(alertIds: string[], action: "reviewed" | "false_positive") {
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "reports.view")) return { error: "You do not have permission to update fraud alerts." };
  const supabase = await createClient();
  const { error } = await supabase.from("audit_logs").insert(alertIds.map((entityId) => ({
    org_id: context.orgId,
    actor_id: context.userId,
    action: action === "reviewed" ? "fraud_alert.reviewed" : "fraud_alert.false_positive",
    entity_type: "fraud_alert",
    entity_id: entityId,
    metadata: {},
  })));
  if (error) return { error: error.message };
  revalidatePath("/fraud");
  return { success: true };
}
