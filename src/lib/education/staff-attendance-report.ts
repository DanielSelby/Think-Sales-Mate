export const EDUCATION_STAFF_ATTENDANCE_STATUSES = ["present", "absent", "late", "excused"] as const;
export type EducationStaffAttendanceStatus = typeof EDUCATION_STAFF_ATTENDANCE_STATUSES[number];

export interface EducationStaffAttendanceRecord {
  branch_id: string;
  staff_id: string;
  status: EducationStaffAttendanceStatus;
}

export interface EducationStaffAttendanceSummary {
  branch_id: string;
  staff_id: string;
  present_count: number;
  absent_count: number;
  late_count: number;
  excused_count: number;
  total_records: number;
}

export function summarizeEducationStaffAttendance(
  records: readonly EducationStaffAttendanceRecord[],
): EducationStaffAttendanceSummary[] {
  const grouped = new Map<string, EducationStaffAttendanceSummary>();
  for (const record of records) {
    const key = `${record.branch_id}\u0000${record.staff_id}`;
    let summary = grouped.get(key);
    if (!summary) {
      summary = {
        branch_id: record.branch_id,
        staff_id: record.staff_id,
        present_count: 0,
        absent_count: 0,
        late_count: 0,
        excused_count: 0,
        total_records: 0,
      };
      grouped.set(key, summary);
    }

    switch (record.status) {
      case "present":
        summary.present_count += 1;
        break;
      case "absent":
        summary.absent_count += 1;
        break;
      case "late":
        summary.late_count += 1;
        break;
      case "excused":
        summary.excused_count += 1;
        break;
    }
    summary.total_records += 1;
  }

  return Array.from(grouped.values()).sort((left, right) =>
    left.branch_id.localeCompare(right.branch_id) || left.staff_id.localeCompare(right.staff_id),
  );
}
