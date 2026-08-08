"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { can } from "@/lib/rbac";
import type { MemberRole } from "@/lib/rbac";

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

  const supabase = createClient();
  const admin = createAdminClient();

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/dashboard`
  });

  if (inviteError) return { error: inviteError.message };

  const { error: memberError } = await supabase.from("organization_members").insert({
    org_id: context.orgId,
    user_id: invited.user?.id,
    invited_email: email,
    role,
    status: "invited",
    location_id: locationId || null
  });

  if (memberError) return { error: memberError.message };

  revalidatePath("/settings/organization");
  return { success: true };
}

export async function updateMemberRole(memberId: string, role: MemberRole) {
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "org.manage_members")) {
    return { error: "You don't have permission to change roles." };
  }

  const supabase = createClient();
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

  const supabase = createClient();
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

  const supabase = createClient();
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

  const supabase = createClient();
  const { data: member } = await supabase
    .from("organization_members")
    .select("invited_email, status")
    .eq("id", memberId)
    .eq("org_id", context.orgId)
    .single();

  if (!member?.invited_email) return { error: "No email on file for this member." };
  if (member.status !== "invited") return { error: "This member has already accepted their invite." };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.inviteUserByEmail(member.invited_email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/dashboard`
  });

  if (error) return { error: error.message };
  return { success: true };
}

export async function removeMember(memberId: string) {
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "org.manage_members")) {
    return { error: "You don't have permission to remove members." };
  }

  const supabase = createClient();
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

  const supabase = createClient();
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

    const { data: invitedUser, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/dashboard`
    });

    if (inviteError) {
      skipped.push({ row: i + 1, reason: inviteError.message });
      continue;
    }

    const { error: memberError } = await supabase.from("organization_members").insert({
      org_id: context.orgId,
      user_id: invitedUser.user?.id,
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

  const supabase = createClient();
  const { error } = await supabase
    .from("organizations")
    .update({ currency })
    .eq("id", context.orgId);

  if (error) return { error: error.message };

  revalidatePath("/settings/organization");
  return { success: true };
}