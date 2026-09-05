"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { can } from "@/lib/rbac";
import type { MemberRole } from "@/lib/rbac";

async function targetIsOwner(memberId: string, orgId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("organization_members")
    .select("role")
    .eq("id", memberId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.role === "owner";
}

async function sendOrganizationInvite(email: string, name: string, orgName: string) {
  const admin = createAdminClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (!siteUrl) return { error: "The application URL is not configured. Set NEXT_PUBLIC_SITE_URL in production." };
  const redirectTo = `${siteUrl.replace(/\/$/, "")}/auth/callback/client?next=/reset-password`;
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { full_name: name, organization_name: orgName }
  });
  if (error) return { error: `Supabase invitation email could not be sent: ${error.message}` };
  return { success: true, userId: data.user?.id };
}

export async function inviteMember(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "staff") as MemberRole;
  const locationId = String(formData.get("location_id") ?? "").trim();
  const branchScope = String(formData.get("branch_scope") ?? "assigned");
  const secondaryLocationIds = String(formData.get("secondary_location_ids") ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  const canViewOther = formData.get("can_view_other_users_transactions") !== "false";
  const canCheckCrossBranchStock = formData.get("can_check_cross_branch_stock") === "true";

  const context = await getCurrentOrgContext();
  if (!context) return { error: "Session expired." };
  if (!can(context.role, "org.manage_members")) {
    return { error: "You don't have permission to invite members." };
  }

  if (!email) return { error: "Email is required." };

  const supabase = await createClient();
  const invited = await sendOrganizationInvite(email, String(formData.get("name") ?? email.split("@")[0]), context.orgName);
  if ("error" in invited) return invited;
  const { data: member, error: memberError } = await supabase.from("organization_members").insert({
    org_id: context.orgId,
    user_id: invited.userId,
    invited_email: email,
    role,
    status: "invited",
    location_id: locationId || null,
    branch_scope: branchScope as "all" | "assigned" | "single",
    secondary_location_ids: secondaryLocationIds,
    can_view_other_users_transactions: canViewOther,
    can_check_cross_branch_stock: canCheckCrossBranchStock,
  }).select("id").single();

  if (memberError) return { error: memberError.message };

  revalidatePath("/settings/organization");
  return { success: true, memberId: member?.id };
}

/**
 * Creates a staff account immediately with a password selected by an
 * administrator. Unlike inviteMember this does not send an email and can
 * create an internal (username-only) account.
 */
