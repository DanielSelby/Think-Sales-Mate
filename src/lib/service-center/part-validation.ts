export type ServiceJobPartInput = {
  product_id: string;
  quantity: number;
};

type PartInputResult =
  | { ok: true; items: ServiceJobPartInput[] }
  | { ok: false; error: string };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseServiceJobParts(productValues: unknown[], quantityValues: unknown[]): PartInputResult {
  if (productValues.length !== quantityValues.length || productValues.length > 50) {
    return { ok: false, error: "Parts list is invalid. Review the selected parts and try again." };
  }

  const quantitiesByProduct = new Map<string, number>();
  for (let index = 0; index < productValues.length; index += 1) {
    const rawProductId = productValues[index];
    const rawQuantity = quantityValues[index];
    const productId = typeof rawProductId === "string" ? rawProductId.trim() : "";
    const quantityText = typeof rawQuantity === "string" ? rawQuantity.trim() : "";
    if (!productId && !quantityText) continue;
    if (!uuidPattern.test(productId)) {
      return { ok: false, error: `Select a valid inventory product for line ${index + 1}.` };
    }
    if (!/^\d+$/.test(quantityText)) {
      return { ok: false, error: `Enter a whole number of parts for line ${index + 1}.` };
    }
    const quantity = Number(quantityText);
    if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 10000) {
      return { ok: false, error: `Part quantity must be between 1 and 10,000 for line ${index + 1}.` };
    }
    const combined = (quantitiesByProduct.get(productId) ?? 0) + quantity;
    if (combined > 10000) {
      return { ok: false, error: "The combined quantity for a product cannot exceed 10,000." };
    }
    quantitiesByProduct.set(productId, combined);
  }

  if (quantitiesByProduct.size === 0) return { ok: false, error: "Select at least one part to issue." };
  return {
    ok: true,
    items: Array.from(quantitiesByProduct, ([product_id, quantity]) => ({ product_id, quantity })),
  };
}
