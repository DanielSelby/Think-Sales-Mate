export type EducationSubject = {
  id: string;
  name: string;
  status: "active" | "inactive";
};

export function isValidEducationSubjectName(name: string) {
  return name.length > 0 && name.length <= 120 && name.trim().length > 0;
}

export function getActiveEducationSubject(subjects: EducationSubject[], subjectId: string) {
  return subjects.find((subject) => subject.id === subjectId && subject.status === "active") ?? null;
}
