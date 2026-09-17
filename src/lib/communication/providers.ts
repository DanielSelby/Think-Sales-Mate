import "server-only";

export type DeliveryChannel = "WhatsApp" | "SMS" | "Email";
export type ProviderResult = { sent: boolean; provider: string; reason?: string; fallback?: boolean };

const configured = (...names: string[]) => names.map((name) => process.env[name]).find(Boolean);
const formPost = async (url: string, headers: Record<string, string>, values: Record<string, string>) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers }, body: new URLSearchParams(values) });

async function sendSms(recipient: string, content: string): Promise<ProviderResult> {
  const twilioSid = configured("TWILIO_ACCOUNT_SID");
  if (twilioSid && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER) {
    const response = await formPost(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
      Authorization: `Basic ${Buffer.from(`${twilioSid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
    }, { To: recipient, From: process.env.TWILIO_FROM_NUMBER, Body: content });
    return { sent: response.ok, provider: "twilio-sms", reason: response.ok ? undefined : "Twilio rejected the SMS." };
  }
  const hubtelKey = configured("HUBTEL_CLIENT_ID");
  if (hubtelKey && process.env.HUBTEL_CLIENT_SECRET && process.env.HUBTEL_FROM) {
    const response = await fetch("https://sms.hubtel.com/v1/messages/send", {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${hubtelKey}:${process.env.HUBTEL_CLIENT_SECRET}`).toString("base64")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ From: process.env.HUBTEL_FROM, To: recipient, Content: content }),
    });
    return { sent: response.ok, provider: "hubtel", reason: response.ok ? undefined : "Hubtel rejected the SMS." };
  }
  const arkeselKey = configured("ARKESEL_API_KEY");
  if (arkeselKey && process.env.ARKESEL_SENDER) {
    const response = await formPost("https://sms.arkesel.com/api/v2/sms/send", { "api-key": arkeselKey }, { sender: process.env.ARKESEL_SENDER, message: content, recipients: recipient });
    return { sent: response.ok, provider: "arkesel", reason: response.ok ? undefined : "Arkesel rejected the SMS." };
  }
  const africasTalkingKey = configured("AFRICASTALKING_API_KEY");
  if (africasTalkingKey && process.env.AFRICASTALKING_USERNAME && process.env.AFRICASTALKING_FROM) {
    const response = await formPost("https://api.africastalking.com/version1/messaging", { apiKey: africasTalkingKey, Accept: "application/json" }, { username: process.env.AFRICASTALKING_USERNAME, to: recipient, message: content, from: process.env.AFRICASTALKING_FROM });
    return { sent: response.ok, provider: "africas-talking", reason: response.ok ? undefined : "Africa's Talking rejected the SMS." };
  }
  return { sent: false, provider: "none", reason: "No SMS provider is configured." };
}

async function sendWhatsApp(recipient: string, content: string): Promise<ProviderResult> {
  const to = recipient.replace(/^whatsapp:/i, "");
  const cloudToken = configured("WHATSAPP_CLOUD_ACCESS_TOKEN", "META_WHATSAPP_ACCESS_TOKEN", "META_ACCESS_TOKEN");
  const cloudNumber = configured("WHATSAPP_CLOUD_PHONE_NUMBER_ID", "META_WHATSAPP_PHONE_NUMBER_ID", "META_PHONE_NUMBER_ID");
  if (cloudToken && cloudNumber) {
    const response = await fetch(`https://graph.facebook.com/v20.0/${cloudNumber}/messages`, {
      method: "POST", headers: { Authorization: `Bearer ${cloudToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: content } }),
    });
    return { sent: response.ok, provider: "whatsapp-cloud", reason: response.ok ? undefined : "WhatsApp Cloud API rejected the message." };
  }
  const metaEndpoint = configured("META_WHATSAPP_API_URL", "WHATSAPP_CLOUD_API_URL");
  const metaToken = configured("META_WHATSAPP_TOKEN", "WHATSAPP_CLOUD_TOKEN");
  if (metaEndpoint && metaToken) {
    const response = await fetch(metaEndpoint, {
      method: "POST", headers: { Authorization: `Bearer ${metaToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: content } }),
    });
    return { sent: response.ok, provider: "meta-compatible-whatsapp", reason: response.ok ? undefined : "Meta-compatible WhatsApp API rejected the message." };
  }
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM) {
    const response = await formPost(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`, {
      Authorization: `Basic ${Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
    }, { To: `whatsapp:${to}`, From: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`, Body: content });
    return { sent: response.ok, provider: "twilio-whatsapp", reason: response.ok ? undefined : "Twilio WhatsApp rejected the message." };
  }
  return { sent: false, provider: "none", reason: "No WhatsApp provider is configured." };
}

export async function deliverMessage(input: {
  channel: DeliveryChannel; recipient: string; subject?: string | null; content: string;
  fallbackToSms?: boolean; smsRecipient?: string | null;
}): Promise<ProviderResult> {
  try {
    if (input.channel === "SMS") return await sendSms(input.recipient, input.content);
    if (input.channel === "WhatsApp") {
      const whatsapp = await sendWhatsApp(input.recipient, input.content);
      if (!whatsapp.sent && input.fallbackToSms && input.smsRecipient) {
        const sms = await sendSms(input.smsRecipient, input.content);
        return sms.sent ? { ...sms, provider: `${whatsapp.provider}->${sms.provider}`, fallback: true } : { sent: false, provider: whatsapp.provider, reason: `${whatsapp.reason} SMS fallback failed: ${sms.reason}` };
      }
      return whatsapp;
    }
    const resendKey = configured("RESEND_API_KEY");
    if (resendKey && process.env.RESEND_FROM_EMAIL) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL, to: [input.recipient], subject: input.subject || "Message", text: input.content }),
      });
      return { sent: response.ok, provider: "resend", reason: response.ok ? undefined : "Resend rejected the email." };
    }
    return { sent: false, provider: "none", reason: "No email provider is configured." };
  } catch (error) {
    return { sent: false, provider: input.channel.toLowerCase(), reason: error instanceof Error ? error.message : "Provider request failed." };
  }
}
