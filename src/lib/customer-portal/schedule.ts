export interface PortalScheduleSettings {
  isEnabled: boolean;
  scheduleEnabled: boolean;
  activeFrom: string;
  activeUntil: string;
  scheduleTimezone: string;
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  return hours * 60 + minutes;
}

export function isPortalActive(settings: PortalScheduleSettings, now = new Date()): boolean {
  if (!settings.isEnabled) return false;
  if (!settings.scheduleEnabled) return true;

  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: settings.scheduleTimezone || "UTC",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
  } catch {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
  }

  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  const current = hour * 60 + minute;
  const start = timeToMinutes(settings.activeFrom);
  const end = timeToMinutes(settings.activeUntil);

  if (start === end) return true;
  if (start < end) return current >= start && current < end;
  return current >= start || current < end;
}
