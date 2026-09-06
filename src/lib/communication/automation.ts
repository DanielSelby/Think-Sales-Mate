import "server-only";

import { createClient } from "@/lib/supabase/server";

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
  const { data: automation } = await (supabase as any)
    .from("communication_automations")
    .select("id, template_id, channel, enabled, use_transaction_phone, fallback_email")
    .eq("org_id", input.orgId)
    .eq("event", input.event)
    .eq("enabled", true)
    .maybeSingle();
  if (!automation?.template_id) return { sent: false, reason: "No enabled automation configured." };

  const { data: template } = await (supabase as any)
    .from("communication_templates")
    .select("id, subject, content, channel, status")
    .eq("id", automation.template_id)
    .eq("status", "Approved")
    .maybeSingle();
  if (!template) return { sent: false, reason: "Automation template is not approved." };

  const { data: customer } = input.customerId
    ? await supabase.from("customers").select("email, phone").eq("id", input.customerId).maybeSingle()
    : { data: null };
  const phone = input.transactionPhone?.trim() || customer?.phone?.trim() || null;
  const email = input.customerEmail?.trim() || customer?.email?.trim() || null;
  const variables = Object.fromEntries(Object.entries(input.variables ?? {}).map(([key, value]) => [key.toLowerCase(), String(value ?? "")]));
  const content = render(template.content, variables);
  const subject = render(template.subject, variables);
  const channel = phone ? "SMS" : email ? "Email" : template.channel;
  const recipient = channel === "SMS" ? phone : channel === "Email" ? email : null;
  let status = "Pending";
  let provider = "none";
  let failureReason = "Waiting for a configured delivery provider.";

  if (channel === "SMS" && recipient && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER) {
    const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
    const body = new URLSearchParams({ To: recipient, From: process.env.TWILIO_FROM_NUMBER, Body: content });
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`, { method: "POST", headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" }, body });
    status = response.ok ? "Sent" : "Failed";
    provider = "twilio";
    failureReason = response.ok ? "" : await response.text();
  } else if (channel === "Email" && recipient && process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL) {
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL, to: [recipient], subject: subject || input.event, text: content }) });
    status = response.ok ? "Sent" : "Failed";
    provider = "resend";
    failureReason = response.ok ? "" : await response.text();
  } else if (!recipient) {
    status = "Failed";
    provider = "none";
    failureReason = "No customer phone number or email address is available.";
  }

  const { error } = await (supabase as any).from("communication_message_history").insert({
    org_id: input.orgId, template_id: template.id, customer_id: input.customerId ?? null,
    event: input.event, channel, recipient, delivery_recipient: recipient, rendered_subject: subject,
    rendered_content: content, status, sent_by: input.actorId ?? null, delivery_provider: provider,
    failure_reason: failureReason || null
  });
  if (error) throw new Error(error.message);
  return { sent: status === "Sent", channel, recipient, status, reason: failureReason || undefined };
}
