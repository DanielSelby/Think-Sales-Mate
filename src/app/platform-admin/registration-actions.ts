"use server";

import { revalidatePath } from "next/cache";
import { getPlatformAdmin, platformRoleCan } from "@/lib/platform-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPlatformAdminClient } from "@/lib/supabase/platform-admin";
import { createPlatformServerClient } from "@/lib/supabase/platform-server";
import { deliverRegistrationEmail, getRegistrationNotificationRecipients } from "@/lib/organizations/registration-email";

async function requireRegistrationManager() {
  const admin = await getPlatformAdmin();
  if (!admin || !platformRoleCan(admin.role, "manage_platform")) {
    throw new Error("You do not have permission to manage organization registrations.");
  }
  return admin;
}

async function insertAudit(adminId: string, organizationId: string | null, action: string, metadata: Record<string, unknown> = {}) {
  const platform = await createPlatformServerClient();
  const { error } = await platform.from("platform_audit_logs").insert({
    admin_id: adminId,
    organization_id: organizationId,
    action,
    module: "organization_registration",
    metadata,
  });
  if (error) throw new Error(`Registration action was saved, but its audit record failed: ${error.message}`);
}

async function addOwnerMessage(organizationId: string, message: string) {
  const app = createAdminClient();
  const { error } = await app.from("organization_registration_messages").insert({
    organization_id: organizationId,
    author_type: "platform_admin",
    message,
  });
  if (error) throw new Error(`Could not save the registration message: ${error.message}`);
}

async function loadPlatformOrganization(id: string) {
  const platform = createPlatformAdminClient();
  const { data, error } = await platform
    .from("platform_organizations")
    .select("organization_id, name, owner_email, owner_user_id, status, registration_state, registration_notes, info_requested_at, reviewed_by, reviewed_at")
    .eq("id", id)
    .single();
  if (error) throw new Error(`Could not load registration application: ${error.message}`);
  return data;
}

async function notifyOwner(organization: Awaited<ReturnType<typeof loadPlatformOrganization>>, event: string, subject: string, content: string) {
  let recipient = organization.owner_email?.trim() ?? "";
  if (!recipient && organization.owner_user_id) {
    const app = createAdminClient();
    const { data, error } = await app.auth.admin.getUserById(organization.owner_user_id);
    if (error) throw new Error(`Could not resolve organization owner's email: ${error.message}`);
    recipient = data.user.email ?? "";
  }
  if (!recipient) return;
  const result = await deliverRegistrationEmail({
    dedupeKey: `${event}:${organization.organization_id}:${recipient.toLowerCase()}`,
    organizationId: organization.organization_id,
    recipient,
    subject,
    content,
  });
  if (!result.sent) console.error(`[registration-email] ${event} delivery failed for ${recipient}: ${result.error ?? "unknown provider error"}`);
}

