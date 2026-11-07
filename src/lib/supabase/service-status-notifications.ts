import "server-only";

import { deliverMessage, hasConfiguredMessageProvider } from "@/lib/communication/providers";
import {
  buildServiceStatusNotification,
  selectConsentedPreferredChannel,
} from "@/lib/service-center/status-notification";
import { createAdminClient } from "@/lib/supabase/admin";

type NotificationStatus = "sent" | "failed" | "skipped";

async function completeNotification(
  admin: ReturnType<typeof createAdminClient>,
  id: string,
  deliveryStatus: NotificationStatus,
  resultMessage: string,
  provider: string | null = null,
) {
  const { error } = await admin.from("service_job_status_notification_outbox")
    .update({
      delivery_status: deliveryStatus,
      provider,
      result_message: resultMessage.slice(0, 2000),
      processed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("delivery_status", "processing");
  if (error) throw new Error(`Could not record automatic repair message result: ${error.message}`);
}

export async function sendPendingServiceStatusNotifications(batchLimit = 50) {
  if (!Number.isInteger(batchLimit) || batchLimit < 1 || batchLimit > 100) {
    throw new Error("Repair status notification batch size must be an integer between 1 and 100.");
  }

  const admin = createAdminClient();
  const { data: notifications, error: claimError } = await admin.rpc("claim_service_job_status_notifications", {
    p_batch_limit: batchLimit,
  });
  if (claimError) throw new Error(`Could not claim repair status messages: ${claimError.message}`);

  const summary = { claimed: notifications?.length ?? 0, sent: 0, failed: 0, skipped: 0 };
  for (const notification of notifications ?? []) {
    try {
      const [
        { data: job, error: jobError },
        { data: settings, error: settingsError },
      ] = await Promise.all([
        admin.from("service_jobs")
          .select("id, job_number, customer_id, status, customer_update_channels")
          .eq("org_id", notification.org_id)
          .eq("location_id", notification.location_id)
          .eq("id", notification.job_id)
          .maybeSingle(),
        admin.from("service_status_notification_settings")
          .select("enabled")
          .eq("org_id", notification.org_id)
          .maybeSingle(),
      ]);
      if (jobError) throw new Error(`Could not load repair job: ${jobError.message}`);
      if (settingsError) throw new Error(`Could not check notification settings: ${settingsError.message}`);

      if (!job || !settings?.enabled || job.status !== notification.status) {
        const reason = !job ? "Repair job is no longer available."
          : !settings?.enabled ? "Automatic repair updates have been disabled."
            : "This status update was superseded by a newer repair status.";
        await completeNotification(admin, notification.id, "skipped", reason);
        summary.skipped += 1;
        continue;
      }

      const [
        { data: customer, error: customerError },
        { data: preferences, error: preferencesError },
      ] = await Promise.all([
        admin.from("customers")
          .select("id, name, phone, email")
          .eq("org_id", notification.org_id)
          .eq("id", job.customer_id)
          .maybeSingle(),
        admin.from("customer_message_preferences")
          .select("whatsapp, sms, email, preferred_channel")
          .eq("org_id", notification.org_id)
          .eq("customer_id", job.customer_id)
          .maybeSingle(),
      ]);
      if (customerError) throw new Error(`Could not load repair customer: ${customerError.message}`);
      if (preferencesError) throw new Error(`Could not load customer message preferences: ${preferencesError.message}`);
      if (!customer) {
        await completeNotification(admin, notification.id, "skipped", "Repair customer is no longer available.");
        summary.skipped += 1;
        continue;
      }

      const channel = selectConsentedPreferredChannel(
        preferences?.preferred_channel ?? "WhatsApp",
        job.customer_update_channels,
        preferences ?? null,
      );
      if (!channel) {
        await completeNotification(admin, notification.id, "skipped", "The preferred channel has no recorded repair-update consent or is opted out.");
        summary.skipped += 1;
        continue;
      }
      const recipient = (channel === "Email" ? customer.email : customer.phone)?.trim();
      if (!recipient) {
        await completeNotification(admin, notification.id, "skipped", `No ${channel === "Email" ? "email address" : "phone number"} is available.`);
        summary.skipped += 1;
        continue;
      }
      if (!hasConfiguredMessageProvider(channel)) {
        await completeNotification(admin, notification.id, "skipped", `No ${channel} provider is configured.`);
        summary.skipped += 1;
        continue;
      }

      const content = buildServiceStatusNotification(notification.status, job.job_number);
      if (!content) {
        await completeNotification(admin, notification.id, "skipped", "This status is not configured for automatic customer updates.");
        summary.skipped += 1;
        continue;
      }
      const subject = channel === "Email" ? `Repair update: ${job.job_number}` : null;
      const { data: history, error: historyInsertError } = await admin.from("communication_message_history")
        .insert({
          org_id: notification.org_id,
          customer_id: customer.id,
          event: `Service repair status: ${notification.status}`,
          channel,
          recipient,
          delivery_recipient: recipient,
          rendered_subject: subject,
          rendered_content: content,
          status: "Pending",
          sent_by: null,
          branch_scope: "service_status_automation",
        })
        .select("id")
        .single();
      if (historyInsertError) throw new Error(`Could not record delivery attempt: ${historyInsertError.message}`);

      const delivery = await deliverMessage({ channel, recipient, subject, content });
      const { error: historyUpdateError } = await admin.from("communication_message_history")
        .update({
          status: delivery.sent ? "Sent" : "Failed",
          delivery_provider: delivery.provider,
          failure_reason: delivery.reason ?? null,
        })
        .eq("org_id", notification.org_id)
        .eq("id", history.id);
      const resultMessage = historyUpdateError
        ? `${delivery.sent ? "Message sent" : "Message not sent"}; delivery history update failed: ${historyUpdateError.message}`
        : delivery.sent ? "Message sent." : delivery.reason ?? "Provider did not accept the message.";
      await completeNotification(
        admin,
        notification.id,
        delivery.sent && !historyUpdateError ? "sent" : "failed",
        resultMessage,
        delivery.provider,
      );
      if (delivery.sent && !historyUpdateError) summary.sent += 1;
      else summary.failed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected repair status message failure.";
      console.error(`Automatic repair status message ${notification.id} failed:`, error);
      await completeNotification(admin, notification.id, "failed", message);
      summary.failed += 1;
    }
  }

  return summary;
}
