"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { can } from "@/lib/rbac";
import type { MemberRole } from "@/lib/rbac";

async function sendOrganizationInvite(email: string, name: string, orgName: string) {
  const admin = createAdminClient();
  const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/dashboard`;
  const { data: profile } = await admin
    .from("company_profile")
    .select("business_email, company_name")
    .eq("org_id", (await getCurrentOrgContext())?.orgId ?? "")
    .maybeSingle();
  const from = profile?.business_email;
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey || !from) {
    const fallback = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
    if (fallback.error) return { error: fallback.error.message };
    return { success: true, userId: fallback.data.user?.id };
  }
  const { data, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo, data: { full_name: name, organization_name: orgName } }
  });
  if (error) return { error: error.message };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `${profile.company_name || orgName} <${from}>`,
      to: [email],
      subject: `You are invited to ${profile.company_name || orgName}`,
      html: `<p>Hello ${name},</p><p>You have been invited to join <strong>${profile.company_name || orgName}</strong>.</p><p><a href="${data.properties.action_link}">Accept your invitation</a></p><p>This invitation link is single-use.</p>`
    })
  });
  if (!response.ok) return { error: `Invitation email could not be sent (${response.status}).` };
  return { success: true, userId: data.user?.id };
}

export async function inviteMember(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "staff") as MemberRole;
  const locationId = String(formData.get("location_id") ?? "").trim();

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
    location_id: locationId || null
  }).select("id").single();

  if (memberError) return { error: memberError.message };

  revalidatePath("/settings/organization");
  return { success: true, memberId: member?.id };
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