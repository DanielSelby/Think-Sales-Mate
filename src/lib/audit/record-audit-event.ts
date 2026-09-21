import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export interface AuditEventInput {
  orgId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  module: string;
  description: string;
  branchId?: string | null;
  previousValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

function changedFields(previousValues: Record<string, unknown> | null | undefined, newValues: Record<string, unknown> | null | undefined) {
  const before = previousValues ?? {};
  const after = newValues ?? {};
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
}

export async function recordAuditEvent(supabase: SupabaseServerClient, input: AuditEventInput) {
  const previousValues = input.previousValues ?? null;
  const newValues = input.newValues ?? null;
  const metadata = {
    ...input.metadata,
    module: input.module,
    description: input.description,
    ...(input.branchId ? { branch_id: input.branchId } : {}),
    ...(previousValues ? { previous_values: previousValues } : {}),
    ...(newValues ? { new_values: newValues } : {}),
    ...(previousValues || newValues ? { changed_fields: changedFields(previousValues, newValues) } : {}),
  };

  const { error } = await supabase.from("audit_logs").insert({
    org_id: input.orgId,
    actor_id: input.actorId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    metadata,
  });

  return error ? { error: error.message } : { error: null };
}
