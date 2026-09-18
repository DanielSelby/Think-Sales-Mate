"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canPermission } from "@/lib/rbac/permissions";
import { deliverMessage, type DeliveryChannel } from "@/lib/communication/providers";

const path = "/communication";
const transitions: Record<string, string[]> = {
  Draft: ["Submitted", "Cancelled"], Submitted: ["Approved", "Rejected"],
  Approved: ["Scheduled", "Cancelled"], Scheduled: ["Sent", "Cancelled"],
};

async function authorized(capability: "messaging.create" | "messaging.submit" | "messaging.approve" | "messaging.send") {
  const context = await getCurrentOrgContext();
  const action = capability === "messaging.create" ? "create"
    : capability === "messaging.submit" ? "edit"
    : capability === "messaging.approve" ? "approve"
    : "edit";
  return context && await canPermission("communication", action) ? context : null;
}

export async function transitionCustomerMessage(input: { campaignId: string; action: "Submitted" | "Approved" | "Rejected" | "Scheduled" | "Sent" | "Cancelled"; comment?: string }) {
  if (!await canPermission("communication", "edit")) {
    return { error: "You do not have permission to edit communication." };
  }
  const context = await authorized(input.action === "Submitted" ? "messaging.submit" : input.action === "Approved" || input.action === "Rejected" ? "messaging.approve" : "messaging.send");
  if (!context) return { error: "You do not have permission to perform this messaging action." };
  const supabase = await createClient();
  const { data: campaign } = await (supabase as any).from("customer_message_campaigns").select("id,status,org_id,scheduled_at").eq("id", input.campaignId).eq("org_id", context.orgId).maybeSingle();
  if (!campaign || !transitions[campaign.status]?.includes(input.action)) return { error: "That message cannot make this transition." };
  const update: Record<string, unknown> = { status: input.action, updated_at: new Date().toISOString() };
  if (input.action === "Approved") update.approved_by = context.userId;
  if (input.action === "Scheduled" && !campaign.scheduled_at) update.scheduled_at = new Date().toISOString();
  const { error } = await (supabase as any).from("customer_message_campaigns").update(update).eq("id", campaign.id).eq("status", campaign.status);
  if (error) return { error: error.message };
  const { error: approvalError } = await (supabase as any).from("customer_message_approvals").insert({ org_id: context.orgId, campaign_id: campaign.id, action: input.action, comment: input.comment?.trim() || null, acted_by: context.userId });
  if (approvalError) return { error: approvalError.message };
  if (input.action === "Scheduled") {
    const { data: full } = await (supabase as any).from("customer_message_campaigns").select("name,audience,channel,template_id,scheduled_at").eq("id", campaign.id).maybeSingle();
    if (full) await (supabase as any).from("customer_scheduled_messages").insert({ org_id: context.orgId, name: full.name, audience: full.audience, channel: full.channel, template_id: full.template_id, scheduled_at: full.scheduled_at || new Date().toISOString(), status: "Scheduled", created_by: context.userId });
  }
  revalidatePath(path);
  return { success: true };
}

