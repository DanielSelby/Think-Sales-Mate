import { MessageCircle } from "lucide-react";
import { buildWhatsAppChatUrl } from "@/lib/customer-portal/whatsapp-chat-url";

export function WhatsAppContactLink({
  phoneNumber,
  message,
  className,
  label = "Chat on WhatsApp",
}: {
  phoneNumber: string | null;
  message: string | null;
  className: string;
  label?: string;
}) {
  const href = buildWhatsAppChatUrl(phoneNumber, message);
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${label}, opens in a new tab`}
      className={className}
    >
      <MessageCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </a>
  );
}
