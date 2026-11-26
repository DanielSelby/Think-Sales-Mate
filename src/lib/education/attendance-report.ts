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

export type EducationAttendanceReportRow = {
  attendance_id: string;
  student_id: string;
  student_number: string;
  first_name: string;
  other_names: string | null;
  last_name: string;
  branch_id: string;
  attendance_date: string;
  status: EducationAttendanceStatus;
  note: string | null;
};

export type EducationAttendanceReportResult = {
  rows: EducationAttendanceReportRow[];
  statusCounts: Record<EducationAttendanceStatus, number>;
  totalCount: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function isAttendanceStatus(value: unknown): value is EducationAttendanceStatus {
  return value === "present" || value === "absent" || value === "late" || value === "excused";
}

function parseAttendanceRow(value: unknown): EducationAttendanceReportRow {
  if (
    !isRecord(value)
    || typeof value.attendance_id !== "string"
    || typeof value.student_id !== "string"
    || typeof value.student_number !== "string"
    || typeof value.first_name !== "string"
    || (value.other_names !== null && typeof value.other_names !== "string")
    || typeof value.last_name !== "string"
    || typeof value.branch_id !== "string"
    || typeof value.attendance_date !== "string"
    || !isAttendanceStatus(value.status)
    || (value.note !== null && typeof value.note !== "string")
  ) {
    throw new Error("The attendance report returned an invalid attendance record.");
  }

  return {
    attendance_id: value.attendance_id,
    student_id: value.student_id,
    student_number: value.student_number,
    first_name: value.first_name,
    other_names: value.other_names,
    last_name: value.last_name,
    branch_id: value.branch_id,
    attendance_date: value.attendance_date,
    status: value.status,
    note: value.note,
  };
}

function parseReportCount(value: unknown, label: string): number {
  const count = typeof value === "number" || typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`The attendance report returned an invalid ${label}.`);
  }
  return count;
}

export function parseEducationAttendanceReportResult(value: unknown): EducationAttendanceReportResult {
  if (!isRecord(value) || !Array.isArray(value.attendance_rows) || !isRecord(value.status_counts)) {
    throw new Error("The attendance report returned an invalid response.");
  }

  const statuses: EducationAttendanceStatus[] = ["present", "absent", "late", "excused"];
  const rawStatusCounts = value.status_counts;
  const statusCounts = Object.fromEntries(statuses.map((status) => {
    if (!(status in rawStatusCounts)) {
      throw new Error("The attendance report returned incomplete status counts.");
    }
    return [status, parseReportCount(rawStatusCounts[status], "status count")];
  })) as Record<EducationAttendanceStatus, number>;

  return {
    rows: value.attendance_rows.map(parseAttendanceRow),
    statusCounts,
    totalCount: parseReportCount(value.total_count, "total count"),
  };
}
