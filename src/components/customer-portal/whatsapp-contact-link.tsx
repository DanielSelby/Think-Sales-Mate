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
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5 shrink-0"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M20.5 11.7a8.4 8.4 0 0 1-12.4 7.4L3 20.5l1.5-4.9A8.4 8.4 0 1 1 20.5 11.7Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M8.3 7.7c.2-.4.5-.4.8-.4h.5c.2 0 .4.1.5.4l.8 1.8c.1.2.1.4-.1.6l-.6.7c-.2.2-.2.4-.1.6.5.9 1.3 1.7 2.2 2.2.2.1.4.1.6-.1l.7-.6c.2-.2.4-.2.6-.1l1.8.8c.3.1.4.3.4.5v.5c0 .3 0 .6-.4.8-.5.3-1.3.5-2 .3-1.1-.3-2.4-1-3.7-2.3s-2-2.6-2.3-3.7c-.2-.7 0-1.5.3-2Z"
          fill="currentColor"
        />
      </svg>
      <span>{label}</span>
    </a>
  );
}
