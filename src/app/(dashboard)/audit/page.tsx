import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { AuditCenter, type AuditRecord } from "@/components/audit/audit-center";

export const metadata = { title: "Audit Center · SalesMate ERP" };

export default async function AuditPage() {
  const context = await getCurrentOrgContext();
  if (!context) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, actor_id, action, entity_type, entity_id, metadata, created_at")
    .eq("org_id", context.orgId)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) throw new Error(`Unable to load audit records: ${error.message}`);

  const actorIds = [...new Set((data ?? []).map((record) => record.actor_id).filter(Boolean))] as string[];
  const { data: profiles } = actorIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", actorIds)
    : { data: [] };
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name || "Unknown user"]));

  const records: AuditRecord[] = (data ?? []).map((record) => ({
    ...record,
    actor_name: record.actor_id ? names.get(record.actor_id) ?? "Unknown user" : "System",
    metadata: record.metadata ?? {},
  }));

  return <AuditCenter records={records} />;
}
