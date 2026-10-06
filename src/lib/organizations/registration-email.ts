import "server-only";

import { deliverMessage } from "@/lib/communication/providers";
import { createPlatformAdminClient } from "@/lib/supabase/platform-admin";

export async function getRegistrationNotificationRecipients() {
  const platform = createPlatformAdminClient();
  const { data, error } = await platform.from("platform_settings").select("value").eq("key", "registration_notification_emails").maybeSingle();
  if (error) throw new Error(`Could not load registration notification settings: ${error.message}`);
  const configured = data?.value?.recipients;
  const fromSettings = Array.isArray(configured)
    ? configured.filter((email): email is string => typeof email === "string").map((email) => email.trim().toLowerCase()).filter(Boolean)
    : [];
  const fromEnvironment = (process.env.PLATFORM_ADMIN_NOTIFICATION_EMAILS ?? "")
    .split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
  return [...new Set(fromSettings.length ? fromSettings : fromEnvironment)];
}

export async function deliverRegistrationEmail(input: {
  dedupeKey: string;
  organizationId?: string | null;
  recipient: string;
  subject: string;
  content: string;
}) {
  const platform = createPlatformAdminClient();
  const { data: deliveryId, error: claimError } = await platform.rpc("claim_platform_registration_delivery", {
    p_dedupe_key: input.dedupeKey,
    p_organization_id: input.organizationId ?? null,
    p_recipient: input.recipient,
    p_subject: input.subject,
    p_content: input.content,
  });
  if (claimError) throw new Error(`Could not claim registration email delivery: ${claimError.message}`);
  if (!deliveryId) {
    const { data: prior, error: priorError } = await platform
      .from("platform_registration_deliveries")
      .select("status")
      .eq("dedupe_key", input.dedupeKey)
      .maybeSingle();
    if (priorError) throw new Error(`Could not check registration email history: ${priorError.message}`);
    if (prior?.status === "sent") return { sent: true, duplicate: true };
    return { sent: false, duplicate: true, error: "This registration email is already being delivered." };
  }

  const result = await deliverMessage({ channel: "Email", recipient: input.recipient, subject: input.subject, content: input.content });
  const { error: updateError } = await platform
    .from("platform_registration_deliveries")
    .update({
      status: result.sent ? "sent" : "failed",
      provider: result.provider,
      error: result.reason ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", deliveryId);
  if (updateError) throw new Error(`Email result could not be saved to registration history: ${updateError.message}`);
  return { sent: result.sent, duplicate: false, provider: result.provider, error: result.reason };
}

export async function notifyRegistrationApplication(organization: {
  id: string;
  name: string;
  ownerEmail: string;
}) {
  const platform = createPlatformAdminClient();
  const { error: notificationError } = await platform.from("platform_notifications").insert({
    severity: "info",
    title: "Organization registration pending",
    message: `Organization "${organization.name}" is awaiting review. Owner email: ${organization.ownerEmail || "Not available"}.`,
  });
  if (notificationError) console.error(`[registration-notification] Could not create Platform Admin notification: ${notificationError.message}`);
  const { error: auditError } = await platform.from("platform_audit_logs").insert({
    organization_id: organization.id,
    action: "organization_registration_submitted",
    module: "organization_registration",
    metadata: { name: organization.name, ownerEmail: organization.ownerEmail },
  });
  if (auditError) console.error(`[registration-audit] Could not record new registration: ${auditError.message}`);
  const recipients = await getRegistrationNotificationRecipients();
  if (!recipients.length) {
    console.error("[registration-email] No Platform Admin email recipient is configured; in-app notification recorded.");
    return;
  }

  const subject = `Organization registration pending: ${organization.name}`;
  const content = `A new organization registration is awaiting review.\n\nOrganization: ${organization.name}\nOwner email: ${organization.ownerEmail || "Not available"}\nOrganization ID: ${organization.id}`;
  for (const recipient of recipients) {
    const result = await deliverRegistrationEmail({
      dedupeKey: `registration-created:${organization.id}:${recipient}`,
      organizationId: organization.id,
      recipient,
      subject,
      content,
    });
    if (!result.sent) console.error(`[registration-email] New application notification failed for ${recipient}: ${result.error ?? "provider error"}`);
  }
}