export async function createStaffAccount(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) return { error: "Session expired." };
  if (!can(context.role, "org.manage_members")) {
    return { error: "You don't have permission to create staff accounts." };
  }

  const fullName = String(formData.get("full_name") ?? "").trim();
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const contactEmail = String(formData.get("email") ?? "").trim().toLowerCase();
  const employeeId = String(formData.get("employee_id") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const department = String(formData.get("department") ?? "").trim();
  const requestedRole = String(formData.get("role") ?? "staff").trim().toLowerCase();
  const locationId = String(formData.get("location_id") ?? "").trim() || null;
  const branchScope = String(formData.get("branch_scope") ?? "assigned");
  const secondaryLocationIds = String(formData.get("secondary_location_ids") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!fullName) return { error: "Full name is required." };
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) {
    return { error: "Username must be 3–32 characters and use only letters, numbers, dots, underscores, or hyphens." };
  }
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    return { error: "Enter a valid email address or leave email blank." };
  }
  if (!["all", "assigned", "single"].includes(branchScope)) return { error: "Invalid branch access scope." };

  // The UI has richer role templates than the database's tenant roles. Keep
  // the selected template in access_permissions while enforcing the tenant
  // role enum used by the rest of the application.
  const role = requestedRole === "administrator" || requestedRole === "admin"
    ? "admin"
    : requestedRole === "manager" || requestedRole === "branch_manager"
      ? "manager"
      : requestedRole === "viewer"
        ? "viewer"
        : "staff";

  const admin = createAdminClient();
  const { data: duplicateUsername, error: duplicateError } = await admin
    .from("organization_members")
    .select("id")
    .eq("username", username)
    .limit(1);
  if (duplicateError) return { error: duplicateError.message };
  if (duplicateUsername?.length) return { error: "That username is already in use." };

  const { data: validLocations, error: locationError } = await admin
    .from("business_locations")
    .select("id")
    .eq("org_id", context.orgId)
    .in("id", [locationId, ...secondaryLocationIds].filter((value): value is string => Boolean(value)));
  if (locationError) return { error: locationError.message };
  const validLocationIds = new Set((validLocations ?? []).map((location) => location.id));
  if (locationId && !validLocationIds.has(locationId)) return { error: "Select a valid primary branch." };
  if (secondaryLocationIds.some((id) => !validLocationIds.has(id))) {
    return { error: "One or more secondary branches are invalid." };
  }

  // Supabase Auth needs an email or phone for password accounts. Internal
  // emails are never shown to users and let username-only accounts use the
  // same secure password flow as normal email accounts.
  const authEmail = contactEmail || `${username}.${context.orgId.slice(0, 8)}@internal.thinksales.local`;
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: authEmail,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      username,
      employee_id: employeeId || null,
      staff_account: true,
      must_change_password: true
    }
  });
  if (authError || !authData.user) return { error: authError?.message ?? "Unable to create the authentication account." };

  const accessPermissions = {
    role_key: requestedRole,
    approvals: {
      stockTransfers: formData.get("approval_stock_transfers") === "true",
      purchases: formData.get("approval_purchases") === "true",
      expenses: formData.get("approval_expenses") === "true",
      priceUpdates: formData.get("approval_price_updates") === "true",
      stockAdjustments: formData.get("approval_stock_adjustments") === "true"
    }
  };
  const canViewOther = formData.get("can_view_other_users_transactions") !== "false";
  const canCheckCrossBranchStock = formData.get("can_check_cross_branch_stock") === "true";

  const { data: member, error: memberError } = await admin
    .from("organization_members")
    .insert({
      org_id: context.orgId,
      user_id: authData.user.id,
      invited_email: contactEmail || null,
      contact_email: contactEmail || null,
      username,
      employee_id: employeeId || null,
      phone: phone || null,
      department: department || null,
      role,
      status: "active",
      location_id: locationId,
      branch_scope: branchScope as "all" | "assigned" | "single",
      secondary_location_ids: secondaryLocationIds,
      access_permissions: accessPermissions,
      can_view_other_users_transactions: canViewOther,
      can_check_cross_branch_stock: canCheckCrossBranchStock,
      must_change_password: true
    })
    .select("id")
    .single();

  if (memberError || !member) {
    await admin.auth.admin.deleteUser(authData.user.id);
    return { error: memberError?.message ?? "Unable to save the staff profile." };
  }

  revalidatePath("/settings/organization");
  return {
    success: true,
    memberId: member.id,
    userId: authData.user.id,
    username,
    temporaryPassword: password,
    email: contactEmail
  };
}

export interface UpdateMemberAccessScopeInput {
  memberId: string;
  fullName?: string;
  role?: string;
  department?: string;
  phone?: string;
  employeeId?: string;
  locationId?: string | null;
  branchScope?: "all" | "assigned" | "single";
  secondaryLocationIds?: string[];
  canViewOtherTransactions?: boolean;
  canCheckCrossBranchStock?: boolean;
  status?: "active" | "inactive" | "suspended";
  approvalPermissions?: any;
}

