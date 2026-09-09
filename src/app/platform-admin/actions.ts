"use server";

import { revalidatePath } from "next/cache";
import { getPlatformAdmin, platformRoleCan } from "@/lib/platform-auth";
import { createPlatformServerClient } from "@/lib/supabase/platform-server";

async function requirePlatformManagement() {
  const admin = await getPlatformAdmin();
  if (!admin || !platformRoleCan(admin.role, "manage_platform")) {
    throw new Error("You do not have permission to manage platform data.");
  }
  return { admin, supabase: await createPlatformServerClient() };
}

export async function createPlatformOrganization(input: {
  organizationId: string;
  name: string;
  status: "active" | "trial" | "suspended" | "expired";
  expiresAt?: string;
  planId?: string;
}) {
  const { admin, supabase } = await requirePlatformManagement();
  const { data, error } = await supabase
    .from("platform_organizations")
    .insert({
      organization_id: input.organizationId,
      name: input.name.trim(),
      status: input.status,
      expires_at: input.expiresAt || null,
      plan_id: input.planId || null,
    })
    .select("id, organization_id, name, plan_id, status, expires_at, created_at, updated_at")
    .single();
  if (error) throw new Error(error.message);
  await supabase.from("platform_audit_logs").insert({
    admin_id: admin.id,
    organization_id: data.organization_id,
    action: "organization_created",
    module: "organizations",
    metadata: { name: data.name },
  });
  revalidatePath("/platform-admin");
  return data;
}

export async function updatePlatformOrganization(
  id: string,
  update: { status?: "active" | "trial" | "suspended" | "expired"; planId?: string | null; expiresAt?: string | null },
) {
  const { admin, supabase } = await requirePlatformManagement();
  const values: { status?: typeof update.status; plan_id?: string | null; expires_at?: string | null; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };
  if (update.status !== undefined) values.status = update.status;
  if (update.planId !== undefined) values.plan_id = update.planId;
  if (update.expiresAt !== undefined) values.expires_at = update.expiresAt;
  const { data, error } = await supabase.from("platform_organizations").update(values).eq("id", id).select("id, status, plan_id, expires_at").single();
  if (error) throw new Error(error.message);
  await supabase.from("platform_audit_logs").insert({
    admin_id: admin.id,
    organization_id: id,
    action: "organization_updated",
    module: "organizations",
    metadata: update,
  });
  revalidatePath("/platform-admin");
  return data;
}

export async function deletePlatformOrganization(id: string) {
  const { admin, supabase } = await requirePlatformManagement();
  const { error } = await supabase.from("platform_organizations").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await supabase.from("platform_audit_logs").insert({
    admin_id: admin.id,
    organization_id: id,
    action: "organization_deleted",
    module: "organizations",
  });
  revalidatePath("/platform-admin");
}

export async function createSubscriptionPlan(input: {
  name: string;
  maxUsers?: number;
  maxBranches?: number;
  storageLimitGb?: number;
  monthlyPrice?: number;
  aiAccess: boolean;
  apiAccess: boolean;
}) {
  const { admin, supabase } = await requirePlatformManagement();
  const { data, error } = await supabase
    .from("subscription_plans")
    .insert({
      name: input.name.trim(),
      max_users: input.maxUsers ?? null,
      max_branches: input.maxBranches ?? null,
      storage_limit_gb: input.storageLimitGb ?? null,
      monthly_price: input.monthlyPrice ?? 0,
      ai_access: input.aiAccess,
      api_access: input.apiAccess,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await supabase.from("platform_audit_logs").insert({
    admin_id: admin.id,
    action: "subscription_plan_created",
    module: "subscription_plans",
    metadata: { name: data.name },
  });
  revalidatePath("/platform-admin");
  return data;
}
