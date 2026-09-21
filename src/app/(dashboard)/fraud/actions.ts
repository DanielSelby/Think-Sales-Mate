"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canPermission } from "@/lib/rbac/permissions";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";

export async function markFraudAlerts(alertIds: string[], action: "reviewed" | "false_positive") {
  const context = await getCurrentOrgContext();
  if (!context || !await canPermission("reports", "view")) return { error: "You do not have permission to update fraud alerts." };
  const supabase = await createClient();
  const results = await Promise.all(alertIds.map((entityId) => recordAuditEvent(supabase, {
    orgId: context.orgId,
    actorId: context.userId,
    action: action === "reviewed" ? "fraud_alert.reviewed" : "fraud_alert.false_positive",
    entityType: "fraud_alert",
    entityId,
    module: "Fraud",
    description: action === "reviewed" ? "Reviewed a fraud alert" : "Marked a fraud alert as a false positive",
    newValues: { status: action },
  })));
  const failed = results.find((result) => result.error);
  if (failed?.error) return { error: failed.error };
  revalidatePath("/fraud");
  return { success: true };
}