export async function updateMemberAccessScope(input: UpdateMemberAccessScopeInput) {
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "org.manage_members")) {
    return { error: "You don't have permission to update member access." };
  }

  const admin = createAdminClient();

  const updatePayload: Record<string, any> = {};
  if (input.locationId !== undefined) updatePayload.location_id = input.locationId || null;
  if (input.branchScope !== undefined) updatePayload.branch_scope = input.branchScope;
  if (input.secondaryLocationIds !== undefined) updatePayload.secondary_location_ids = input.secondaryLocationIds;
  if (input.canViewOtherTransactions !== undefined) updatePayload.can_view_other_users_transactions = input.canViewOtherTransactions;
  if (input.canCheckCrossBranchStock !== undefined) updatePayload.can_check_cross_branch_stock = input.canCheckCrossBranchStock;
  if (input.department !== undefined) updatePayload.department = input.department;
  if (input.phone !== undefined) updatePayload.phone = input.phone;
  if (input.employeeId !== undefined) updatePayload.employee_id = input.employeeId;
  if (input.status !== undefined) updatePayload.status = input.status === "inactive" ? "suspended" : input.status;

  if (input.role) {
    const requestedRole = input.role.toLowerCase();
    const mappedRole = requestedRole === "owner" || requestedRole === "super_admin"
      ? "owner"
      : requestedRole === "administrator" || requestedRole === "admin"
      ? "admin"
      : requestedRole === "manager" || requestedRole === "branch_manager"
        ? "manager"
        : requestedRole === "viewer"
          ? "viewer"
          : "staff";
    updatePayload.role = mappedRole;
  }

  if (input.approvalPermissions) {
    updatePayload.access_permissions = {
      role_key: input.role || "staff",
      approvals: input.approvalPermissions
    };
  }

  const { error } = await (admin
    .from("organization_members") as any)
    .update(updatePayload)
    .eq("id", input.memberId)
    .eq("org_id", context.orgId);

  if (error) return { error: error.message };

  revalidatePath("/settings/organization");
  revalidatePath("/settings/users");
  revalidatePath("/sales");
  revalidatePath("/pos");
  revalidatePath("/inventory");
  revalidatePath("/orders");
  return { success: true };
}

