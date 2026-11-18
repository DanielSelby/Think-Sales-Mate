export type EducationCampusAttendanceStatus = "present" | "absent" | "late" | "excused";

export interface EducationCampusComparisonInput {
  campuses: readonly { id: string; name: string }[];
  applications: readonly { branch_id: string }[] | null;
  attendance: readonly { branch_id: string; status: EducationCampusAttendanceStatus }[] | null;
  enrollments: readonly { branch_id: string }[] | null;
  outcomes: readonly { branch_id: string; score: number; maximum_score: number }[] | null;
  expenses: readonly { branch_id: string; amount: number }[] | null;
  feeCollections: readonly { branch_id: string; amount: number }[] | null;
}

export interface EducationCampusComparisonRow {
  branch_id: string;
  campus: string;
  application_count: number | null;
  attendance_rate: number | null;
  active_enrollment_count: number | null;
  average_outcome_percentage: number | null;
  approved_expense_total: number | null;
  fee_payment_count: number | null;
  fee_collection_total: number | null;
}

export function summarizeEducationCampusComparison(
  input: EducationCampusComparisonInput,
): EducationCampusComparisonRow[] {
  const rows = input.campuses.map((campus) => {
    const campusApplications = input.applications?.filter((row) => row.branch_id === campus.id);
    const campusAttendance = input.attendance?.filter((row) => row.branch_id === campus.id);
    const attendanceEligible = campusAttendance?.filter((row) => row.status !== "excused") ?? [];
    const attendancePresent = attendanceEligible.filter((row) => row.status === "present" || row.status === "late").length;
    const campusEnrollments = input.enrollments?.filter((row) => row.branch_id === campus.id);
    const campusOutcomes = input.outcomes?.filter((row) =>
      row.branch_id === campus.id && row.maximum_score > 0
    );
    const campusExpenses = input.expenses?.filter((row) => row.branch_id === campus.id);
    const campusFeeCollections = input.feeCollections?.filter((row) => row.branch_id === campus.id);

    return {
      branch_id: campus.id,
      campus: campus.name,
      application_count: campusApplications === undefined ? null : campusApplications.length,
      attendance_rate: attendanceEligible?.length
        ? Math.round((attendancePresent / attendanceEligible.length) * 10000) / 100
        : null,
      active_enrollment_count: campusEnrollments === undefined ? null : campusEnrollments.length,
      average_outcome_percentage: campusOutcomes?.length
        ? Math.round(
          campusOutcomes.reduce((total, result) => total + (result.score / result.maximum_score) * 100, 0)
          / campusOutcomes.length * 100,
        ) / 100
        : null,
      approved_expense_total: campusExpenses === undefined
        ? null
        : campusExpenses.reduce((totalCents, expense) => totalCents + Math.round(expense.amount * 100), 0) / 100,
      fee_payment_count: campusFeeCollections === undefined ? null : campusFeeCollections.length,
      fee_collection_total: campusFeeCollections === undefined
        ? null
        : campusFeeCollections.reduce(
          (totalCents, payment) => totalCents + Math.round(payment.amount * 100),
          0,
        ) / 100,
    };
  });

  return rows.sort((left, right) => left.campus.localeCompare(right.campus));
}
