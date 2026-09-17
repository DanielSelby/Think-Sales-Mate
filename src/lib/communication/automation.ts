import "server-only";

import { createClient } from "@/lib/supabase/server";
import { deliverMessage, type DeliveryChannel } from "@/lib/communication/providers";

type DeliveryInput = {
  orgId: string;
  event: string;
  customerId?: string | null;
  transactionPhone?: string | null;
  customerEmail?: string | null;
  variables?: Record<string, string | number | null | undefined>;
  actorId?: string | null;
};

const render = (value: string | null | undefined, variables: Record<string, string>) =>
  (value ?? "").replace(/\{\{([a-z_]+)\}\}/gi, (_, key: string) => variables[key.toLowerCase()] ?? "");

export async function dispatchAutomatedCustomerMessage(input: DeliveryInput) {
  const supabase = await createClient();
  const eventAliases: Record<string, string[]> = {
    "Sale Created": ["Sale Created", "Customer Places Order"],
    "Sale Completed": ["Sale Completed", "Customer Places Order"],
    "Order Delivered": ["Order Delivered", "Order Completed"],
  };
  const eventCandidates = eventAliases[input.event] ?? [input.event];
  const { data: automation } = await (supabase as any).from("communication_automations")
    .select("id, template_id, channel, enabled, use_transaction_phone, fallback_email").eq("org_id", input.orgId).in("event", eventCandidates).eq("enabled", true).maybeSingle();
  if (!automation?.template_id) return { sent: false, reason: "No enabled automation configured." };
  const { data: template } = await (supabase as any).from("communication_templates")
    .select("id, subject, content, channel, status").eq("id", automation.template_id).eq("status", "Approved").maybeSingle();
  if (!template) return { sent: false, reason: "Automation template is not approved." };
  const { data: customer } = input.customerId
    ? await supabase.from("customers").select("email, phone").eq("id", input.customerId).maybeSingle()
    : { data: null };
  const phone = (automation.use_transaction_phone === false ? null : input.transactionPhone?.trim()) || customer?.phone?.trim() || null;
  const email = input.customerEmail?.trim() || customer?.email?.trim() || null;
  const variables = Object.fromEntries(Object.entries(input.variables ?? {}).map(([key, value]) => [key.toLowerCase(), String(value ?? "")]));
  const content = render(template.content, variables);
  const subject = render(template.subject, variables);
  const configuredChannel = automation.channel === "WhatsApp" || automation.channel === "SMS" || automation.channel === "Email"
    ? automation.channel : template.channel;
  const channel = (configuredChannel === "WhatsApp" && !phone
    ? (automation.fallback_email !== false && email ? "Email" : configuredChannel)
    : configuredChannel) as DeliveryChannel;
  const recipient = channel === "Email" ? email : phone;
  let status = "Failed";
  let provider = "none";
  let failureReason = "Waiting for a configured delivery provider.";
  if (!recipient) {
    status = "Failed";
    failureReason = "No customer phone number or email address is available.";
  } else {
    const { data: preference } = await (supabase as any).from("customer_message_preferences")
      .select("whatsapp,sms,email").eq("org_id", input.orgId).eq("customer_id", input.customerId).maybeSingle();
    const allowed = channel === "WhatsApp" ? preference?.whatsapp !== false : channel === "SMS" ? preference?.sms !== false : preference?.email !== false;
    if (!allowed) {
      status = "Cancelled";
      failureReason = "Customer has opted out of this channel.";
    } else {
      const result = await deliverMessage({
        channel, recipient, subject: subject || input.event, content,
        fallbackToSms: channel === "WhatsApp" && preference?.sms !== false,
        smsRecipient: channel === "WhatsApp" ? phone : null,
      });
      status = result.sent ? "Sent" : "Failed";
      provider = result.provider;
      failureReason = result.reason || "";
    }
  }
  const { error } = await (supabase as any).from("communication_message_history").insert({
    org_id: input.orgId, template_id: template.id, customer_id: input.customerId ?? null, event: input.event,
    channel, recipient, delivery_recipient: recipient, rendered_subject: subject, rendered_content: content,
    status, sent_by: input.actorId ?? null, delivery_provider: provider, failure_reason: failureReason || null,
  });
  if (error) throw new Error(error.message);
  return { sent: status === "Sent", channel, recipient, status, reason: failureReason || undefined };
}
