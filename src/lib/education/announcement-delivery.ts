import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { deliverMessage, type DeliveryChannel } from "@/lib/communication/providers";
import {
  buildAnnouncementSmsContent,
  classifyAnnouncementDelivery,
  sanitizeAnnouncementDeliveryError,
} from "./announcement-messaging";

export type AnnouncementDeliveryBatchResult = {
  sent: number;
  failed: number;
  unconfigured: number;
};

export async function dispatchEducationAnnouncementDeliveries(
  actorId: string,
  announcementId: string,
  retryFailed = false,
): Promise<AnnouncementDeliveryBatchResult> {
  const admin = createAdminClient();
  const { data: jobs, error: claimError } = await admin.rpc("education_announcement_claim_delivery_jobs", {
    p_actor_id: actorId,
    p_announcement_id: announcementId,
    p_retry_failed: retryFailed,
  });
  if (claimError) {
    throw new Error(`Could not claim Think Education announcement deliveries: ${claimError.message}`);
  }

  const totals: AnnouncementDeliveryBatchResult = { sent: 0, failed: 0, unconfigured: 0 };
  const claimedJobs = jobs ?? [];
  for (let offset = 0; offset < claimedJobs.length; offset += 5) {
    await Promise.all(claimedJobs.slice(offset, offset + 5).map(async (job) => {
      if (job.channel !== "email" && job.channel !== "sms") {
        throw new Error("The announcement delivery queue returned an unsupported channel.");
      }
      const channel: DeliveryChannel = job.channel === "email" ? "Email" : "SMS";
      const result = await deliverMessage({
        channel,
        recipient: job.recipient,
        subject: channel === "Email" ? job.subject : undefined,
        content: channel === "Email"
          ? job.content
          : buildAnnouncementSmsContent(job.campus_name, job.subject, job.content),
      });
      const status = classifyAnnouncementDelivery(result);
      const { error: completeError } = await admin.rpc("education_announcement_complete_delivery_job", {
        p_actor_id: actorId,
        p_delivery_id: job.delivery_id,
        p_status: status,
        p_provider: result.provider,
        p_error: sanitizeAnnouncementDeliveryError(result.reason),
      });
      if (completeError) {
        throw new Error(`Could not record Think Education announcement delivery status: ${completeError.message}`);
      }
      totals[status] += 1;
    }));
  }
  return totals;
}