export async function sendCustomerCampaignNow(campaignId: string) {
  if (!await canPermission("communication", "approve")) {
    return { error: "You do not have permission to approve communication." };
  }
  const context = await authorized("messaging.send");
  if (!context) return { error: "You do not have permission to send campaigns." };
  const supabase = await createClient();
  const { data: campaign } = await (supabase as any).from("customer_message_campaigns").select("*").eq("id", campaignId).eq("org_id", context.orgId).maybeSingle();
  if (!campaign || !["Approved", "Scheduled"].includes(campaign.status)) return { error: "Only approved campaigns can be sent." };
  const { data: template } = campaign.template_id ? await (supabase as any).from("communication_templates").select("subject,content").eq("id", campaign.template_id).maybeSingle() : { data: null };
  if (!template) return { error: "Select an approved message template before sending." };
  const { data: customers } = await supabase.from("customers").select("id,name,email,phone").eq("org_id", context.orgId);
  let sent = 0;
  for (const customer of customers ?? []) {
    const recipient = campaign.channel === "Email" ? customer.email : customer.phone;
    if (!recipient) continue;
    const result = await deliverMessage({ channel: campaign.channel as DeliveryChannel, recipient, subject: template.subject, content: template.content.replace(/\{\{customer_name\}\}/gi, customer.name) });
    await (supabase as any).from("communication_message_history").insert({ org_id: context.orgId, template_id: campaign.template_id, customer_id: customer.id, event: `Campaign: ${campaign.name}`, channel: campaign.channel, recipient, delivery_recipient: recipient, rendered_subject: template.subject, rendered_content: template.content, status: result.sent ? "Sent" : "Failed", sent_by: context.userId, delivery_provider: result.provider, failure_reason: result.reason || null });
    if (result.sent) sent++;
  }
  await (supabase as any).from("customer_message_campaigns").update({ status: "Sent", sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", campaign.id);
  await (supabase as any).from("customer_message_approvals").insert({ org_id: context.orgId, campaign_id: campaign.id, action: "Sent", acted_by: context.userId });
  revalidatePath(path);
  return { success: true, sent };
}

export async function duplicateCustomerCampaign(campaignId: string) {
  const context = await authorized("messaging.create");
  if (!context) return { error: "You do not have permission to duplicate campaigns." };
  const supabase = await createClient();
  const { data: campaign } = await (supabase as any).from("customer_message_campaigns").select("name,campaign_type,audience,channel,template_id").eq("id", campaignId).eq("org_id", context.orgId).maybeSingle();
  if (!campaign) return { error: "Campaign not found." };
  const { error } = await (supabase as any).from("customer_message_campaigns").insert({ ...campaign, name: `${campaign.name} (Copy)`, org_id: context.orgId, created_by: context.userId, status: "Draft", scheduled_at: null, sent_at: null });
  if (error) return { error: error.message };
  revalidatePath(path);
  return { success: true };
}

export async function saveCustomerMessagePreferences(input: { customerId: string; whatsapp?: boolean; sms?: boolean; email?: boolean; portalNotification?: boolean; preferredChannel?: DeliveryChannel }) {
  const context = await authorized("messaging.create");
  if (!context) return { error: "You do not have permission to update message preferences." };
  const supabase = await createClient();
  const { error } = await (supabase as any).from("customer_message_preferences").upsert({
    org_id: context.orgId, customer_id: input.customerId, whatsapp: input.whatsapp ?? true, sms: input.sms ?? true,
    email: input.email ?? true, portal_notification: input.portalNotification ?? true, preferred_channel: input.preferredChannel ?? "WhatsApp", updated_at: new Date().toISOString(),
  }, { onConflict: "org_id,customer_id" });
  return error ? { error: error.message } : { success: true };
}

export async function executeDueCustomerMessages(now = new Date()) {
  const context = await authorized("messaging.send");
  if (!context) return { error: "You do not have permission to send scheduled messages." };
  const supabase = await createClient();
  const { data: jobs, error } = await (supabase as any).from("customer_scheduled_messages").select("id,name,audience,channel,template_id,scheduled_at").eq("org_id", context.orgId).eq("status", "Scheduled").lte("scheduled_at", now.toISOString());
  if (error) return { error: error.message };
  let sent = 0;
  for (const job of jobs ?? []) {
    const { data: template } = await (supabase as any).from("communication_templates").select("subject,content").eq("id", job.template_id).eq("status", "Approved").maybeSingle();
    if (!template) continue;
    const { data: customers } = await supabase.from("customers").select("id,name,email,phone").eq("org_id", context.orgId);
    for (const customer of customers ?? []) {
      const { data: preference } = await (supabase as any).from("customer_message_preferences").select("whatsapp,sms,email,preferred_channel").eq("org_id", context.orgId).eq("customer_id", customer.id).maybeSingle();
      const channel = (preference?.preferred_channel || job.channel) as DeliveryChannel;
      const allowed = channel === "WhatsApp" ? preference?.whatsapp !== false : channel === "SMS" ? preference?.sms !== false : preference?.email !== false;
      const recipient = channel === "Email" ? customer.email : customer.phone;
      if (!allowed || !recipient) continue;
      const result = await deliverMessage({
        channel, recipient, subject: template.subject, content: template.content.replace(/\{\{customer_name\}\}/gi, customer.name),
        fallbackToSms: channel === "WhatsApp" && preference?.sms !== false,
        smsRecipient: channel === "WhatsApp" ? customer.phone : null,
      });
      await (supabase as any).from("communication_message_history").insert({ org_id: context.orgId, template_id: job.template_id, customer_id: customer.id, event: "Scheduled customer message", channel, recipient, delivery_recipient: recipient, rendered_subject: template.subject, rendered_content: template.content, status: result.sent ? "Sent" : "Failed", sent_by: context.userId, delivery_provider: result.provider, failure_reason: result.reason || null });
      if (result.sent) sent++;
    }
    await (supabase as any).from("customer_scheduled_messages").update({ status: "Sent" }).eq("id", job.id).eq("status", "Scheduled");
  }
  return { success: true, sent };
}
