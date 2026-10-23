const DEFAULT_MESSAGE = "Hello, I have a question about your products.";

export function buildWhatsAppChatUrl(phoneNumber: string | null, message: string | null) {
  const digits = phoneNumber?.replace(/\D/g, "");
  if (!digits || !/^[1-9]\d{7,14}$/.test(digits)) return null;

  const chatMessage = message?.trim() || DEFAULT_MESSAGE;
  return `https://wa.me/${digits}?text=${encodeURIComponent(chatMessage)}`;
}
