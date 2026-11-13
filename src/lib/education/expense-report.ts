export type EducationExpenseApprovalStatus = "pending_approval" | "approved" | "rejected";
export type EducationExpensePaymentStatus = "unpaid" | "paid";

export interface EducationExpenseReportRecord {
  branch_id: string;
  category: string;
  status: EducationExpenseApprovalStatus;
  payment_status: EducationExpensePaymentStatus;
  amount: number;
}

export interface EducationExpenseReportSummary {
  branch_id: string;
  category: string;
  status: EducationExpenseApprovalStatus;
  payment_status: EducationExpensePaymentStatus;
  expense_count: number;
  total_amount: number;
}

export function summarizeEducationExpenses(
  records: readonly EducationExpenseReportRecord[],
): EducationExpenseReportSummary[] {
  const grouped = new Map<string, EducationExpenseReportSummary & { total_cents: number }>();
  for (const record of records) {
    const key = `${record.branch_id}\u0000${record.category}\u0000${record.status}\u0000${record.payment_status}`;
    const summary = grouped.get(key);
    if (summary) {
      summary.expense_count += 1;
      summary.total_cents += Math.round(record.amount * 100);
    } else {
      const totalCents = Math.round(record.amount * 100);
      grouped.set(key, {
        branch_id: record.branch_id,
        category: record.category,
        status: record.status,
        payment_status: record.payment_status,
        expense_count: 1,
        total_amount: totalCents / 100,
        total_cents: totalCents,
      });
    }
  }
  return Array.from(grouped.values(), ({ total_cents, ...summary }) => ({
    ...summary,
    total_amount: total_cents / 100,
  })).sort((left, right) =>
    left.branch_id.localeCompare(right.branch_id)
    || left.category.localeCompare(right.category)
    || left.status.localeCompare(right.status)
    || left.payment_status.localeCompare(right.payment_status),
  );
}
