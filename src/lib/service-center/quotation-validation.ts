export type ServiceQuotationLineInput = {
  description: string;
  quantity: number;
  unit_price: number;
};

type QuotationLineResult =
  | { ok: true; items: ServiceQuotationLineInput[] }
  | { ok: false; error: string };

function decimalValue(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseServiceQuotationLines(
  descriptions: unknown[],
  quantities: unknown[],
  unitPrices: unknown[],
): QuotationLineResult {
  if (descriptions.length !== quantities.length || descriptions.length !== unitPrices.length) {
    return { ok: false, error: "Quotation line items are incomplete. Please review the estimate." };
  }

  const items: ServiceQuotationLineInput[] = [];
  for (let index = 0; index < descriptions.length; index += 1) {
    const descriptionValue = descriptions[index];
    const quantityValue = quantities[index];
    const unitPriceValue = unitPrices[index];
    const description = typeof descriptionValue === "string" ? descriptionValue.trim() : "";
    const quantityText = typeof quantityValue === "string" ? quantityValue.trim() : "";
    const unitPriceText = typeof unitPriceValue === "string" ? unitPriceValue.trim() : "";
    if (!description && !quantityText && !unitPriceText) continue;

    const quantity = decimalValue(quantityText);
    const unitPrice = decimalValue(unitPriceText);
    if (!description || description.length > 200) {
      return { ok: false, error: `Enter a description of up to 200 characters for line ${index + 1}.` };
    }
    if (quantity === null || quantity <= 0 || quantity > 10000) {
      return { ok: false, error: `Enter a quantity greater than 0 and no more than 10,000 for line ${index + 1}.` };
    }
    if (unitPrice === null || unitPrice > 100000000) {
      return { ok: false, error: `Enter a price from 0 to 100,000,000 for line ${index + 1}.` };
    }
    items.push({ description, quantity, unit_price: unitPrice });
  }

  if (items.length === 0) return { ok: false, error: "Add at least one estimate line item." };
  if (items.length > 50) return { ok: false, error: "An estimate can have no more than 50 line items." };
  return { ok: true, items };
}
