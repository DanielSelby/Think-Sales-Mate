export function findDuplicateEducationStudentNumberRows(
  rows: Array<Record<string, string>>,
): Set<number> {
  const seen = new Set<string>();
  const duplicates = new Set<number>();

  rows.forEach((row, index) => {
    const rawNumber = row && typeof row.student_number === "string" ? row.student_number : "";
    const number = rawNumber.trim().toLowerCase();
    if (!number) return;
    if (seen.has(number)) {
      duplicates.add(index);
      return;
    }
    seen.add(number);
  });

  return duplicates;
}
