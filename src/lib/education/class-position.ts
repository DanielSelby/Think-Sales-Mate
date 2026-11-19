export type EducationClassResultScore = {
  student_id: string;
  subject_name: string;
  score: number;
  maximum_score: number;
};

export function calculateEducationClassPosition(
  results: EducationClassResultScore[],
  studentId: string,
): { position: number; cohortSize: number } | null {
  const scoresByStudent = new Map<string, Map<string, { score: number; maximumScore: number }>>();
  for (const result of results) {
    const subjects = scoresByStudent.get(result.student_id) ?? new Map();
    subjects.set(result.subject_name, {
      score: result.score,
      maximumScore: result.maximum_score,
    });
    scoresByStudent.set(result.student_id, subjects);
  }

  const studentScores = scoresByStudent.get(studentId);
  if (!studentScores?.size) return null;
  const studentSubjects = [...studentScores.keys()].sort();
  const cohort = [...scoresByStudent.entries()].flatMap(([candidateId, subjects]) => {
    const candidateSubjects = [...subjects.keys()].sort();
    if (candidateSubjects.length !== studentSubjects.length
      || candidateSubjects.some((subject, index) => subject !== studentSubjects[index])) return [];
    const totals = [...subjects.values()].reduce(
      (total, result) => ({ score: total.score + result.score, maximum: total.maximum + result.maximumScore }),
      { score: 0, maximum: 0 },
    );
    return totals.maximum > 0 ? [{ studentId: candidateId, percentage: totals.score / totals.maximum }] : [];
  });
  const studentResult = cohort.find((candidate) => candidate.studentId === studentId);
  if (!studentResult || cohort.length < 2) return null;

  return {
    position: 1 + cohort.filter((candidate) => candidate.percentage > studentResult.percentage + Number.EPSILON).length,
    cohortSize: cohort.length,
  };
}
