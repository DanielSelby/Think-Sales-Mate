export function registrationEmailKey(eventId: string, organizationId: string, recipient: string) {
  return `${eventId}:${organizationId}:${recipient.trim().toLowerCase()}`;
}
