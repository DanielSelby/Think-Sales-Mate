"use server";

import { revalidatePath } from "next/cache";
import { getPlatformAdmin, platformRoleCan, requirePlatformAdminPage } from "@/lib/platform-auth";
import { platformRoleCanAccessPage, type PlatformAdminPage } from "@/lib/platform-admin-pages";
import { createPlatformServerClient } from "@/lib/supabase/platform-server";
import { createPlatformAdminClient } from "@/lib/supabase/platform-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncPendingProductEntitlements } from "@/lib/supabase/product-entitlements";
import { parsePlatformWatermark, type WatermarkPosition } from "@/lib/platform-watermark";
import { validateAndSanitizeWatermarkImage } from "@/lib/platform-watermark-upload";
import { isValidOrganizationExpiryDate } from "@/lib/organization-access-expiry";
import type {
  PlatformModule,
  PlatformProductSlug,
  PlatformProductSubscriptionStatus,
} from "@/types/platform-database";
import { isPlatformProductSlug } from "@/types/platform-database";

async function requirePlatformManagement(page: PlatformAdminPage = "Organizations") {
  const admin = await requirePlatformAdminPage(page);
  if (!admin || !platformRoleCan(admin.role, "manage_platform")) {
    throw new Error("You do not have permission to manage platform data.");
  }

  return { admin, supabase: await createPlatformServerClient() };
}

export async function updateOrganizationBusinessDetails(input: {
  platformOrganizationId: string;
  name: string;
  businessType: string;
  country: string;
  ownerEmail: string;
}) {
  const { admin, supabase } = await requirePlatformManagement();
  const name = input.name.trim();
  const businessType = input.businessType.trim();
  const country = input.country.trim();
  const ownerEmail = input.ownerEmail.trim();
  if (!input.platformOrganizationId || !name) throw new Error("Organization name is required.");
  if (name.length > 160 || businessType.length > 120 || country.length > 120 || ownerEmail.length > 254) {
    throw new Error("Organization name, business type, country, or owner email exceeds the allowed length.");
  }
  if (ownerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
    throw new Error("Enter a valid owner contact email address.");
  }

  const { data: organization, error: loadError } = await supabase
    .from("platform_organizations")
    .select("organization_id, name, owner_email")
    .eq("id", input.platformOrganizationId)
    .single();
  if (loadError) throw new Error(`Could not load organization: ${loadError.message}`);

  const app = createAdminClient();
  const { error: organizationError } = await app
    .from("organizations")
    .update({ name })
    .eq("id", organization.organization_id);
  if (organizationError) throw new Error(`Could not update the organization name: ${organizationError.message}`);

  const { error: profileError } = await app
    .from("company_profile")
    .upsert({
      org_id: organization.organization_id,
      company_name: name,
      business_type: businessType || null,
      country: country || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "org_id" });
  if (profileError) throw new Error(`Organization name was updated, but business details could not be saved: ${profileError.message}`);

  const { error: platformError } = await supabase
    .from("platform_organizations")
    .update({ name, owner_email: ownerEmail || null, updated_at: new Date().toISOString() })
    .eq("id", input.platformOrganizationId);
  if (platformError) throw new Error(`Business details were saved, but the Platform Admin organization name could not be synchronized: ${platformError.message}`);

  const { error: auditError } = await supabase.from("platform_audit_logs").insert({
    admin_id: admin.id,
    organization_id: organization.organization_id,
    action: "organization_business_details_updated",
    module: "organizations",
    metadata: {
      previous_name: organization.name,
      name,
      previous_owner_email: organization.owner_email,
      owner_email: ownerEmail || null,
      business_type: businessType || null,
      country: country || null,
    },
  });
  if (auditError) throw new Error(`Business details were saved, but the audit record failed: ${auditError.message}`);

  revalidatePath("/platform-admin");
  return { success: true };
}

export async function syncMissingApplicationOrganizationsToPlatform() {
  const { admin, supabase } = await requirePlatformManagement();
  const app = createAdminClient();
  const { data: applicationOrganizations, error: applicationError } = await app
    .from("organizations")
    .select("id, name, created_by, registration_status");
  if (applicationError) {
    throw new Error(`Could not load application organizations: ${applicationError.message}`);
  }
  if (!applicationOrganizations?.length) return { synchronized: 0 };

  const organizationIds = applicationOrganizations.map((organization) => organization.id);
  const { data: platformOrganizations, error: platformReadError } = await supabase
    .from("platform_organizations")
    .select("organization_id")
    .in("organization_id", organizationIds);
  if (platformReadError) {
    throw new Error(`Could not check Platform Admin organization records: ${platformReadError.message}`);
  }

  const existingIds = new Set((platformOrganizations ?? []).map((organization) => organization.organization_id));
  const missingOrganizations = applicationOrganizations.filter((organization) => !existingIds.has(organization.id));
  if (!missingOrganizations.length) return { synchronized: 0 };

  const records = missingOrganizations.map((organization) => ({
    organization_id: organization.id,
    name: organization.name,
    owner_user_id: organization.created_by,
    status: organization.registration_status === "approved"
      ? "trial" as const
      : organization.registration_status,
    registration_state: organization.registration_status === "pending"
      ? "pending" as const
      : organization.registration_status === "rejected" ? "rejected" as const : "approved" as const,
  }));
  const { data: synchronizedOrganizations, error: syncError } = await supabase
    .from("platform_organizations")
    .upsert(records, { onConflict: "organization_id", ignoreDuplicates: true })
    .select("organization_id");
  if (syncError) {
    throw new Error(`Could not add missing organizations to Platform Admin: ${syncError.message}`);
  }

  const synchronizedIds = (synchronizedOrganizations ?? []).map((organization) => organization.organization_id);
  if (synchronizedIds.length) {
    const { error: auditError } = await supabase.from("platform_audit_logs").insert(
      synchronizedIds.map((organizationId) => ({
        admin_id: admin.id,
        organization_id: organizationId,
        action: "organization_synchronized",
        module: "organizations",
        metadata: { source: "application_organization_reconciliation" },
      }))
    );
    if (auditError) {
      throw new Error(`Organizations were synchronized, but audit records could not be saved: ${auditError.message}`);
    }
  }

  revalidatePath("/platform-admin");
  return { synchronized: synchronizedIds.length, organizationIds: synchronizedIds };
}

