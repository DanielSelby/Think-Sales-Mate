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
  status: "active" | "trial" | "pending" | "rejected" | "suspended" | "expired";
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
  update: { status?: "active" | "trial" | "pending" | "rejected" | "suspended" | "expired"; planId?: string | null; expiresAt?: string | null },
) {
  const { admin, supabase } = await requirePlatformManagement();
  const { data: organization, error: organizationError } = await supabase
    .from("platform_organizations")
    .select("organization_id, status, registration_state")
    .eq("id", id)
    .single();
  if (organizationError) throw new Error(organizationError.message);
  if ((organization.status === "pending" || organization.registration_state === "rejected")
    && update.status !== undefined && update.status !== organization.status) {
    throw new Error("Use the registration review workflow to change a pending or rejected application.");
  }
  if (update.status === "pending" && organization.status !== "pending") {
    throw new Error("Pending registration status can only be set by the registration workflow.");
  }
  if (update.status === "rejected" && organization.status !== "rejected") {
    throw new Error("Use the registration review action to reject an organization and record the required reason.");
  }
  const values: {
    status?: typeof update.status;
    plan_id?: string | null;
    expires_at?: string | null;
    registration_state?: "pending" | "information_requested" | "approved" | "rejected";
    updated_at: string;
  } = {
    updated_at: new Date().toISOString(),
  };
  if (update.status !== undefined) values.status = update.status;
  if (update.status !== undefined && update.status !== organization.status) {
    values.registration_state = update.status === "pending" ? "pending" : update.status === "rejected" ? "rejected" : "approved";
  }
  if (update.planId !== undefined) values.plan_id = update.planId;
  if (update.expiresAt !== undefined) values.expires_at = update.expiresAt;
  const { data, error } = await supabase.from("platform_organizations").update(values).eq("id", id).select("id, status, plan_id, expires_at").single();
  if (error) throw new Error(error.message);
  if (update.status !== undefined) {
    const appStatus = update.status === "pending" ? "pending" : update.status === "suspended" ? "suspended" : update.status === "rejected" ? "rejected" : "approved";
    const app = (await import("@/lib/supabase/admin")).createAdminClient();
    const { error: appError } = await app.from("organizations").update({ registration_status: appStatus }).eq("id", organization.organization_id);
    if (appError) {
      const { error: rollbackError } = await supabase.from("platform_organizations").update({ status: organization.status }).eq("id", id);
      if (rollbackError) console.error(`[platform-admin] Failed to restore prior organization status: ${rollbackError.message}`);
      throw new Error(`Platform status was saved but application access could not be synchronized: ${appError.message}`);
    }
  }
  await supabase.from("platform_audit_logs").insert({
    admin_id: admin.id,
    organization_id: organization.organization_id,
    action: "organization_updated",
    module: "organizations",
    metadata: update,
  });
  revalidatePath("/platform-admin");
  revalidatePath("/platform-admin/registrations");
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
  const { data: savedFeature, error } = await supabase.from("platform_organization_features").upsert({
    organization_id: organizationId,
    module,
    enabled: accessMode !== "disabled",
    access_mode: accessMode,
    updated_by: admin.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: "organization_id,module" }).select("organization_id, module, enabled, access_mode").single();
  if (error) throw new Error(error.message);
  if (!savedFeature || savedFeature.organization_id !== organizationId || savedFeature.module !== module) {
    throw new Error("Feature access was not saved for the selected organization.");
  }
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

export async function setGlobalLoginTheme(themeId: string) {
  const { admin, supabase } = await requirePlatformManagement();
  const { data: theme, error: themeError } = await supabase
    .from("login_themes")
    .select("id, name, is_active")
    .eq("id", themeId)
    .single();
  if (themeError) throw new Error(themeError.message);
  if (!theme.is_active) throw new Error("An inactive login theme cannot be set globally.");

  const { data: current, error: currentError } = await supabase
    .from("platform_settings")
    .select("value")
    .eq("key", "global_login_theme")
    .maybeSingle();
  if (currentError) throw new Error(currentError.message);
  const previousId = typeof current?.value?.theme_id === "string" ? current.value.theme_id : "default-thinksales-login";
  const { data: previousTheme } = await supabase.from("login_themes").select("name").eq("id", previousId).maybeSingle();
  const { error } = await supabase.from("platform_settings").upsert({
    key: "global_login_theme",
    value: { theme_id: theme.id },
    updated_by: admin.id,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  const { error: auditError } = await supabase.from("platform_audit_logs").insert({
    admin_id: admin.id,
    action: "global_login_theme_changed",
    module: "login_experience",
    metadata: { previousThemeId: previousId, previousThemeName: previousTheme?.name ?? "System Default", newThemeId: theme.id, newThemeName: theme.name },
  });
  if (auditError) throw new Error(`Theme was saved, but its audit record failed: ${auditError.message}`);
  revalidatePath("/platform-admin");
}

export async function setOrganizationLoginTheme(organizationId: string, themeId: string | null) {
  const { admin, supabase } = await requirePlatformManagement();
  if (themeId) {
    const { data: theme, error: themeError } = await supabase
      .from("login_themes")
      .select("id, name, is_active")
      .eq("id", themeId)
      .single();
    if (themeError) throw new Error(themeError.message);
    if (!theme.is_active) throw new Error("An inactive login theme cannot be assigned.");
  }

  const { data: organization, error: organizationError } = await supabase
    .from("platform_organizations")
    .select("name, use_global_login_theme, login_theme_id")
    .eq("organization_id", organizationId)
    .single();
  if (organizationError) throw new Error(organizationError.message);
  const previousThemeId = organization.use_global_login_theme ? null : organization.login_theme_id;
  const { data: previousTheme } = previousThemeId
    ? await supabase.from("login_themes").select("name").eq("id", previousThemeId).maybeSingle()
    : { data: null };
  const { data: nextTheme } = themeId
    ? await supabase.from("login_themes").select("name").eq("id", themeId).single()
    : { data: null };

  const { error } = await supabase
    .from("platform_organizations")
    .update({ use_global_login_theme: themeId === null, login_theme_id: themeId, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId);
  if (error) throw new Error(error.message);
  const { error: auditError } = await supabase.from("platform_audit_logs").insert({
    admin_id: admin.id,
    organization_id: organizationId,
    action: "organization_login_theme_changed",
    module: "login_experience",
    metadata: {
      organizationName: organization.name,
      previousThemeId,
      previousThemeName: previousTheme?.name ?? "Use Global Theme",
      newThemeId: themeId,
      newThemeName: nextTheme?.name ?? "Use Global Theme",
    },
  });
  if (auditError) throw new Error(`Theme was saved, but its audit record failed: ${auditError.message}`);
  revalidatePath("/platform-admin");
}

export async function updateLoginTheme(themeId: string, name: string, description: string) {
  const { admin, supabase } = await requirePlatformManagement();
  const cleanName = name.trim();
  if (!cleanName) throw new Error("Enter a theme name.");
  const { data: previous, error: previousError } = await supabase
    .from("login_themes")
    .select("name, description")
    .eq("id", themeId)
    .single();
  if (previousError) throw new Error(previousError.message);
  const { error } = await supabase
    .from("login_themes")
    .update({ name: cleanName, description: description.trim(), updated_at: new Date().toISOString() })
    .eq("id", themeId);
  if (error) throw new Error(error.message);
  const { error: auditError } = await supabase.from("platform_audit_logs").insert({
    admin_id: admin.id,
    action: "login_theme_updated",
    module: "login_experience",
    metadata: { themeId, previousTheme: previous, newTheme: { name: cleanName, description: description.trim() } },
  });
  if (auditError) throw new Error(`Theme was saved, but its audit record failed: ${auditError.message}`);
  revalidatePath("/platform-admin");
}

export async function duplicateLoginTheme(themeId: string, name: string) {
  const { admin, supabase } = await requirePlatformManagement();
  const cleanName = name.trim();
  if (!cleanName) throw new Error("Enter a name for the duplicate theme.");
  const { data: source, error: sourceError } = await supabase
    .from("login_themes")
    .select("description, preview_image, theme_type")
    .eq("id", themeId)
    .single();
  if (sourceError) throw new Error(sourceError.message);
  const id = crypto.randomUUID();
  const { error } = await supabase.from("login_themes").insert({
    id,
    name: cleanName,
    description: source.description,
    preview_image: source.preview_image,
    theme_type: source.theme_type,
    is_active: false,
  });
  if (error) throw new Error(error.message);
  const { error: auditError } = await supabase.from("platform_audit_logs").insert({
    admin_id: admin.id,
    action: "login_theme_duplicated",
    module: "login_experience",
    metadata: { sourceThemeId: themeId, duplicateThemeId: id, name: cleanName },
  });
  if (auditError) throw new Error(`Theme was duplicated, but its audit record failed: ${auditError.message}`);
  revalidatePath("/platform-admin");
}

export async function setLoginThemeActive(themeId: string, isActive: boolean) {
  const { admin, supabase } = await requirePlatformManagement();
  if (!isActive && themeId === "default-thinksales-login") {
    throw new Error("The system default login theme cannot be deactivated.");
  }
  const { data: theme, error: themeError } = await supabase.from("login_themes").select("name").eq("id", themeId).single();
  if (themeError) throw new Error(themeError.message);
  if (!isActive) {
    const [{ data: globalSetting, error: settingError }, { count, error: assignmentError }] = await Promise.all([
      supabase.from("platform_settings").select("value").eq("key", "global_login_theme").maybeSingle(),
      supabase.from("platform_organizations").select("id", { count: "exact", head: true }).eq("use_global_login_theme", false).eq("login_theme_id", themeId),
    ]);
    if (settingError) throw new Error(settingError.message);
    if (assignmentError) throw new Error(assignmentError.message);
    if (globalSetting?.value?.theme_id === themeId || (count ?? 0) > 0) {
      throw new Error("This theme is currently in use. Assign a different theme before deactivating it.");
    }
  }
  const { error } = await supabase.from("login_themes").update({ is_active: isActive, updated_at: new Date().toISOString() }).eq("id", themeId);
  if (error) throw new Error(error.message);
  const { error: auditError } = await supabase.from("platform_audit_logs").insert({
    admin_id: admin.id,
    action: isActive ? "login_theme_activated" : "login_theme_deactivated",
    module: "login_experience",
    metadata: { themeId, themeName: theme.name },
  });
  if (auditError) throw new Error(`Theme status was updated, but its audit record failed: ${auditError.message}`);
  revalidatePath("/platform-admin");
}

export async function uploadPlatformLogo(formData: FormData): Promise<{ logoUrl?: string; error?: string }> {
  try {
    const { admin, supabase } = await requirePlatformPermission("manage_platform");
    const file = formData.get("logo");
    if (!(file instanceof File) || file.size === 0) return { error: "Choose a logo image first." };
    if (file.size > 2 * 1024 * 1024) return { error: "Logo must be under 2MB." };
    if (!["image/png", "image/jpeg", "image/svg+xml"].includes(file.type)) {
      return { error: "Logo must be a JPG, PNG, or SVG file." };
    }
    const extension = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `system/logo.${extension}`;
    const { error: uploadError } = await supabase.storage.from("platform-assets").upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) return { error: uploadError.message };
    const { data } = supabase.storage.from("platform-assets").getPublicUrl(path);
    const logoUrl = `${data.publicUrl}?v=${Date.now()}`;
    const { error: settingError } = await supabase
      .from("platform_settings")
      .upsert({ key: "system_logo", value: { url: logoUrl }, updated_by: admin.id, updated_at: new Date().toISOString() });
    if (settingError) return { error: settingError.message };
    await supabase.from("platform_audit_logs").insert({ admin_id: admin.id, action: "system_logo_updated", module: "system_settings", metadata: { path } });
    revalidatePath("/platform-admin");
    return { logoUrl };
  } catch (error) {
    console.error("Platform logo upload failed:", error);
    return { error: error instanceof Error ? error.message : "Platform logo upload failed." };
  }
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

export async function updateComplaintStatus(id: string, status: "new" | "open" | "assigned" | "in_progress" | "awaiting_customer" | "resolved" | "closed") {
  const { admin, supabase } = await requirePlatformPermission("manage_support");
  const update = { status, updated_at: new Date().toISOString(), ...(status === "resolved" ? { resolved_at: new Date().toISOString() } : {}) };
  const { data, error } = await supabase.from("platform_complaints").update(update).eq("id", id).select("organization_id").single();
  if (error) throw new Error(error.message);
  await supabase.from("platform_complaint_activity").insert({ complaint_id: id, action: `Status changed to ${status}`, actor_name: admin.display_name, metadata: { status } });
  await supabase.from("platform_audit_logs").insert({ admin_id: admin.id, organization_id: data.organization_id, action: "complaint_status_changed", module: "complaints", metadata: { complaintId: id, status } });
  revalidatePath("/platform-admin");
}

export async function updateComplaintPriority(id: string, priority: "low" | "medium" | "high" | "critical") {
  const { admin, supabase } = await requirePlatformPermission("manage_support");
  const { data, error } = await supabase.from("platform_complaints").update({ priority, updated_at: new Date().toISOString() }).eq("id", id).select("organization_id").single();
  if (error) throw new Error(error.message);
  await supabase.from("platform_complaint_activity").insert({ complaint_id: id, action: `Priority changed to ${priority}`, actor_name: admin.display_name, metadata: { priority } });
  await supabase.from("platform_audit_logs").insert({ admin_id: admin.id, organization_id: data.organization_id, action: "complaint_priority_changed", module: "complaints", metadata: { complaintId: id, priority } });
  revalidatePath("/platform-admin");
}

export async function addSupportContact(input: {
  contactType: "support_team" | "emergency" | "technical" | "sales_subscription";
  name: string;
  position?: string;
  department?: string;
  specialty?: string;
  role?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  availabilityStatus?: string;
  assignedRegion?: string;
}) {
  const { admin, supabase } = await requirePlatformPermission("manage_support");
  const { data, error } = await supabase.from("platform_support_contacts").insert({
    contact_type: input.contactType,
    name: input.name.trim(),
    position: input.position || null,
    department: input.department || null,
    specialty: input.specialty || null,
    role: input.role || null,
    phone: input.phone || null,
    whatsapp: input.whatsapp || null,
    email: input.email || null,
    availability_status: input.availabilityStatus || "available",
    assigned_region: input.assignedRegion || null,
  }).select("*").single();
  if (error) throw new Error(error.message);
  await supabase.from("platform_audit_logs").insert({ admin_id: admin.id, action: "support_contact_created", module: "contact_directory", metadata: { contactId: data.id } });
  revalidatePath("/platform-admin");
  return data;
}

export async function setSupportContactActive(id: string, isActive: boolean) {
  const { admin, supabase } = await requirePlatformPermission("manage_support");
  const { error } = await supabase.from("platform_support_contacts").update({ is_active: isActive, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
  await supabase.from("platform_audit_logs").insert({ admin_id: admin.id, action: isActive ? "support_contact_enabled" : "support_contact_disabled", module: "contact_directory", metadata: { contactId: id } });
  revalidatePath("/platform-admin");
}

export async function updateSupportContact(id: string, input: {
  contactType: "support_team" | "emergency" | "technical" | "sales_subscription";
  name: string;
  position?: string;
  department?: string;
  specialty?: string;
  role?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  availabilityStatus?: string;
  assignedRegion?: string;
}) {
  const { admin, supabase } = await requirePlatformPermission("manage_support");
  const { data, error } = await supabase.from("platform_support_contacts").update({
    contact_type: input.contactType,
    name: input.name.trim(),
    position: input.position || null,
    department: input.department || null,
    specialty: input.specialty || null,
    role: input.role || null,
    phone: input.phone || null,
    whatsapp: input.whatsapp || null,
    email: input.email || null,
    availability_status: input.availabilityStatus || "available",
    assigned_region: input.assignedRegion || null,
    updated_at: new Date().toISOString(),
  }).eq("id", id).select("id").single();
  if (error) throw new Error(error.message);
  await supabase.from("platform_audit_logs").insert({ admin_id: admin.id, action: "support_contact_updated", module: "contact_directory", metadata: { contactId: data.id } });
  revalidatePath("/platform-admin");
}

export async function deleteSupportContact(id: string) {
  const { admin, supabase } = await requirePlatformPermission("manage_support");
  const { error } = await supabase.from("platform_support_contacts").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await supabase.from("platform_audit_logs").insert({ admin_id: admin.id, action: "support_contact_deleted", module: "contact_directory", metadata: { contactId: id } });
  revalidatePath("/platform-admin");
}
