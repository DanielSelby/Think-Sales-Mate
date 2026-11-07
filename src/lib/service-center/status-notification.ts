import type { ServiceJobStatus } from "@/types/database";

export const AUTOMATIC_SERVICE_UPDATE_STATUSES = [
  "received",
  "awaiting_customer_approval",
  "in_progress",
  "awaiting_parts",
  "ready_for_collection",
  "awaiting_payment",
] as const satisfies readonly ServiceJobStatus[];

export type AutomaticServiceUpdateStatus = (typeof AUTOMATIC_SERVICE_UPDATE_STATUSES)[number];

const STATUS_MESSAGES: Record<AutomaticServiceUpdateStatus, string> = {
  received: "We have received your equipment and recorded the repair request.",
  awaiting_customer_approval: "Your repair estimate is ready. Please contact our team to review it and let us know how you would like to proceed.",
  in_progress: "Work on your repair is in progress.",
  awaiting_parts: "Your repair is waiting for parts. We will share another update when work can continue.",
  ready_for_collection: "Your equipment is ready for collection. Please contact our team to arrange pickup.",
  awaiting_payment: "Your repair invoice is ready. Please contact our team about the outstanding balance before collection.",
};

function isAutomaticServiceUpdateStatus(status: string): status is AutomaticServiceUpdateStatus {
  return AUTOMATIC_SERVICE_UPDATE_STATUSES.some((allowedStatus) => allowedStatus === status);
}

export function buildServiceStatusNotification(status: string, jobNumber: string): string | null {
  if (!isAutomaticServiceUpdateStatus(status)) return null;
  const message = STATUS_MESSAGES[status];
  return `Repair update for job ${jobNumber}: ${message}`;
}

export function selectConsentedPreferredChannel(
  preferredChannel: string | null | undefined,
  consentedChannels: readonly string[],
  preferences: { whatsapp: boolean; sms: boolean; email: boolean } | null,
): "WhatsApp" | "SMS" | "Email" | null {
  if (preferredChannel !== "WhatsApp" && preferredChannel !== "SMS" && preferredChannel !== "Email") return null;
  if (!consentedChannels.includes(preferredChannel)) return null;
  const enabled = preferredChannel === "WhatsApp" ? preferences?.whatsapp !== false
    : preferredChannel === "SMS" ? preferences?.sms !== false
      : preferences?.email !== false;
  return enabled ? preferredChannel : null;
}