export async function resetMemberPassword(memberId: string, mode: "email" | "temporary", temporaryPassword?: string) {
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "org.manage_members")) return { error: "You don't have permission to reset passwords." };
  const supabase = await createClient();
  const { data: member } = await supabase.from("organization_members")
    .select("user_id, invited_email")
    .eq("id", memberId)
    .eq("org_id", context.orgId)
    .single();
  if (!member?.user_id) return { error: "This user has not completed account activation yet." };

  const admin = createAdminClient();
  if (mode === "temporary") {
    if (!temporaryPassword || temporaryPassword.length < 8) return { error: "Temporary password must be at least 8 characters." };
    const { error } = await admin.auth.admin.updateUserById(member.user_id, {
      password: temporaryPassword,
      user_metadata: { must_change_password: true }
    });
    if (error) return { error: error.message };
    return { success: true };
  }

  if (!member.invited_email) return { error: "No email on file for this user." };
  const { error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: member.invited_email,
    options: { redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/reset-password` }
  });
  if (error) return { error: error.message };
  return { success: true };
}

export async function updateMemberRole(memberId: string, role: MemberRole) {
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "org.manage_members")) {
    return { error: "You don't have permission to change roles." };
  }
  if (await targetIsOwner(memberId, context.orgId)) {
    return { error: "The organization owner is the super admin and cannot be demoted." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("organization_members").update({ role }).eq("id", memberId);
  if (error) return { error: error.message };

  revalidatePath("/settings/organization");
  return { success: true };
}

export async function updateMemberBranch(memberId: string, locationId: string | null) {
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "org.manage_members")) {
    return { error: "You don't have permission to reassign members." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("organization_members")
    .update({ location_id: locationId })
    .eq("id", memberId)
    .eq("org_id", context.orgId);

  if (error) return { error: error.message };

  revalidatePath("/settings/organization");
  return { success: true };
}

export async function updateMemberStatus(memberId: string, status: "active" | "suspended") {
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "org.manage_members")) {
    return { error: "You don't have permission to change member status." };
  }
  if (await targetIsOwner(memberId, context.orgId)) {
    return { error: "The organization owner cannot be suspended." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("organization_members")
    .update({ status })
    .eq("id", memberId)
    .eq("org_id", context.orgId);

  if (error) return { error: error.message };

  revalidatePath("/settings/organization");
  return { success: true };
}

export async function resendInvite(memberId: string) {
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "org.manage_members")) {
    return { error: "You don't have permission to resend invites." };
  }

  const supabase = await createClient();
  const { data: member } = await supabase
    .from("organization_members")
    .select("invited_email, status")
    .eq("id", memberId)
    .eq("org_id", context.orgId)
    .single();

  if (!member?.invited_email) return { error: "No email on file for this member." };
  if (member.status !== "invited") return { error: "This member has already accepted their invite." };

  return sendOrganizationInvite(member.invited_email, member.invited_email.split("@")[0], context.orgName);
}

export async function removeMember(memberId: string) {
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "org.manage_members")) {
    return { error: "You don't have permission to remove members." };
  }
  if (await targetIsOwner(memberId, context.orgId)) {
    return { error: "The organization owner cannot be removed." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("organization_members").delete().eq("id", memberId);
  if (error) return { error: error.message };

  revalidatePath("/settings/organization");
  return { success: true };
}

export interface BulkInviteRow {
  email: string;
  role: MemberRole;
  locationId?: string | null;
}

export interface BulkInviteResult {
  invited: number;
  skipped: { row: number; reason: string }[];
}

export async function bulkInviteMembers(rows: BulkInviteRow[]): Promise<BulkInviteResult> {
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "org.manage_members")) {
    return { invited: 0, skipped: rows.map((_, i) => ({ row: i + 1, reason: "Not permitted" })) };
  }

  const supabase = await createClient();
  const admin = createAdminClient();
  const skipped: { row: number; reason: string }[] = [];
  let invited = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const email = row.email.trim().toLowerCase();
    if (!email) {
      skipped.push({ row: i + 1, reason: "Missing email" });
      continue;
    }

    const inviteResult = await sendOrganizationInvite(email, email.split("@")[0], context.orgName);
    if ("error" in inviteResult) {
      skipped.push({ row: i + 1, reason: inviteResult.error ?? "Invitation failed." });
      continue;
    }

    const { error: memberError } = await supabase.from("organization_members").insert({
      org_id: context.orgId,
      user_id: inviteResult.userId,
      invited_email: email,
      role: row.role || "staff",
      status: "invited",
      location_id: row.locationId || null
    });

    if (memberError) {
      skipped.push({ row: i + 1, reason: memberError.message });
    } else {
      invited++;
    }
  }

  revalidatePath("/settings/organization");
  return { invited, skipped };
}


export async function updateCurrency(currency: string) {
  const context = await getCurrentOrgContext();
  if (!context) return { error: "Session expired." };
  if (!can(context.role, "org.manage_members")) {
    return { error: "You don't have permission to update currency." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({ currency })
    .eq("id", context.orgId);

  if (error) return { error: error.message };

  // currency lives on organizations and is read by getCurrentOrgContext()
  // on effectively every route — revalidate the whole app's router cache,
  // not just this settings page, so already-visited pages don't keep
  // showing the old currency until a hard refresh.
  revalidatePath("/", "layout");
  return { success: true };
}

export async function saveRoleTheme(roleKey: string, themeKey: string) {
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "org.manage_members")) return { error: "You don't have permission to manage role themes." };
  const allowed = ["green", "navy", "teal", "plum", "fintech", "royal", "harvest", "eclipse"];
  if (!allowed.includes(themeKey)) return { error: "Invalid theme selected." };
  const supabase = await createClient();
  const { error } = await supabase.from("organization_role_themes").upsert({
    org_id: context.orgId, role_key: roleKey, theme_key: themeKey, updated_at: new Date().toISOString()
  });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { success: true };
}