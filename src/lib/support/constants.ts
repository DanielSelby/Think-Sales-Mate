export const SUPPORT_CATEGORIES = [
  "Technical Support",
  "Login & Access",
  "Inventory",
  "Sales",
  "Purchases",
  "Accounting",
  "CRM",
  "Subscription",
  "Billing",
  "Feature Request",
  "Training Request",
  "Bug Report",
  "Other",
] as const;

export const SUPPORT_PRIORITIES = ["low", "medium", "high", "critical"] as const;

export type SupportPriority = (typeof SUPPORT_PRIORITIES)[number];

export function getSlaHours(priority: SupportPriority) {
  return {
    low: { response: 24, resolution: 72 },
    medium: { response: 8, resolution: 48 },
    high: { response: 2, resolution: 24 },
    critical: { response: 0.5, resolution: 8 },
  }[priority];
}

export function getSlaStatus(ticket: {
  status: string;
  priority: SupportPriority;
  first_response_due: string;
  resolution_due: string;
  resolved_at: string | null;
}) {
  const now = Date.now();
  if (ticket.status === "resolved" || ticket.status === "closed") {
    return ticket.resolved_at && new Date(ticket.resolved_at).getTime() <= new Date(ticket.resolution_due).getTime()
      ? "resolved_within_sla"
      : "resolved_after_sla";
  }
  const due = new Date(ticket.resolution_due).getTime();
  const created = due - getSlaHours(ticket.priority).resolution * 60 * 60 * 1000;
  if (now >= due) return "sla_breached";
  if (now >= created + (due - created) * 0.75) return "approaching_sla";
  return "within_sla";
}