export async function reviewOrganizationRegistration(formData: FormData) {
  const admin = await requireRegistrationManager();
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!id || !["approve", "reject", "request_information"].includes(decision)) throw new Error("Invalid registration review request.");
  if (decision !== "approve" && !reason) throw new Error("A message is required for rejection or information requests.");
  const organization = await loadPlatformOrganization(id);
  const platform = createPlatformAdminClient();

  if (decision === "request_information") {
    const { data: updated, error } = await platform.from("platform_organizations").update({
      registration_state: "information_requested",
      registration_notes: reason,
      info_requested_at: new Date().toISOString(),
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
    }).eq("id", id).eq("status", "pending")
      .in("registration_state", ["pending", "information_requested"])
      .select("id").maybeSingle();
    if (error) throw new Error(`Could not request registration information: ${error.message}`);
    if (!updated) throw new Error("This registration is no longer awaiting review.");
    await addOwnerMessage(organization.organization_id, reason);
    await insertAudit(admin.id, organization.organization_id, "registration_information_requested", { message: reason });
    await notifyOwner(organization, "information-requested", "More information needed for your registration", reason);
  } else {
    const status = decision === "approve" ? "approved" : "rejected";
    const { data: updated, error } = await platform.from("platform_organizations").update({
      status: decision === "approve" ? "active" : "rejected",
      registration_state: status,
      registration_notes: decision === "reject" ? reason : null,
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", id).eq("status", "pending")
      .in("registration_state", ["pending", "information_requested"])
      .select("id").maybeSingle();
    if (error) {
      throw new Error(`Could not save the registration decision: ${error.message}`);
    }
    if (!updated) throw new Error("This registration is no longer awaiting review.");
    const app = createAdminClient();
    const { error: appError } = await app.from("organizations").update({ registration_status: status }).eq("id", organization.organization_id);
    if (appError) {
      const { error: rollbackError } = await platform.from("platform_organizations").update({
        status: "pending",
        registration_state: organization.registration_state,
        registration_notes: organization.registration_notes,
        info_requested_at: organization.info_requested_at,
        reviewed_by: organization.reviewed_by,
        reviewed_at: organization.reviewed_at,
      }).eq("id", id).eq("status", decision === "approve" ? "active" : "rejected")
        .eq("registration_state", status);
      if (rollbackError) console.error(`[registration] Failed to restore pending review after application database update failure: ${rollbackError.message}`);
      throw new Error(`Could not update organization access: ${appError.message}`);
    }
    if (reason) await addOwnerMessage(organization.organization_id, reason);
    await insertAudit(admin.id, organization.organization_id, status === "approved" ? "registration_approved" : "registration_rejected", { reason });
    await notifyOwner(
      organization,
      status,
      status === "approved" ? "Your organization registration is approved" : "Your organization registration was not approved",
      status === "approved" ? `Your workspace "${organization.name}" is now available.` : reason,
    );
  }
  revalidatePath("/platform-admin/registrations");
  revalidatePath("/platform-admin");
}

export async function saveRegistrationNotificationSettings(formData: FormData) {
  const admin = await requireRegistrationManager();
  const recipients = String(formData.get("recipients") ?? "")
    .split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
  const invalid = recipients.find((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  if (invalid) throw new Error(`Invalid notification email address: ${invalid}`);
  const supabase = await createPlatformServerClient();
  const { error } = await supabase.from("platform_settings").upsert({
    key: "registration_notification_emails",
    value: { recipients: [...new Set(recipients)] },
    updated_by: admin.id,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Could not save registration notification settings: ${error.message}`);
  const { error: auditError } = await supabase.from("platform_audit_logs").insert({
    admin_id: admin.id,
    action: "registration_notification_recipients_updated",
    module: "organization_registration",
    metadata: { recipientCount: recipients.length },
  });
  if (auditError) throw new Error(`Settings were saved, but the audit record failed: ${auditError.message}`);
  revalidatePath("/platform-admin/registrations");
}

export async function sendRegistrationTestEmail(formData: FormData) {
  const admin = await requireRegistrationManager();
  const recipient = String(formData.get("recipient") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) throw new Error("Enter a valid test email address.");
  const result = await deliverRegistrationEmail({
    dedupeKey: `test:${admin.id}:${Date.now()}`,
    recipient,
    subject: "Platform registration notification test",
    content: "This is a test email from the organization registration approval settings.",
  });
  if (!result.sent) throw new Error(`Test email delivery failed: ${result.error ?? "provider error"}`);
  const supabase = await createPlatformServerClient();
  const { error } = await supabase.from("platform_audit_logs").insert({
    admin_id: admin.id,
    action: "registration_test_email_sent",
    module: "organization_registration",
    metadata: { recipient, provider: result.provider },
  });
  if (error) throw new Error(`Test email was sent, but the audit record failed: ${error.message}`);
  revalidatePath("/platform-admin/registrations");
}

export async function retryRegistrationEmail(formData: FormData) {
  const admin = await requireRegistrationManager();
  const deliveryId = String(formData.get("deliveryId") ?? "");
  const platform = createPlatformAdminClient();
  const { data: delivery, error } = await platform
    .from("platform_registration_deliveries")
    .select("id, dedupe_key, organization_id, recipient, subject, content")
    .eq("id", deliveryId)
    .single();
  if (error) throw new Error(`Could not load failed registration email: ${error.message}`);
  const result = await deliverRegistrationEmail({
    dedupeKey: delivery.dedupe_key,
    organizationId: delivery.organization_id,
    recipient: delivery.recipient,
    subject: delivery.subject,
    content: delivery.content,
  });
  if (!result.sent) throw new Error(`Registration email retry failed: ${result.error ?? "provider error"}`);
  await insertAudit(admin.id, delivery.organization_id, "registration_email_retried", { deliveryId, recipient: delivery.recipient });
  revalidatePath("/platform-admin/registrations");
}

export async function respondToRegistrationRequest(formData: FormData) {
  const supabase = await createPlatformServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to respond to the registration request.");
  const organizationId = String(formData.get("organizationId") ?? "");
  const message = String(formData.get("message") ?? "").trim();
  if (!organizationId || !message || message.length > 4000) throw new Error("Enter a response of up to 4,000 characters.");
  const app = createAdminClient();
  const { data: organization, error: organizationError } = await app
    .from("organizations")
    .select("id, registration_status, created_by")
    .eq("id", organizationId)
    .single();
  if (organizationError || !organization) throw new Error("Could not find this registration.");
  if (organization.created_by !== user.id || organization.registration_status !== "pending") {
    throw new Error("Only the workspace owner can respond to a pending registration.");
  }
  const { data: savedMessage, error } = await app.from("organization_registration_messages").insert({
    organization_id: organizationId,
    author_user_id: user.id,
    author_type: "owner",
    message,
  }).select("id").single();
  if (error || !savedMessage) throw new Error(`Could not save your registration response: ${error?.message ?? "No message record returned."}`);
  const platform = createPlatformAdminClient();
  const { data: application, error: applicationError } = await platform
    .from("platform_organizations")
    .select("id, name")
    .eq("organization_id", organizationId)
    .single();
  if (applicationError) throw new Error(`Your response was saved, but the registration queue could not be loaded: ${applicationError.message}`);
  const { error: updateError } = await platform.from("platform_organizations").update({
    registration_state: "pending",
    registration_notes: null,
  }).eq("organization_id", organizationId);
  if (updateError) throw new Error(`Your response was saved, but the registration queue could not be updated: ${updateError.message}`);
  const { error: notificationError } = await platform.from("platform_notifications").insert({
    severity: "info",
    title: "Owner responded to registration request",
    message: `The owner of organization ${organizationId} sent a response.`,
  });
  if (notificationError) throw new Error(`Your response was saved, but the Platform Admin notification failed: ${notificationError.message}`);
  const { error: auditError } = await platform.from("platform_audit_logs").insert({
    organization_id: organizationId,
    action: "registration_owner_responded",
    module: "organization_registration",
    metadata: { ownerUserId: user.id, messageId: savedMessage.id },
  });
  if (auditError) throw new Error(`Your response was saved, but its audit record failed: ${auditError.message}`);
  const recipients = await getRegistrationNotificationRecipients();
  for (const recipient of recipients) {
    const result = await deliverRegistrationEmail({
      dedupeKey: `owner-response:${savedMessage.id}:${recipient}`,
      organizationId,
      recipient,
      subject: `Owner response received: ${application.name}`,
      content: `The owner of "${application.name}" has responded to the registration information request.\n\n${message}`,
    });
    if (!result.sent) console.error(`[registration-email] Owner response notification failed for ${recipient}: ${result.error ?? "provider error"}`);
  }
  revalidatePath("/registration-status");
  revalidatePath("/platform-admin/registrations");
}
