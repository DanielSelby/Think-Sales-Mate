export type EducationLibraryCirculationStatus = "open" | "overdue" | "returned";

export interface EducationLibraryLoanRecord {
  branch_id: string;
  due_on: string;
  returned_on: string | null;
}

export interface EducationLibraryCirculationSummary {
  branch_id: string;
  status: EducationLibraryCirculationStatus;
  loan_count: number;
}

export function getEducationLibraryCirculationStatus(
  loan: EducationLibraryLoanRecord,
  today: string,
): EducationLibraryCirculationStatus {
  if (loan.returned_on !== null) return "returned";
  return loan.due_on < today ? "overdue" : "open";
}

export function summarizeEducationLibraryCirculation(
  records: readonly EducationLibraryLoanRecord[],
  today: string,
): EducationLibraryCirculationSummary[] {
  const grouped = new Map<string, EducationLibraryCirculationSummary>();
  for (const record of records) {
    const status = getEducationLibraryCirculationStatus(record, today);
    const key = `${record.branch_id}\u0000${status}`;
    const summary = grouped.get(key);
    if (summary) {
      summary.loan_count += 1;
    } else {
      grouped.set(key, { branch_id: record.branch_id, status, loan_count: 1 });
    }
  }
  return Array.from(grouped.values()).sort((left, right) =>
    left.branch_id.localeCompare(right.branch_id) || left.status.localeCompare(right.status),
  );
}
