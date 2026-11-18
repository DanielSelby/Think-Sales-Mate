export type AnnouncementDeliveryStatus = "sent" | "failed" | "unconfigured";

export function buildAnnouncementSmsContent(
  campusName: string,
  title: string,
  body: string,
  maxLength = 320,
): string {
  const content = `[${campusName}] ${title}: ${body}`
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(content).slice(0, Math.max(0, maxLength)).join("");
}

export function classifyAnnouncementDelivery(result: {
  sent: boolean;
  provider: string;
}): AnnouncementDeliveryStatus {
  if (result.sent) return "sent";
  return result.provider === "none" ? "unconfigured" : "failed";
}

export function sanitizeAnnouncementDeliveryError(reason: string | undefined): string | null {
  if (!reason) return null;
  return reason
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted email]")
    .replace(/\+?[0-9][0-9 ().-]{5,}[0-9]/g, "[redacted number]")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .slice(0, 300);
}
