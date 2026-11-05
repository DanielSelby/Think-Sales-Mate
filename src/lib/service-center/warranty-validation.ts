export type ServiceAssetWarranty = {
  warranty_provider: string | null;
  warranty_reference: string | null;
  warranty_start_date: string | null;
  warranty_end_date: string | null;
  warranty_terms: string | null;
};

type WarrantyResult =
  | { ok: true; warranty: ServiceAssetWarranty }
  | { ok: false; error: string };

function formString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseServiceAssetWarranty(values: {
  provider: unknown;
  reference: unknown;
  startDate: unknown;
  endDate: unknown;
  terms: unknown;
}): WarrantyResult {
  const provider = formString(values.provider);
  const reference = formString(values.reference);
  const startDate = formString(values.startDate);
  const endDate = formString(values.endDate);
  const terms = formString(values.terms);

  if (provider.length > 120 || reference.length > 120 || terms.length > 1000) {
    return { ok: false, error: "Warranty provider/reference must be 120 characters or fewer and terms 1,000 characters or fewer." };
  }
  if (Boolean(startDate) !== Boolean(endDate)) {
    return { ok: false, error: "Enter both warranty coverage dates, or leave both blank." };
  }
  if ((startDate && !isDateOnly(startDate)) || (endDate && !isDateOnly(endDate))) {
    return { ok: false, error: "Enter valid warranty coverage dates." };
  }
  if (startDate && endDate && startDate > endDate) {
    return { ok: false, error: "Warranty end date cannot be before its start date." };
  }

  return {
    ok: true,
    warranty: {
      warranty_provider: provider || null,
      warranty_reference: reference || null,
      warranty_start_date: startDate || null,
      warranty_end_date: endDate || null,
      warranty_terms: terms || null,
    },
  };
}

export function getServiceAssetWarrantyStatus(
  startDate: string | null,
  endDate: string | null,
  today = new Date().toISOString().slice(0, 10),
): "not_recorded" | "upcoming" | "active" | "expired" {
  if (!startDate || !endDate) return "not_recorded";
  if (today < startDate) return "upcoming";
  if (today > endDate) return "expired";
  return "active";
}
