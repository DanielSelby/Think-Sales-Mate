export type EducationAttendanceStatus = "present" | "absent" | "late" | "excused";

export interface EducationAttendanceReportRecord {
  branch_id: string;
  class_id: string | null;
  status: EducationAttendanceStatus;
}

export interface EducationAttendanceReportSummary extends EducationAttendanceReportRecord {
  record_count: number;
}

export function summarizeEducationAttendance(
  records: readonly EducationAttendanceReportRecord[],
): EducationAttendanceReportSummary[] {
  const grouped = new Map<string, EducationAttendanceReportSummary>();
  for (const record of records) {
    const key = `${record.branch_id}\u0000${record.class_id ?? ""}\u0000${record.status}`;
    const summary = grouped.get(key);
    if (summary) {
      summary.record_count += 1;
    } else {
      grouped.set(key, { ...record, record_count: 1 });
    }
  }
  return Array.from(grouped.values()).sort((left, right) =>
    left.branch_id.localeCompare(right.branch_id)
    || (left.class_id ?? "").localeCompare(right.class_id ?? "")
    || left.status.localeCompare(right.status),
  );
}
