type DueDateResult =
  | { ok: true; dueDate: string }
  | { ok: false; error: string };

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseServiceInvoiceDueDate(value: unknown, today = new Date().toISOString().slice(0, 10)): DueDateResult {
  const dueDate = typeof value === "string" ? value.trim() : "";
  if (!isValidDate(dueDate)) return { ok: false, error: "Enter a valid invoice due date." };
  if (!isValidDate(today) || dueDate < today) {
    return { ok: false, error: "Invoice due date cannot be in the past." };
  }
  return { ok: true, dueDate };
}