async function requirePlatformPermission(
  permission: "manage_platform" | "manage_billing" | "manage_support" | "manage_security",
  page: PlatformAdminPage = permission === "manage_billing" ? "Billing & Subscriptions"
    : permission === "manage_support" ? "Complaints & Support"
      : permission === "manage_security" ? "Security Center" : "Organizations"
) {
  const admin = await requirePlatformAdminPage(page);
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
  accessExpiresAt?: string | null;
  planId?: string;
}) {
  const { admin, supabase } = await requirePlatformManagement();
  if (input.accessExpiresAt && !isValidOrganizationExpiryDate(input.accessExpiresAt)) {
    throw new Error("Enter a valid organization access expiry date.");
  }
  const { data, error } = await supabase
    .from("platform_organizations")
    .insert({
      organization_id: input.organizationId,
      name: input.name.trim(),
      status: input.status,
      expires_at: input.expiresAt || null,
      organization_access_expires_at: input.accessExpiresAt || null,
      plan_id: input.planId || null,
    })
    .select("id, organization_id, name, plan_id, status, expires_at, organization_access_expires_at, created_at, updated_at")
    .single();
  if (error) throw new Error(error.message);
  const { error: auditError } = await supabase.from("platform_audit_logs").insert({
    admin_id: admin.id,
    organization_id: data.organization_id,
    action: "organization_created",
    module: "organizations",
    metadata: { name: data.name, organization_access_expires_at: data.organization_access_expires_at },
  });
  if (auditError) {
    const { error: rollbackError } = await supabase.from("platform_organizations").delete().eq("id", data.id);
    if (rollbackError) {
      throw new Error(`Organization was created, but its audit record failed (${auditError.message}) and the organization could not be rolled back (${rollbackError.message}).`);
    }
    throw new Error(`Organization creation was rolled back because its audit record could not be written: ${auditError.message}`);
  }
  revalidatePath("/platform-admin");
  return data;
}

