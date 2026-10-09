export function addDaysToIsoDate(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || !Number.isInteger(days) || days < 0) return date;
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function formatInvoiceDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString("en-GB", { timeZone: "UTC" });
}
