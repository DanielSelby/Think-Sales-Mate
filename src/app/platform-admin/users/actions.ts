"use server";

import { revalidatePath } from "next/cache";
import { getPlatformAdmin } from "@/lib/platform-auth";
import { createPlatformAdminClient } from "@/lib/supabase/platform-admin";
import type { PlatformRole } from "@/types/platform-database";
import { normalizePlatformAdminPages, type PlatformAdminPage } from "@/lib/platform-admin-pages";

const ASSIGNABLE_ROLES = [
  "platform_administrator",
  "support_administrator",
  "billing_administrator",
  "technical_administrator",
] as const satisfies readonly PlatformRole[];

export type AssignablePlatformRole = (typeof ASSIGNABLE_ROLES)[number];

export interface PlatformAdminActionResult {
  ok: boolean;
  error?: string;
  warning?: string;
}

async function getPlatformOwner() {
  const admin = await getPlatformAdmin();
  return admin?.role === "platform_owner" ? admin : null;
}

export async function invitePlatformAdmin(input: {
  email: string;
  displayName: string;
  role: AssignablePlatformRole;
  pagePermissions?: PlatformAdminPage[];
}): Promise<PlatformAdminActionResult> {
  const actor = await getPlatformOwner();
  if (!actor) return { ok: false, error: "Only a Platform Owner can invite platform administrators." };
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Enter valid platform administrator details." };
  }

  const email = typeof input?.email === "string" ? input.email.trim().toLowerCase() : "";
  const displayName = typeof input?.displayName === "string" ? input.displayName.trim() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (!displayName || displayName.length > 120) {
    return { ok: false, error: "Enter a name of 1 to 120 characters." };
  }
  if (!ASSIGNABLE_ROLES.includes(input.role)) {
    return { ok: false, error: "Choose a valid platform role." };
  }
  if (input.pagePermissions !== undefined && (
    !Array.isArray(input.pagePermissions) ||
    input.pagePermissions.some((page) => !normalizePlatformAdminPages([page]).includes(page))
  )) {
    return { ok: false, error: "Choose valid Platform Admin pages." };
  }
  const pagePermissions = normalizePlatformAdminPages(input.pagePermissions);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (!siteUrl) return { ok: false, error: "The application URL is not configured for platform invitations." };

  const platform = createPlatformAdminClient();
  const { data: existingAdmin, error: lookupError } = await platform
    .from("platform_admins")
    .select("id")
    .ilike("email", email)
    .maybeSingle();
  if (lookupError) return { ok: false, error: `Could not check existing platform administrators: ${lookupError.message}` };
  if (existingAdmin) return { ok: false, error: "This email already has a Platform Admin account." };

  const { data: invitation, error: invitationError } = await platform.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${siteUrl.replace(/\/+$/, "")}/platform-admin/auth/callback?next=/platform-admin/reset-password`,
    data: { full_name: displayName },
  });
  if (invitationError || !invitation.user) {
    return { ok: false, error: invitationError?.message ?? "Could not create the platform invitation." };
  }

  const { error: insertError } = await platform.from("platform_admins").insert({
    auth_user_id: invitation.user.id,
    email,
    display_name: displayName,
    role: input.role,
    is_active: true,
    page_permissions: pagePermissions,
    mfa_required: false,
  });
  if (insertError) {
    const { error: cleanupError } = await platform.auth.admin.deleteUser(invitation.user.id);
    if (cleanupError) {
      console.error("Platform invite rollback failed:", cleanupError.message);
      return {
        ok: false,
        error: `The invite was sent but the administrator record could not be created. Remove the pending Auth user manually before retrying. ${insertError.message}`,
      };
    }
    return { ok: false, error: `Could not create the administrator record; the pending invite was removed. ${insertError.message}` };
  }

  const { error: auditError } = await platform.from("platform_audit_logs").insert({
    admin_id: actor.id,
    action: "platform_admin_invited",
    module: "security",
    metadata: { invited_email: email, role: input.role, page_permissions: pagePermissions },
  });

  revalidatePath("/platform-admin/users");
  revalidatePath("/platform-admin");
  return auditError
    ? { ok: true, warning: `The invitation was created, but its audit record failed: ${auditError.message}` }
    : { ok: true };
}

export async function updatePlatformAdmin(input: {
  id: string;
  role: AssignablePlatformRole;
  isActive: boolean;
  pagePermissions: PlatformAdminPage[];
}): Promise<PlatformAdminActionResult> {
  const actor = await getPlatformOwner();
  if (!actor) return { ok: false, error: "Only a Platform Owner can manage platform administrators." };
  if (
    !input ||
    !/^[0-9a-f-]{36}$/i.test(input.id) ||
    !ASSIGNABLE_ROLES.includes(input.role) ||
    typeof input.isActive !== "boolean" ||
    !Array.isArray(input.pagePermissions) ||
    input.pagePermissions.some((page) => !normalizePlatformAdminPages([page]).includes(page))
  ) {
    return { ok: false, error: "Invalid platform administrator settings." };
  }

  const platform = createPlatformAdminClient();
  const { data: target, error: targetError } = await platform
    .from("platform_admins")
    .select("id, auth_user_id, email, role, is_active, page_permissions")
    .eq("id", input.id)
    .maybeSingle();
  if (targetError) return { ok: false, error: `Could not load platform administrator: ${targetError.message}` };
  if (!target) return { ok: false, error: "Platform administrator not found." };
  if (target.role === "platform_owner") {
    return { ok: false, error: "Platform Owner accounts cannot be changed here." };
  }
  if (target.auth_user_id === actor.userId && !input.isActive) {
    return { ok: false, error: "You cannot deactivate your own Platform Admin account." };
  }

  const { error: updateError } = await platform
    .from("platform_admins")
    .update({ role: input.role, is_active: input.isActive, page_permissions: normalizePlatformAdminPages(input.pagePermissions) })
    .eq("id", input.id);
  if (updateError) return { ok: false, error: `Could not update platform administrator: ${updateError.message}` };

  const { error: auditError } = await platform.from("platform_audit_logs").insert({
    admin_id: actor.id,
    action: "platform_admin_updated",
    module: "security",
    metadata: {
      target_admin_id: target.id,
      target_email: target.email,
      previous_role: target.role,
      role: input.role,
      was_active: target.is_active,
      is_active: input.isActive,
      previous_page_permissions: target.page_permissions,
      page_permissions: normalizePlatformAdminPages(input.pagePermissions),
    },
  });

  revalidatePath("/platform-admin/users");
  revalidatePath("/platform-admin");
  return auditError
    ? { ok: true, warning: `The administrator was updated, but its audit record failed: ${auditError.message}` }
    : { ok: true };
}
