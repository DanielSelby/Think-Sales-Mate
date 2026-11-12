export interface EducationOutcomeRecord {
  branch_id: string;
  subject_name: string;
  score: number;
  maximum_score: number;
  grade: string | null;
}

export interface EducationOutcomeSummary {
  branch_id: string;
  subject_name: string;
  result_count: number;
  average_percentage: number;
  grade_counts: Record<string, number>;
}

export function summarizeEducationOutcomes(records: readonly EducationOutcomeRecord[]): EducationOutcomeSummary[] {
  const grouped = new Map<string, {
    branch_id: string;
    subject_name: string;
    percentage_total: number;
    result_count: number;
    grade_counts: Map<string, number>;
  }>();

  for (const record of records) {
    const key = `${record.branch_id}\u0000${record.subject_name}`;
    let group = grouped.get(key);
    if (!group) {
      group = {
        branch_id: record.branch_id,
        subject_name: record.subject_name,
        percentage_total: 0,
        result_count: 0,
        grade_counts: new Map(),
      };
      grouped.set(key, group);
    }

    group.percentage_total += (record.score / record.maximum_score) * 100;
    group.result_count += 1;
    const grade = record.grade?.trim() || "Ungraded";
    group.grade_counts.set(grade, (group.grade_counts.get(grade) ?? 0) + 1);
  }

  return Array.from(grouped.values(), (group) => ({
    branch_id: group.branch_id,
    subject_name: group.subject_name,
    result_count: group.result_count,
    average_percentage: Math.round((group.percentage_total / group.result_count) * 10) / 10,
    grade_counts: Object.fromEntries(
      Array.from(group.grade_counts.entries()).sort(([left], [right]) => left.localeCompare(right)),
    ),
  })).sort((left, right) =>
    left.branch_id.localeCompare(right.branch_id) || left.subject_name.localeCompare(right.subject_name),
  );
}
