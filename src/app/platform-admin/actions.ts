"use server";

import { revalidatePath } from "next/cache";
import { getPlatformAdmin, platformRoleCan } from "@/lib/platform-auth";
import { createPlatformServerClient } from "@/lib/supabase/platform-server";
import type { PlatformModule } from "@/types/platform-database";

async function requirePlatformManagement() {
  const admin = await getPlatformAdmin();
  if (!admin || !platformRoleCan(admin.role, "manage_platform")) {
    throw new Error("You do not have permission to manage platform data.");
  }

  return { admin, supabase: await createPlatformServerClient() };
}

async function requirePlatformPermission(permission: "manage_platform" | "manage_billing" | "manage_support") {
  const admin = await getPlatformAdmin();
  if (!admin || !platformRoleCan(admin.role, permission)) {
    throw new Error("You do not have permission to perform this platform action.");
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
  annualPrice?: number;
  aiAccess: boolean;
  apiAccess: boolean;
  includedModules?: string[];
}) {
  const { admin, supabase } = await requirePlatformManagement();
  const planValues = {
    name: input.name.trim(),
    max_users: input.maxUsers ?? null,
    max_branches: input.maxBranches ?? null,
    storage_limit_gb: input.storageLimitGb ?? null,
    monthly_price: input.monthlyPrice ?? 0,
    ai_access: input.aiAccess,
    api_access: input.apiAccess,
    included_modules: input.includedModules ?? [],
    ...(input.annualPrice === undefined ? {} : { annual_price: input.annualPrice }),
  };
  const { data, error } = await supabase
    .from("subscription_plans")
    .insert(planValues)
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error(`A subscription plan named "${input.name.trim()}" already exists.`);
    throw new Error(`Could not create subscription plan: ${error.message}`);
  }
  await supabase.from("platform_audit_logs").insert({
    admin_id: admin.id,
    action: "subscription_plan_created",
    module: "subscription_plans",
    metadata: { name: data.name },
  });
  revalidatePath("/platform-admin");
  return data;
}

export async function updateSubscriptionPlan(id: string, input: {
  name?: string;
  monthlyPrice?: number;
  annualPrice?: number | null;
  maxUsers?: number | null;
  maxBranches?: number | null;
  storageLimitGb?: number | null;
  aiAccess?: boolean;
  apiAccess?: boolean;
}) {
  const { admin, supabase } = await requirePlatformManagement();
  const update = {
    ...(input.name === undefined ? {} : { name: input.name.trim() }),
    ...(input.monthlyPrice === undefined ? {} : { monthly_price: input.monthlyPrice }),
    ...(input.annualPrice === undefined ? {} : { annual_price: input.annualPrice }),
    ...(input.maxUsers === undefined ? {} : { max_users: input.maxUsers }),
    ...(input.maxBranches === undefined ? {} : { max_branches: input.maxBranches }),
    ...(input.storageLimitGb === undefined ? {} : { storage_limit_gb: input.storageLimitGb }),
    ...(input.aiAccess === undefined ? {} : { ai_access: input.aiAccess }),
    ...(input.apiAccess === undefined ? {} : { api_access: input.apiAccess }),
  };
  const { error } = await supabase.from("subscription_plans").update(update).eq("id", id);
  if (error) throw new Error(error.message);
  await supabase.from("platform_audit_logs").insert({ admin_id: admin.id, action: "subscription_plan_updated", module: "subscription_plans", metadata: { planId: id, update } });
  revalidatePath("/platform-admin");
}

export async function archiveSubscriptionPlan(id: string) {
  const { admin, supabase } = await requirePlatformManagement();
  const { error } = await supabase.from("subscription_plans").update({ is_active: false, archived_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
  await supabase.from("platform_audit_logs").insert({ admin_id: admin.id, action: "subscription_plan_archived", module: "subscription_plans", metadata: { planId: id } });
  revalidatePath("/platform-admin");
}

export async function setOrganizationFeatureAccess(
  organizationId: string,
  module: PlatformModule,
  accessMode: "enabled" | "disabled" | "read_only",
) {
  const { admin, supabase } = await requirePlatformManagement();
  const { error } = await supabase.from("platform_organization_features").upsert({
    organization_id: organizationId,
    module,
    enabled: accessMode !== "disabled",
    access_mode: accessMode,
    updated_by: admin.id,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  await supabase.from("platform_audit_logs").insert({ admin_id: admin.id, organization_id: organizationId, action: "feature_access_updated", module: "feature_access", metadata: { feature: module, accessMode } });
  revalidatePath("/platform-admin");
}

export async function setFeatureFlag(id: string, enabled: boolean) {
  const { admin, supabase } = await requirePlatformManagement();
  const { error } = await supabase.from("platform_feature_flags").update({ enabled, updated_by: admin.id, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
  await supabase.from("platform_audit_logs").insert({ admin_id: admin.id, action: enabled ? "feature_flag_enabled" : "feature_flag_disabled", module: "feature_flags", metadata: { flagId: id, enabled } });
  revalidatePath("/platform-admin");
}

export async function updatePlatformSetting(key: string, value: Record<string, unknown>) {
  const { admin, supabase } = await requirePlatformPermission("manage_platform");
  const { error } = await supabase.from("platform_settings").upsert({ key, value, updated_by: admin.id, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  await supabase.from("platform_audit_logs").insert({ admin_id: admin.id, action: "platform_setting_updated", module: "system_settings", metadata: { key } });
  revalidatePath("/platform-admin");
}

export async function reviewPlatformApproval(id: string, status: "approved" | "rejected") {
  const { admin, supabase } = await requirePlatformManagement();
  const { error } = await supabase.from("platform_approvals").update({ status, reviewed_by: admin.id, reviewed_at: new Date().toISOString() }).eq("id", id).eq("status", "pending");
  if (error) throw new Error(error.message);
  await supabase.from("platform_audit_logs").insert({ admin_id: admin.id, action: `approval_${status}`, module: "approvals", metadata: { approvalId: id } });
  revalidatePath("/platform-admin");
}

export async function setOrganizationFeature(organizationId: string, module: PlatformModule, enabled: boolean) {
  const { admin, supabase } = await requirePlatformManagement();
  const { error } = await supabase.from("platform_organization_features").upsert({
    organization_id: organizationId,
    module,
    enabled,
    updated_by: admin.id,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  const { error: auditError } = await supabase.from("platform_audit_logs").insert({
    admin_id: admin.id,
    organization_id: organizationId,
    action: enabled ? "feature_enabled" : "feature_disabled",
    module: "feature_access",
    metadata: { feature: module },
  });
  if (auditError) throw new Error(auditError.message);
  revalidatePath("/platform-admin");
}

export async function getOrganizationFeatures(organizationId: string) {
  const { supabase } = await requirePlatformManagement();
  const { data, error } = await supabase
    .from("platform_organization_features")
    .select("module, enabled")
    .eq("organization_id", organizationId);
  if (error) throw new Error(error.message);
  return data;
}
