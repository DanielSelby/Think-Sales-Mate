export const EDUCATION_STUDENT_STATUSES = [
  "active",
  "on_hold",
  "graduated",
  "transferred",
  "withdrawn",
  "archived",
] as const;

export type EducationStudentStatus = typeof EDUCATION_STUDENT_STATUSES[number];
export type EducationStudentDirectoryStatus = EducationStudentStatus | "all";

export type EducationStudentDirectoryRow = {
  id: string;
  student_number: string;
  first_name: string;
  last_name: string;
  other_names: string | null;
  branch_id: string;
  status: EducationStudentStatus;
  created_at: string;
  photo_path: string | null;
  gender: string | null;
  class_names: string[];
};

export type EducationStudentDirectoryResult = {
  students: EducationStudentDirectoryRow[];
  statusCounts: Record<EducationStudentStatus, number>;
  totalCount: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isStudentStatus(value: unknown): value is EducationStudentStatus {
  return typeof value === "string" && EDUCATION_STUDENT_STATUSES.some((status) => status === value);
}

function parseStudentRow(value: unknown): EducationStudentDirectoryRow {
  if (
    !isRecord(value)
    || typeof value.id !== "string"
    || typeof value.student_number !== "string"
    || typeof value.first_name !== "string"
    || typeof value.last_name !== "string"
    || (value.other_names !== null && typeof value.other_names !== "string")
    || typeof value.branch_id !== "string"
    || !isStudentStatus(value.status)
    || typeof value.created_at !== "string"
    || (value.photo_path !== null && typeof value.photo_path !== "string")
    || (value.gender !== null && typeof value.gender !== "string")
    || !isStringArray(value.class_names)
  ) {
    throw new Error("The student directory returned an invalid student record.");
  }

  return {
    id: value.id,
    student_number: value.student_number,
    first_name: value.first_name,
    last_name: value.last_name,
    other_names: value.other_names,
    branch_id: value.branch_id,
    status: value.status,
    created_at: value.created_at,
    photo_path: value.photo_path,
    gender: value.gender,
    class_names: value.class_names,
  };
}

function parseCount(value: unknown, label: string): number {
  const count = typeof value === "number" || typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`The student directory returned an invalid ${label}.`);
  }
  return count;
}

export function parseEducationStudentDirectoryResult(value: unknown): EducationStudentDirectoryResult {
  if (!isRecord(value) || !Array.isArray(value.student_rows) || !isRecord(value.status_counts)) {
    throw new Error("The student directory returned an invalid response.");
  }

  const rawStatusCounts = value.status_counts;
  const statusCounts = Object.fromEntries(EDUCATION_STUDENT_STATUSES.map((status) => {
    if (!(status in rawStatusCounts)) {
      throw new Error("The student directory returned incomplete status counts.");
    }
    return [status, parseCount(rawStatusCounts[status], "status count")];
  })) as Record<EducationStudentStatus, number>;

  return {
    students: value.student_rows.map(parseStudentRow),
    statusCounts,
    totalCount: parseCount(value.total_count, "total count"),
  };
}
