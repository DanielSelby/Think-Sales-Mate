export type GoogleClassroomRosterEntry = {
  userId: string;
  emailAddress?: string;
  fullName: string;
};

export type GoogleClassroomCandidateStudent = {
  id: string;
  email: string | null;
  first_name: string;
  last_name: string;
  student_number: string;
  status: string;
};

export type GoogleClassroomRosterPreview = {
  matched: Array<{
    googleUserId: string;
    googleName: string;
    email: string;
    studentId: string;
    studentName: string;
    studentNumber: string;
  }>;
  unmatched: Array<{ googleUserId: string; googleName: string; email: string | null }>;
  ambiguous: Array<{ googleUserId: string; googleName: string; email: string }>;
};

export function normalizeEducationEmail(email: string | null | undefined): string | null {
  const normalized = email?.trim().toLocaleLowerCase("en-US") ?? "";
  return normalized && normalized.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
    ? normalized
    : null;
}

export function previewGoogleClassroomRoster(
  roster: GoogleClassroomRosterEntry[],
  students: GoogleClassroomCandidateStudent[],
): GoogleClassroomRosterPreview {
  const studentsByEmail = new Map<string, GoogleClassroomCandidateStudent[]>();
  for (const student of students) {
    if (student.status !== "active") continue;
    const email = normalizeEducationEmail(student.email);
    if (!email) continue;
    const matches = studentsByEmail.get(email) ?? [];
    matches.push(student);
    studentsByEmail.set(email, matches);
  }

  const rosterEmailCounts = new Map<string, number>();
  for (const person of roster) {
    const email = normalizeEducationEmail(person.emailAddress);
    if (email) rosterEmailCounts.set(email, (rosterEmailCounts.get(email) ?? 0) + 1);
  }

  const preview: GoogleClassroomRosterPreview = { matched: [], unmatched: [], ambiguous: [] };
  for (const person of roster) {
    const email = normalizeEducationEmail(person.emailAddress);
    if (!email) {
      preview.unmatched.push({ googleUserId: person.userId, googleName: person.fullName, email: null });
      continue;
    }

    const candidates = studentsByEmail.get(email) ?? [];
    if (candidates.length > 1 || (rosterEmailCounts.get(email) ?? 0) > 1) {
      preview.ambiguous.push({ googleUserId: person.userId, googleName: person.fullName, email });
      continue;
    }
    const student = candidates[0];
    if (!student) {
      preview.unmatched.push({ googleUserId: person.userId, googleName: person.fullName, email });
      continue;
    }
    preview.matched.push({
      googleUserId: person.userId,
      googleName: person.fullName,
      email,
      studentId: student.id,
      studentName: [student.first_name, student.last_name].filter(Boolean).join(" "),
      studentNumber: student.student_number,
    });
  }
  return preview;
}

export function parseGoogleEducationEncryptionKey(value: string | undefined): Buffer {
  if (!value) {
    throw new Error("GOOGLE_EDUCATION_TOKEN_ENCRYPTION_KEY is not configured. Configure a base64-encoded 32-byte key.");
  }
  const key = Buffer.from(value, "base64");
  if (key.length !== 32 || key.toString("base64").replace(/=+$/, "") !== value.trim().replace(/=+$/, "")) {
    throw new Error("GOOGLE_EDUCATION_TOKEN_ENCRYPTION_KEY must be base64-encoded 32 bytes.");
  }
  return key;
}