export async function setOrganizationAccessExpiry(organizationId: string, accessExpiresAt: string | null) {
  const { admin, supabase } = await requirePlatformManagement();
  if (!organizationId || (accessExpiresAt !== null && !isValidOrganizationExpiryDate(accessExpiresAt))) {
    throw new Error("Enter a valid organization access expiry date.");
  }
  const { data: organization, error: loadError } = await supabase
    .from("platform_organizations")
    .select("organization_id, organization_access_expires_at")
    .eq("id", organizationId)
    .single();
  if (loadError) throw new Error(`Could not load organization access expiry: ${loadError.message}`);

  const { error: updateError } = await supabase
    .from("platform_organizations")
    .update({
      organization_access_expires_at: accessExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", organizationId);
  if (updateError) throw new Error(`Could not update organization access expiry: ${updateError.message}`);

  const { error: auditError } = await supabase.from("platform_audit_logs").insert({
    admin_id: admin.id,
    organization_id: organization.organization_id,
    action: accessExpiresAt ? "organization_access_expiry_updated" : "organization_access_expiry_removed",
    module: "organizations",
    metadata: {
      previous_expiry_date: organization.organization_access_expires_at,
      expiry_date: accessExpiresAt,
    },
  });
  if (auditError) {
    const { error: rollbackError } = await supabase
      .from("platform_organizations")
      .update({
        organization_access_expires_at: organization.organization_access_expires_at,
        updated_at: new Date().toISOString(),
      })
      .eq("id", organizationId);
    if (rollbackError) {
      throw new Error(`Expiry date was saved, but audit logging failed (${auditError.message}) and the rollback also failed (${rollbackError.message}).`);
    }
    throw new Error(`Expiry date was rolled back because its audit record could not be written: ${auditError.message}`);
  }

  revalidatePath("/platform-admin");
  revalidatePath("/", "layout");
  return { organizationId, accessExpiresAt };
}

export async function updatePlatformOrganization(
  id: string,
  update: {
    status?: "active" | "trial" | "pending" | "rejected" | "suspended" | "expired";
    planId?: string | null;
    expiresAt?: string | null;
    maxUsersOverride?: number | null;
    maxBranchesOverride?: number | null;
  },
) {
  const { admin, supabase } = await requirePlatformManagement();
  for (const [label, value] of [
    ["User", update.maxUsersOverride],
    ["Branch", update.maxBranchesOverride],
  ] as const) {
    if (value !== undefined && value !== null && (!Number.isSafeInteger(value) || value < 1)) {
      throw new Error(`${label} limit must be a positive whole number or left blank to use the subscription plan.`);
    }
  }
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
    max_users_override?: number | null;
    max_branches_override?: number | null;
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
  if (update.maxUsersOverride !== undefined) values.max_users_override = update.maxUsersOverride;
  if (update.maxBranchesOverride !== undefined) values.max_branches_override = update.maxBranchesOverride;
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

export async function markPlatformNotificationRead(id: string) {
  await requirePlatformAdminPage("Overview");
  if (!id) throw new Error("Notification ID is required.");
  const supabase = await createPlatformServerClient();
  const { error } = await supabase
    .from("platform_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .is("read_at", null);
  if (error) throw new Error(`Could not mark notification as read: ${error.message}`);
  revalidatePath("/platform-admin");
}

export async function markAllPlatformNotificationsRead() {
  await requirePlatformAdminPage("Overview");
  const supabase = await createPlatformServerClient();
  const { error } = await supabase
    .from("platform_notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  if (error) throw new Error(`Could not mark notifications as read: ${error.message}`);
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
  const { admin, supabase } = await requirePlatformManagement("Subscription Plans");
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
  let productFeatures: Array<{ product_slug: PlatformProductSlug }> = [];
  if (planValues.included_modules.length) {
    const { data: featureRows, error: productFeaturesError } = await supabase
      .from("platform_product_features")
      .select("product_slug, module")
      .eq("is_product_entitling_feature", true)
      .in("module", planValues.included_modules);
    if (productFeaturesError) {
      const { error: rollbackError } = await supabase.from("subscription_plans").delete().eq("id", data.id);
      throw new Error(rollbackError
        ? `Plan was created but product assignments could not be loaded: ${productFeaturesError.message}; plan cleanup failed: ${rollbackError.message}`
        : `Plan was not saved because product assignments could not be loaded: ${productFeaturesError.message}`);
    }
    productFeatures = featureRows ?? [];
  }
  const productSlugs = [...new Set(productFeatures.map((feature) => feature.product_slug))];
  if (productSlugs.length) {
    const { error: productAssignmentError } = await supabase.from("platform_plan_products").insert(
      productSlugs.map((productSlug) => ({ plan_id: data.id, product_slug: productSlug })),
    );
    if (productAssignmentError) {
      const { error: rollbackError } = await supabase.from("subscription_plans").delete().eq("id", data.id);
      throw new Error(rollbackError
        ? `Plan product assignments failed: ${productAssignmentError.message}; plan cleanup failed: ${rollbackError.message}`
        : `Plan was not saved because product assignments failed: ${productAssignmentError.message}`);
    }
  }
  const { error: auditError } = await supabase.from("platform_audit_logs").insert({
    admin_id: admin.id,
    action: "subscription_plan_created",
    module: "subscription_plans",
    metadata: { name: data.name, productSlugs },
  });
  if (auditError) throw new Error(`Plan was created, but its audit record failed: ${auditError.message}`);
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
  const { admin, supabase } = await requirePlatformManagement("Subscription Plans");
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
  const { admin, supabase } = await requirePlatformManagement("Subscription Plans");
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
  const { admin, supabase } = await requirePlatformManagement("Feature Access");
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
  const { admin, supabase } = await requirePlatformManagement("Feature Flags");
  const { error } = await supabase.from("platform_feature_flags").update({ enabled, updated_by: admin.id, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
  await supabase.from("platform_audit_logs").insert({ admin_id: admin.id, action: enabled ? "feature_flag_enabled" : "feature_flag_disabled", module: "feature_flags", metadata: { flagId: id, enabled } });
  revalidatePath("/platform-admin");
}

export async function updatePlatformSetting(key: string, value: Record<string, unknown>) {
  const settingAccess = {
    platform_branding: { permission: "manage_platform", pages: ["System Settings"], module: "system_settings" },
    notification_settings: { permission: "manage_platform", pages: ["System Settings"], module: "system_settings" },
    storage_settings: { permission: "manage_platform", pages: ["System Settings"], module: "system_settings" },
    email_provider: { permission: "manage_platform", pages: ["API & Integrations", "System Settings"], module: "integrations" },
    sms_provider: { permission: "manage_platform", pages: ["API & Integrations", "System Settings"], module: "integrations" },
    whatsapp_provider: { permission: "manage_platform", pages: ["API & Integrations", "System Settings"], module: "integrations" },
    api_settings: { permission: "manage_security", pages: ["API & Integrations"], module: "integrations" },
    security_settings: { permission: "manage_security", pages: ["Security Center"], module: "security" },
  } as const;
  const access = settingAccess[key as keyof typeof settingAccess];
  if (!access) throw new Error("This platform setting cannot be updated here.");
  const admin = await getPlatformAdmin();
  if (!admin || !platformRoleCan(admin.role, access.permission) || !access.pages.some((page) =>
    platformRoleCanAccessPage(admin.role, admin.page_permissions, page as PlatformAdminPage)
  )) {
    throw new Error("You do not have permission to update this platform setting.");
  }
  const supabase = await createPlatformServerClient();
  const { error } = await supabase.from("platform_settings").upsert({ key, value, updated_by: admin.id, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  await supabase.from("platform_audit_logs").insert({ admin_id: admin.id, action: "platform_setting_updated", module: access.module, metadata: { key } });
  revalidatePath("/platform-admin");
}

export async function savePlatformWatermark(formData: FormData) {
  const { admin } = await requirePlatformManagement("System Settings");
  const platform = createPlatformAdminClient();
  const enabledValue = formData.get("enabled");
  const positionValue = formData.get("position");
  const displayStyleValue = formData.get("displayStyle");
  const opacity = Number(formData.get("opacity"));
  const desktopSize = Number(formData.get("desktopSize"));
  const mobileSize = Number(formData.get("mobileSize"));
  const removeImage = formData.get("removeImage") === "true";
  const positions: WatermarkPosition[] = [
    "center",
    "top-left",
    "top-center",
    "top-right",
    "bottom-left",
    "bottom-center",
    "bottom-right",
  ];
  if ((enabledValue !== "true" && enabledValue !== "false") ||
      typeof positionValue !== "string" || !positions.includes(positionValue as WatermarkPosition) ||
      (displayStyleValue !== "normal" && displayStyleValue !== "3d") ||
      !Number.isFinite(opacity) || opacity < 0.01 || opacity > 0.5 ||
      !Number.isInteger(desktopSize) || desktopSize < 100 || desktopSize > 800 ||
      !Number.isInteger(mobileSize) || mobileSize < 60 || mobileSize > 400) {
    throw new Error("Watermark settings contain invalid values.");
  }
  if (removeImage && formData.has("watermark")) {
    throw new Error("Choose either a replacement image or image removal, not both.");
  }
  const uploadedFile = formData.get("watermark");
  if (formData.has("watermark") && (!(uploadedFile instanceof File) || uploadedFile.size === 0)) {
    throw new Error("Choose a non-empty image file to upload.");
  }
  if (uploadedFile instanceof File && uploadedFile.size > 2 * 1024 * 1024) {
    throw new Error("Watermark images must not exceed 2 MB.");
  }

  const { data: current, error: currentError } = await platform
    .from("platform_settings")
    .select("value, updated_at, updated_by")
    .eq("key", "platform_watermark")
    .maybeSingle();
  if (currentError) throw new Error(`Could not load the current watermark settings: ${currentError.message}`);
  const currentValue = current?.value && typeof current.value === "object"
    ? current.value as Record<string, unknown>
    : {};
  const currentConfig = parsePlatformWatermark(currentValue);
  let newPath: string | null = currentConfig.storagePath;
  let newUrl: string | null = currentConfig.imageUrl;
  let uploadedPath: string | null = null;

  if (removeImage) {
    newPath = null;
    newUrl = null;
  } else if (uploadedFile instanceof File) {
    const image = validateAndSanitizeWatermarkImage(
      uploadedFile.name,
      uploadedFile.type,
      Buffer.from(await uploadedFile.arrayBuffer()),
    );
    uploadedPath = `watermarks/${Date.now()}-${crypto.randomUUID()}.${image.extension}`;
    const { error: uploadError } = await platform.storage.from("platform-assets").upload(uploadedPath, image.bytes, {
      contentType: image.contentType,
      cacheControl: "31536000",
      upsert: false,
    });
    if (uploadError) throw new Error(`Could not upload the watermark image: ${uploadError.message}`);
    newPath = uploadedPath;
    newUrl = platform.storage.from("platform-assets").getPublicUrl(uploadedPath).data.publicUrl;
  }

  const enabled = enabledValue === "true";
  if (enabled && (!newPath || !newUrl)) {
    if (uploadedPath) {
      const { error: cleanupError } = await platform.storage.from("platform-assets").remove([uploadedPath]);
      if (cleanupError) throw new Error(`A watermark image is required to enable the watermark, and its temporary upload could not be removed: ${cleanupError.message}`);
    }
    throw new Error("Upload a watermark image before enabling the global watermark.");
  }

  const updatedAt = new Date().toISOString();
  const value = {
    image_url: newUrl,
    storage_path: newPath,
    enabled: removeImage ? false : enabled,
    opacity,
    position: positionValue,
    display_style: displayStyleValue,
    desktop_size: desktopSize,
    mobile_size: mobileSize,
  };
  const { error: saveError } = await platform.from("platform_settings").upsert({
    key: "platform_watermark",
    value,
    updated_by: admin.id,
    updated_at: updatedAt,
  });
  if (saveError) {
    if (uploadedPath) {
      const { error: cleanupError } = await platform.storage.from("platform-assets").remove([uploadedPath]);
      if (cleanupError) throw new Error(`Watermark settings could not be saved (${saveError.message}); the uploaded image also could not be cleaned up (${cleanupError.message}).`);
    }
    throw new Error(`Could not save watermark settings: ${saveError.message}`);
  }

  const action = removeImage
    ? "platform_watermark_removed"
    : uploadedPath
      ? currentConfig.storagePath ? "platform_watermark_replaced" : "platform_watermark_uploaded"
      : "platform_watermark_settings_updated";
  const { error: auditError } = await platform.from("platform_audit_logs").insert({
    admin_id: admin.id,
    action,
    module: "system_settings",
    metadata: {
      previous_storage_path: currentConfig.storagePath,
      storage_path: newPath,
      enabled: value.enabled,
      opacity,
      position: positionValue,
      display_style: displayStyleValue,
      desktop_size: desktopSize,
      mobile_size: mobileSize,
    },
  });
  if (auditError) {
    const rollback = current
      ? await platform.from("platform_settings").upsert({
        key: "platform_watermark",
        value: current.value,
        updated_at: current.updated_at,
        updated_by: current.updated_by,
      })
      : await platform.from("platform_settings").delete().eq("key", "platform_watermark");
    if (rollback.error) {
      throw new Error(`Watermark settings were saved, but audit logging failed (${auditError.message}) and the settings rollback also failed (${rollback.error.message}).`);
    }
    if (uploadedPath) {
      const { error: cleanupError } = await platform.storage.from("platform-assets").remove([uploadedPath]);
      if (cleanupError) {
        throw new Error(`Watermark settings were rolled back after audit logging failed, but the new image could not be removed (${cleanupError.message}).`);
      }
    }
    throw new Error(`Watermark settings were rolled back because the audit record could not be written: ${auditError.message}`);
  }

  if (currentConfig.storagePath && currentConfig.storagePath !== newPath) {
    const { error: removeError } = await platform.storage.from("platform-assets").remove([currentConfig.storagePath]);
    if (removeError) throw new Error(`Watermark settings were saved, but the previous image could not be removed: ${removeError.message}`);
  }

  revalidatePath("/platform-admin");
  revalidatePath("/", "layout");
  return parsePlatformWatermark(value, updatedAt, admin.id);
}

export async function setGlobalLoginTheme(themeId: string) {
  const { admin, supabase } = await requirePlatformManagement("Login Experience");
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
  const { admin, supabase } = await requirePlatformManagement("Login Experience");
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
  const { admin, supabase } = await requirePlatformManagement("Login Experience");
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

export async function updateLoginThemeFormSettings(themeId: string, loginFormTransparent: boolean, backgroundArtworkVisibility: number) {
  const { admin, supabase } = await requirePlatformManagement("Login Experience");
  if (typeof loginFormTransparent !== "boolean") {
    throw new Error("Choose whether the login form background is transparent.");
  }
  if (typeof backgroundArtworkVisibility !== "number" || !Number.isInteger(backgroundArtworkVisibility)
    || backgroundArtworkVisibility < 0 || backgroundArtworkVisibility > 100) {
    throw new Error("Background artwork visibility must be a whole number between 0 and 100.");
  }
  const { data: theme, error: themeError } = await supabase
    .from("login_themes")
    .select("name, login_form_transparent, background_artwork_visibility, theme_type")
    .eq("id", themeId)
    .single();
  if (themeError) throw new Error(themeError.message);
  if (theme.theme_type !== "modern-green") throw new Error("Form appearance settings are only available for the Modern Green Login theme.");

  const { error } = await supabase
    .from("login_themes")
    .update({
      login_form_transparent: loginFormTransparent,
      background_artwork_visibility: backgroundArtworkVisibility,
      updated_at: new Date().toISOString(),
    })
    .eq("id", themeId);
  if (error) throw new Error(error.message);
  const { error: auditError } = await supabase.from("platform_audit_logs").insert({
    admin_id: admin.id,
    action: "login_theme_form_settings_updated",
    module: "login_experience",
    metadata: {
      themeId,
      themeName: theme.name,
      previousTransparent: theme.login_form_transparent,
      previousBackgroundArtworkVisibility: theme.background_artwork_visibility,
      loginFormTransparent,
      backgroundArtworkVisibility,
    },
  });
  if (auditError) throw new Error(`Form appearance was saved, but its audit record failed: ${auditError.message}`);
  revalidatePath("/platform-admin");
  revalidatePath("/login");
}

export async function duplicateLoginTheme(themeId: string, name: string) {
  const { admin, supabase } = await requirePlatformManagement("Login Experience");
  const cleanName = name.trim();
  if (!cleanName) throw new Error("Enter a name for the duplicate theme.");
  const { data: source, error: sourceError } = await supabase
    .from("login_themes")
    .select("description, preview_image, background_artwork, background_artwork_visibility, login_form_transparent, theme_type")
    .eq("id", themeId)
    .single();
  if (sourceError) throw new Error(sourceError.message);
  const id = crypto.randomUUID();
  const { error } = await supabase.from("login_themes").insert({
    id,
    name: cleanName,
    description: source.description,
    preview_image: source.preview_image,
    background_artwork: source.background_artwork,
    background_artwork_visibility: source.background_artwork_visibility,
    login_form_transparent: source.login_form_transparent,
    theme_type: source.theme_type,
    is_active: true,
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
  const { admin, supabase } = await requirePlatformManagement("Login Experience");
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
    const { admin, supabase } = await requirePlatformPermission("manage_platform", "System Settings");
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
  const { admin, supabase } = await requirePlatformManagement("Organizations");
  const { error } = await supabase.from("platform_approvals").update({ status, reviewed_by: admin.id, reviewed_at: new Date().toISOString() }).eq("id", id).eq("status", "pending");
  if (error) throw new Error(error.message);
  await supabase.from("platform_audit_logs").insert({ admin_id: admin.id, action: `approval_${status}`, module: "approvals", metadata: { approvalId: id } });
  revalidatePath("/platform-admin");
}

export async function setOrganizationFeature(organizationId: string, module: PlatformModule, enabled: boolean) {
  const { admin, supabase } = await requirePlatformManagement("Feature Access");
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

export type PlatformProductCatalogActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

export async function updatePlatformProductCatalog(formData: FormData): Promise<PlatformProductCatalogActionResult> {
  const { admin, supabase } = await requirePlatformManagement("Feature Access");
  const slugValue = formData.get("slug");
  const nameValue = formData.get("name");
  const descriptionValue = formData.get("description");
  const publishedFormValue = formData.get("isPublished");
  const slug = typeof slugValue === "string" ? slugValue : "";
  const name = typeof nameValue === "string" ? nameValue.trim() : "";
  const description = typeof descriptionValue === "string" ? descriptionValue.trim() : "";
  const publishedValue = typeof publishedFormValue === "string" ? publishedFormValue : "";
  if (!isPlatformProductSlug(slug)) {
    return { ok: false, error: "Choose a supported product." };
  }
  if (!name || name.length > 120 || description.length > 1000) {
    return { ok: false, error: "Product name is required and descriptions must be no more than 1,000 characters." };
  }
  if (publishedValue !== "true" && publishedValue !== "false") {
    return { ok: false, error: "Choose whether the product is published." };
  }

  const { data: previousProduct, error: loadError } = await supabase
    .from("platform_products")
    .select("name, description, is_published")
    .eq("slug", slug)
    .single();
  if (loadError) return { ok: false, error: `Could not load product catalog entry: ${loadError.message}` };

  const isPublished = publishedValue === "true";
  const { data, error } = await supabase
    .from("platform_products")
    .update({
      name,
      description,
      is_published: isPublished,
      updated_at: new Date().toISOString(),
    })
    .eq("slug", slug)
    .select("slug")
    .maybeSingle();
  if (error) return { ok: false, error: `Could not update product catalog entry: ${error.message}` };
  if (!data) return { ok: false, error: "The product no longer exists in the catalog. Refresh and try again." };

  revalidatePath("/platform-admin/products");
  revalidatePath("/onboarding");
  revalidatePath("/settings/products");

  const { error: auditError } = await supabase.from("platform_audit_logs").insert({
    admin_id: admin.id,
    action: "platform_product_catalog_updated",
    module: "product_catalog",
    metadata: {
      product_slug: slug,
      previous: previousProduct,
      updated: { name, description, is_published: isPublished },
    },
  });
  if (auditError) {
    return { ok: false, error: `Product settings were saved, but their audit record failed: ${auditError.message}` };
  }

  return { ok: true, message: `${name} was saved. Publishing changes registration availability only; it does not activate subscriptions.` };
}

export type ProductHubAppearanceActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function uploadProductHubArtwork(formData: FormData): Promise<ProductHubAppearanceActionResult> {
  const { admin, supabase } = await requirePlatformManagement("Feature Access");
  const assetTypeValue = formData.get("assetType");
  const assetType = typeof assetTypeValue === "string" ? assetTypeValue : "";
  const slugValue = formData.get("productSlug");
  const slug = typeof slugValue === "string" ? slugValue : "";
  const file = formData.get("image");
  if (assetType !== "hero" && assetType !== "about" && assetType !== "product" && assetType !== "product-background") {
    return { ok: false, error: "Choose a valid Product Hub image type." };
  }
  if ((assetType === "product" || assetType === "product-background") && !isPlatformProductSlug(slug)) {
    return { ok: false, error: "Choose a supported product for this image." };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose an image to upload." };
  }
  if (file.size > 2 * 1024 * 1024) {
    return { ok: false, error: "Images must be no larger than 2 MB." };
  }

  let image: ReturnType<typeof validateAndSanitizeWatermarkImage>;
  try {
    image = validateAndSanitizeWatermarkImage(
      file.name,
      file.type,
      Buffer.from(await file.arrayBuffer()),
    );
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Choose a valid JPEG, PNG, SVG, or WebP image under 2 MB." };
  }

  const { data: current, error: currentError } = await supabase
    .from("platform_settings")
    .select("value, updated_at, updated_by")
    .eq("key", "product_hub_branding")
    .maybeSingle();
  if (currentError) return { ok: false, error: `Could not load current Product Hub settings: ${currentError.message}` };

  const currentValue = isRecord(current?.value) ? current.value : {};
  const currentProductPaths = isRecord(currentValue.product_image_paths)
    ? currentValue.product_image_paths
    : {};
  const currentProductCardBackgroundPaths = isRecord(currentValue.product_card_background_paths)
    ? currentValue.product_card_background_paths
    : {};
  const previousPath = assetType === "hero"
    ? currentValue.hero_storage_path
    : assetType === "about"
      ? currentValue.about_storage_path
      : assetType === "product"
        ? currentProductPaths[slug]
        : currentProductCardBackgroundPaths[slug];
  const productAssetSlug = assetType === "product" || assetType === "product-background" ? slug : "page";
  const uploadedPath = `product-hub/${assetType}/${productAssetSlug}/${crypto.randomUUID()}.${image.extension}`;
  const { error: uploadError } = await supabase.storage.from("platform-assets").upload(uploadedPath, image.bytes, {
    contentType: image.contentType,
    cacheControl: "31536000",
    upsert: false,
  });
  if (uploadError) return { ok: false, error: `Could not upload Product Hub artwork: ${uploadError.message}` };

  const productImagePaths = { ...currentProductPaths };
  if (assetType === "product") productImagePaths[slug] = uploadedPath;
  const productCardBackgroundPaths = { ...currentProductCardBackgroundPaths };
  if (assetType === "product-background") productCardBackgroundPaths[slug] = uploadedPath;
  const nextValue: Record<string, unknown> = {
    ...currentValue,
    ...(assetType === "hero" ? { hero_storage_path: uploadedPath } : {}),
    ...(assetType === "about" ? { about_storage_path: uploadedPath } : {}),
    ...(assetType === "product" ? { product_image_paths: productImagePaths } : {}),
    ...(assetType === "product-background" ? { product_card_background_paths: productCardBackgroundPaths } : {}),
  };
  const updatedAt = new Date().toISOString();
  const { error: saveError } = await supabase.from("platform_settings").upsert({
    key: "product_hub_branding",
    value: nextValue,
    updated_by: admin.id,
    updated_at: updatedAt,
  });
  const platform = createPlatformAdminClient();
  if (saveError) {
    const { error: cleanupError } = await platform.storage.from("platform-assets").remove([uploadedPath]);
    return {
      ok: false,
      error: cleanupError
        ? `Could not save Product Hub settings (${saveError.message}); the uploaded image could not be removed (${cleanupError.message}).`
        : `Could not save Product Hub settings: ${saveError.message}`,
    };
  }

  const { error: auditError } = await supabase.from("platform_audit_logs").insert({
    admin_id: admin.id,
    action: "product_hub_artwork_updated",
    module: "product_catalog",
    metadata: {
      asset_type: assetType,
      product_slug: assetType === "product" || assetType === "product-background" ? slug : null,
      storage_path: uploadedPath,
    },
  });
  if (auditError) {
    const rollback = current
      ? await supabase.from("platform_settings").upsert({
        key: "product_hub_branding",
        value: current.value,
        updated_at: current.updated_at,
        updated_by: current.updated_by,
      })
      : await supabase.from("platform_settings").delete().eq("key", "product_hub_branding");
    const { error: cleanupError } = await platform.storage.from("platform-assets").remove([uploadedPath]);
    if (rollback.error || cleanupError) {
      return {
        ok: false,
        error: `Audit logging failed (${auditError.message})${rollback.error ? `; settings rollback failed (${rollback.error.message})` : ""}${cleanupError ? `; uploaded image cleanup failed (${cleanupError.message})` : ""}.`,
      };
    }
    return { ok: false, error: `Product Hub artwork was not saved because audit logging failed: ${auditError.message}` };
  }

  revalidatePath("/platform-admin/products");
  revalidatePath("/product-hub");
  if (typeof previousPath === "string" && previousPath.startsWith("product-hub/")) {
    const { error: removeError } = await platform.storage.from("platform-assets").remove([previousPath]);
    if (removeError) {
      return { ok: true, message: `Artwork was saved, but the previous image could not be removed: ${removeError.message}` };
    }
  }

  return { ok: true, message: "Product Hub artwork was uploaded and saved." };
}

export async function saveProductHubCardBackground(formData: FormData): Promise<ProductHubAppearanceActionResult> {
  const { admin, supabase } = await requirePlatformManagement("Feature Access");
  const slugValue = formData.get("productSlug");
  const enabledValue = formData.get("showBackground");
  const slug = typeof slugValue === "string" ? slugValue : "";
  if (!isPlatformProductSlug(slug)) return { ok: false, error: "Choose a supported product." };
  if (enabledValue !== "true" && enabledValue !== "false") {
    return { ok: false, error: "Choose whether to show the product card background." };
  }

  const { data: current, error: currentError } = await supabase
    .from("platform_settings")
    .select("value, updated_at, updated_by")
    .eq("key", "product_hub_branding")
    .maybeSingle();
  if (currentError) return { ok: false, error: `Could not load current Product Hub settings: ${currentError.message}` };

  const currentValue = isRecord(current?.value) ? current.value : {};
  const backgroundPaths = isRecord(currentValue.product_card_background_paths)
    ? currentValue.product_card_background_paths
    : {};
  if (enabledValue === "true") {
    const backgroundPath = backgroundPaths[slug];
    if (typeof backgroundPath !== "string" || !backgroundPath.startsWith(`product-hub/product-background/${slug}/`)) {
      return { ok: false, error: "Upload a product card background image before enabling it." };
    }
  }

  const backgroundEnabledValues = isRecord(currentValue.product_card_background_enabled)
    ? currentValue.product_card_background_enabled
    : {};
  const nextValue = {
    ...currentValue,
    product_card_background_enabled: {
      ...backgroundEnabledValues,
      [slug]: enabledValue === "true",
    },
  };
  const { error: saveError } = await supabase.from("platform_settings").upsert({
    key: "product_hub_branding",
    value: nextValue,
    updated_by: admin.id,
    updated_at: new Date().toISOString(),
  });
  if (saveError) return { ok: false, error: `Could not save product card background setting: ${saveError.message}` };

  const { error: auditError } = await supabase.from("platform_audit_logs").insert({
    admin_id: admin.id,
    action: "product_hub_card_background_updated",
    module: "product_catalog",
    metadata: { product_slug: slug, show_background: enabledValue === "true" },
  });
  if (auditError) {
    const rollback = current
      ? await supabase.from("platform_settings").upsert({
        key: "product_hub_branding",
        value: current.value,
        updated_at: current.updated_at,
        updated_by: current.updated_by,
      })
      : await supabase.from("platform_settings").delete().eq("key", "product_hub_branding");
    return {
      ok: false,
      error: rollback.error
        ? `Audit logging failed (${auditError.message}); the setting rollback failed (${rollback.error.message}).`
        : `The setting was rolled back because audit logging failed: ${auditError.message}`,
    };
  }

  revalidatePath("/platform-admin/products");
  revalidatePath("/product-hub");
  return { ok: true, message: `Product card background ${enabledValue === "true" ? "enabled" : "disabled"}.` };
}

export async function saveProductHubTheme(formData: FormData): Promise<ProductHubAppearanceActionResult> {
  const { admin, supabase } = await requirePlatformManagement("Feature Access");
  const enabledValue = formData.get("darkThemeEnabled");
  const styleValue = formData.get("darkSurfaceStyle");
  if ((enabledValue !== "true" && enabledValue !== "false") ||
      (styleValue !== "opaque" && styleValue !== "transparent")) {
    return { ok: false, error: "Choose a valid Product Hub theme configuration." };
  }

  const { data: current, error: currentError } = await supabase
    .from("platform_settings")
    .select("value, updated_at, updated_by")
    .eq("key", "product_hub_branding")
    .maybeSingle();
  if (currentError) return { ok: false, error: `Could not load current Product Hub settings: ${currentError.message}` };

  const value = {
    ...(isRecord(current?.value) ? current.value : {}),
    dark_theme_enabled: enabledValue === "true",
    dark_surface_style: styleValue,
  };
  const { error } = await supabase.from("platform_settings").upsert({
    key: "product_hub_branding",
    value,
    updated_by: admin.id,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: `Could not save Product Hub theme: ${error.message}` };

  const { error: auditError } = await supabase.from("platform_audit_logs").insert({
    admin_id: admin.id,
    action: "product_hub_theme_updated",
    module: "product_catalog",
    metadata: { dark_theme_enabled: enabledValue === "true", dark_surface_style: styleValue },
  });
  if (auditError) {
    const rollback = current
      ? await supabase.from("platform_settings").upsert({
        key: "product_hub_branding",
        value: current.value,
        updated_at: current.updated_at,
        updated_by: current.updated_by,
      })
      : await supabase.from("platform_settings").delete().eq("key", "product_hub_branding");
    if (rollback.error) {
      return { ok: false, error: `Audit logging failed (${auditError.message}), and theme settings rollback failed (${rollback.error.message}).` };
    }
    return { ok: false, error: `Theme settings were rolled back because audit logging failed: ${auditError.message}` };
  }

  revalidatePath("/platform-admin/products");
  revalidatePath("/product-hub");
  return { ok: true, message: "Product Hub theme settings were saved." };
}

export async function retryProductEntitlementEvent(formData: FormData): Promise<void> {
  const { admin, supabase } = await requirePlatformManagement("Feature Access");
  const eventId = String(formData.get("eventId") ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId)) {
    throw new Error("A valid entitlement event ID is required.");
  }

  const platformAdmin = createPlatformAdminClient();
  const { data: event, error: eventError } = await platformAdmin
    .from("platform_entitlement_outbox")
    .update({ next_attempt_at: new Date().toISOString() })
    .eq("id", eventId)
    .is("processed_at", null)
    .not("last_error", "is", null)
    .select("id, organization_id, product_slug, version")
    .maybeSingle();
  if (eventError) throw new Error(`Could not schedule entitlement retry: ${eventError.message}`);
  if (!event) throw new Error("This entitlement event is no longer failed and pending.");

  const { error: auditError } = await supabase.from("platform_audit_logs").insert({
    admin_id: admin.id,
    organization_id: event.organization_id,
    action: "product_entitlement_retry_requested",
    module: "product_entitlements",
    metadata: {
      event_id: event.id,
      product_slug: event.product_slug,
      version: event.version,
    },
  });
  if (auditError) throw new Error(`Entitlement retry was scheduled, but its audit record failed: ${auditError.message}`);

  await syncPendingProductEntitlements(1, event.id);
  revalidatePath("/platform-admin/products");
}

export async function setOrganizationProductSubscription(input: {
  organizationId: string;
  productSlug: PlatformProductSlug;
  planId?: string | null;
  status: PlatformProductSubscriptionStatus;
  currentPeriodEnd?: string | null;
  trialEndsAt?: string | null;
  graceEndsAt?: string | null;
  cancelAtPeriodEnd?: boolean;
}) {
  const { admin, supabase } = await requirePlatformPermission("manage_billing", "Billing & Subscriptions");
  if (!input.organizationId || !isPlatformProductSlug(input.productSlug)) {
    throw new Error("Choose an organization and a valid product.");
  }
  if (!["pending", "trial", "active", "grace", "suspended", "expired", "cancelled"].includes(input.status)) {
    throw new Error("Choose a valid product subscription status.");
  }
  if (input.status === "trial" && !input.trialEndsAt) {
    throw new Error("A trial end date is required for a trial subscription.");
  }
  if (input.cancelAtPeriodEnd !== undefined && typeof input.cancelAtPeriodEnd !== "boolean") {
    throw new Error("Cancellation at period end must be a boolean value.");
  }
  for (const [label, value] of [
    ["Current period end", input.currentPeriodEnd],
    ["Trial end", input.trialEndsAt],
    ["Grace end", input.graceEndsAt],
  ] as const) {
    if (value !== undefined && value !== null
      && (typeof value !== "string" || !value.trim() || !Number.isFinite(Date.parse(value)))) {
      throw new Error(`${label} must be a valid date.`);
    }
  }

  const [{ data: organization, error: organizationError }, { data: product, error: productError }] = await Promise.all([
    supabase.from("platform_organizations")
      .select("organization_id, status, registration_state")
      .eq("organization_id", input.organizationId)
      .single(),
    supabase.from("platform_products")
      .select("slug")
      .eq("slug", input.productSlug)
      .single(),
  ]);
  if (organizationError) throw new Error(`Could not load organization: ${organizationError.message}`);
  if (productError) throw new Error(`Could not load product: ${productError.message}`);
  if (!product) throw new Error("Product is not registered.");
  if (
    (input.status === "active" || input.status === "trial")
    && (organization.registration_state !== "approved"
      || organization.status === "pending"
      || organization.status === "rejected"
      || organization.status === "suspended")
  ) {
    throw new Error("Approve and activate the organization before activating a product subscription.");
  }

  if (input.planId) {
    const { data: planProduct, error: planProductError } = await supabase
      .from("platform_plan_products")
      .select("product_slug")
      .eq("plan_id", input.planId)
      .eq("product_slug", input.productSlug)
      .maybeSingle();
    if (planProductError) throw new Error(`Could not verify product plan: ${planProductError.message}`);
    if (!planProduct) throw new Error("The selected plan does not include this product.");
  }

  const now = new Date().toISOString();
  const { data: previousSubscription, error: previousSubscriptionError } = await supabase
    .from("platform_organization_subscriptions")
    .select("current_period_start")
    .eq("organization_id", input.organizationId)
    .eq("product_slug", input.productSlug)
    .maybeSingle();
  if (previousSubscriptionError) {
    throw new Error(`Could not load the current product subscription: ${previousSubscriptionError.message}`);
  }
  const { data, error } = await supabase.from("platform_organization_subscriptions").upsert({
    organization_id: input.organizationId,
    product_slug: input.productSlug,
    plan_id: input.planId ?? null,
    status: input.status,
    current_period_start: previousSubscription?.current_period_start ?? now,
    current_period_end: input.currentPeriodEnd ?? null,
    trial_ends_at: input.trialEndsAt ?? null,
    grace_ends_at: input.graceEndsAt ?? null,
    cancel_at_period_end: input.cancelAtPeriodEnd ?? false,
    cancelled_at: input.status === "cancelled" ? now : null,
    source: "manual",
    updated_at: now,
  }, { onConflict: "organization_id,product_slug" })
    .select("id, organization_id, product_slug, plan_id, status, current_period_start, current_period_end, trial_ends_at, grace_ends_at, cancel_at_period_end, cancelled_at, version")
    .single();
  if (error) throw new Error(`Could not update product subscription: ${error.message}`);

  const { error: auditError } = await supabase.from("platform_audit_logs").insert({
    admin_id: admin.id,
    organization_id: organization.organization_id,
    action: "product_subscription_updated",
    module: "billing_subscriptions",
    metadata: {
      productSlug: input.productSlug,
      status: input.status,
      planId: input.planId ?? null,
      version: data.version,
    },
  });
  if (auditError) throw new Error(`Subscription was saved, but its audit record failed: ${auditError.message}`);

  const { data: entitlementEvent, error: entitlementEventError } = await supabase
    .from("platform_entitlement_outbox")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("product_slug", input.productSlug)
    .eq("version", data.version)
    .maybeSingle();
  if (entitlementEventError) {
    throw new Error(`Subscription was saved, but its entitlement update could not be loaded: ${entitlementEventError.message}`);
  }
  if (!entitlementEvent) {
    throw new Error("Subscription was saved, but its entitlement update was not queued. Check the product-entitlement database migration.");
  }
  await syncPendingProductEntitlements(1, entitlementEvent.id);

  revalidatePath("/product-hub");
  revalidatePath("/platform-admin");
  return data;
}

export async function getOrganizationFeatures(organizationId: string) {
  const { supabase } = await requirePlatformManagement("Feature Access");
  const { data, error } = await supabase
    .from("platform_organization_features")
    .select("module, enabled")
    .eq("organization_id", organizationId);
  if (error) throw new Error(error.message);
  return data;
}

export async function updateComplaintStatus(id: string, status: "new" | "open" | "assigned" | "in_progress" | "awaiting_customer" | "resolved" | "closed") {
  const { admin, supabase } = await requirePlatformPermission("manage_support", "Complaints & Support");
  const update = { status, updated_at: new Date().toISOString(), ...(status === "resolved" ? { resolved_at: new Date().toISOString() } : {}) };
  const { data, error } = await supabase.from("platform_complaints").update(update).eq("id", id).select("organization_id").single();
  if (error) throw new Error(error.message);
  await supabase.from("platform_complaint_activity").insert({ complaint_id: id, action: `Status changed to ${status}`, actor_name: admin.display_name, metadata: { status } });
  await supabase.from("platform_audit_logs").insert({ admin_id: admin.id, organization_id: data.organization_id, action: "complaint_status_changed", module: "complaints", metadata: { complaintId: id, status } });
  revalidatePath("/platform-admin");
}

export async function updateComplaintPriority(id: string, priority: "low" | "medium" | "high" | "critical") {
  const { admin, supabase } = await requirePlatformPermission("manage_support", "Complaints & Support");
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
  const { admin, supabase } = await requirePlatformPermission("manage_support", "Complaints & Support");
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
  const { admin, supabase } = await requirePlatformPermission("manage_support", "Complaints & Support");
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
  const { admin, supabase } = await requirePlatformPermission("manage_support", "Complaints & Support");
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
  const { admin, supabase } = await requirePlatformPermission("manage_support", "Complaints & Support");
  const { error } = await supabase.from("platform_support_contacts").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await supabase.from("platform_audit_logs").insert({ admin_id: admin.id, action: "support_contact_deleted", module: "contact_directory", metadata: { contactId: id } });
  revalidatePath("/platform-admin");
}
