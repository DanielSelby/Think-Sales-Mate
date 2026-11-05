type QuotationMessageInput = {
  customerName: string;
  jobNumber: string;
  version: number;
  currency: string;
  items: Array<{ description: string; quantity: number; line_total: number }>;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  notes: string | null;
};

export function buildServiceQuotationMessage(input: QuotationMessageInput) {
  const itemSummary = input.items.map((item) =>
    `${item.description} x ${item.quantity}: ${input.currency} ${item.line_total.toFixed(2)}`
  ).join("\n");
  return [
    `Hello ${input.customerName},`,
    `Repair estimate for job ${input.jobNumber} (version ${input.version}):`,
    itemSummary,
    `Subtotal: ${input.currency} ${input.subtotal.toFixed(2)}`,
    `Tax (${input.taxRate}%): ${input.currency} ${input.taxAmount.toFixed(2)}`,
    `Total: ${input.currency} ${input.total.toFixed(2)}`,
    input.notes ? `Notes: ${input.notes}` : null,
    "Please contact our service team to approve or discuss this estimate.",
  ].filter((line): line is string => line !== null).join("\n");
}
