export type EducationEnrollmentStatus = "active" | "completed" | "withdrawn" | "transferred";

export interface EducationEnrollmentRecord {
  branch_id: string;
  academic_year_id: string;
  class_id: string;
  status: EducationEnrollmentStatus;
}

export interface EducationEnrollmentSummary extends EducationEnrollmentRecord {
  enrollment_count: number;
}

export function summarizeEducationEnrollments(
  records: readonly EducationEnrollmentRecord[],
): EducationEnrollmentSummary[] {
  const grouped = new Map<string, EducationEnrollmentSummary>();
  for (const record of records) {
    const key = `${record.branch_id}\u0000${record.academic_year_id}\u0000${record.class_id}\u0000${record.status}`;
    const summary = grouped.get(key);
    if (summary) {
      summary.enrollment_count += 1;
    } else {
      grouped.set(key, { ...record, enrollment_count: 1 });
    }
  }
  return Array.from(grouped.values()).sort((left, right) =>
    left.branch_id.localeCompare(right.branch_id)
    || left.academic_year_id.localeCompare(right.academic_year_id)
    || left.class_id.localeCompare(right.class_id)
    || left.status.localeCompare(right.status),
  );
}
