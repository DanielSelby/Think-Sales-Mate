export type OrganizationExpiryStatus = {
  expired: boolean;
  daysRemaining: number | null;
};

export function isValidOrganizationExpiryDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsedDate = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === value;
}

function utcDateValue(date: Date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function getOrganizationExpiryStatus(
  expiryDate: string | null,
  now: Date = new Date(),
): OrganizationExpiryStatus {
  if (expiryDate === null) return { expired: false, daysRemaining: null };
  if (!isValidOrganizationExpiryDate(expiryDate)) {
    throw new Error("Organization access expiry date is invalid.");
  }
  const parsedExpiry = new Date(`${expiryDate}T00:00:00.000Z`);
  const daysRemaining = Math.floor((utcDateValue(parsedExpiry) - utcDateValue(now)) / 86_400_000);
  return { expired: daysRemaining < 0, daysRemaining };
}

export function formatOrganizationExpiryDate(expiryDate: string) {
  if (!isValidOrganizationExpiryDate(expiryDate)) {
    throw new Error("Organization access expiry date is invalid.");
  }
  const parsedExpiry = new Date(`${expiryDate}T00:00:00.000Z`);
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(parsedExpiry);
}
