export type EducationFeePaymentMethod =
  | "cash"
  | "mobile_money"
  | "bank_transfer"
  | "card"
  | "cheque"
  | "other";

export interface EducationFeeCollectionRecord {
  branch_id: string;
  payment_method: EducationFeePaymentMethod;
  amount: number;
}

export interface EducationFeeCollectionSummary {
  branch_id: string;
  payment_method: EducationFeePaymentMethod;
  payment_count: number;
  total_collected: number;
}

export function summarizeEducationFeeCollections(
  records: readonly EducationFeeCollectionRecord[],
): EducationFeeCollectionSummary[] {
  const grouped = new Map<string, EducationFeeCollectionSummary & { total_cents: number }>();
  for (const record of records) {
    const key = `${record.branch_id}\u0000${record.payment_method}`;
    const totalCents = Math.round(record.amount * 100);
    const summary = grouped.get(key);
    if (summary) {
      summary.payment_count += 1;
      summary.total_cents += totalCents;
    } else {
      grouped.set(key, {
        branch_id: record.branch_id,
        payment_method: record.payment_method,
        payment_count: 1,
        total_collected: totalCents / 100,
        total_cents: totalCents,
      });
    }
  }
  return Array.from(grouped.values(), ({ total_cents, ...summary }) => ({
    ...summary,
    total_collected: total_cents / 100,
  })).sort((left, right) =>
    left.branch_id.localeCompare(right.branch_id)
    || left.payment_method.localeCompare(right.payment_method),
  );
}
