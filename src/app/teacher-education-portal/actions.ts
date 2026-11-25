"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  educationCreateAssignmentSchema,
  educationGradeAssignmentSchema,
  educationRequestAssignmentRevisionSchema,
} from "@/lib/education/assignments";

const PORTAL_PATH = "/teacher-education-portal";

function formString(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function createEducationAssignment(formData: FormData) {
  const input = educationCreateAssignmentSchema.safeParse({
    orgId: formString(formData, "org_id"),
    classId: formString(formData, "class_id"),
    title: formString(formData, "title"),
    description: formString(formData, "description"),
    dueOn: formString(formData, "due_on"),
    maxScore: Number(formString(formData, "max_score")),
    studentIds: formData.getAll("student_id").filter((value): value is string => typeof value === "string"),
  });
  if (!input.success) redirect(`${PORTAL_PATH}?assignment=invalid`);

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(`Could not verify the signed-in account: ${userError.message}`);
  if (!user) redirect(`/login?next=${encodeURIComponent(PORTAL_PATH)}`);

  const { data: assignmentId, error } = await supabase.rpc("education_teacher_create_assignment", {
    p_org_id: input.data.orgId,
    p_class_id: input.data.classId,
    p_title: input.data.title,
    p_description: input.data.description,
    p_due_on: input.data.dueOn,
    p_max_score: input.data.maxScore,
    p_student_ids: input.data.studentIds,
  });
  if (error) {
    console.error("Could not create education assignment:", error.message);
    redirect(`${PORTAL_PATH}?assignment=error`);
  }
  if (!assignmentId) {
    console.error("Could not create education assignment: no assignment ID was returned.");
    redirect(`${PORTAL_PATH}?assignment=error`);
  }
  revalidatePath(PORTAL_PATH);
  revalidatePath("/student-education-portal");
  redirect(`${PORTAL_PATH}?assignment=created`);
}

export async function gradeEducationAssignmentSubmission(formData: FormData) {
  const scoreText = formString(formData, "score").trim();
  if (!scoreText) redirect(`${PORTAL_PATH}?assignment=invalid`);
  const input = educationGradeAssignmentSchema.safeParse({
    submissionId: formString(formData, "submission_id"),
    score: Number(scoreText),
    feedback: formString(formData, "feedback"),
  });
  if (!input.success) redirect(`${PORTAL_PATH}?assignment=invalid`);

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(`Could not verify the signed-in account: ${userError.message}`);
  if (!user) redirect(`/login?next=${encodeURIComponent(PORTAL_PATH)}`);

  const { error } = await supabase.rpc("education_teacher_grade_assignment_submission", {
    p_submission_id: input.data.submissionId,
    p_score: input.data.score,
    p_feedback: input.data.feedback,
  });
  if (error) {
    console.error("Could not grade education assignment submission:", error.message);
    redirect(`${PORTAL_PATH}?assignment=grade-error`);
  }
  revalidatePath(PORTAL_PATH);
  revalidatePath("/student-education-portal");
  redirect(`${PORTAL_PATH}?assignment=graded`);
}

export async function requestEducationAssignmentRevision(formData: FormData) {
  const input = educationRequestAssignmentRevisionSchema.safeParse({
    submissionId: formString(formData, "submission_id"),
    note: formString(formData, "note"),
  });
  if (!input.success) redirect(`${PORTAL_PATH}?assignment=invalid`);

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(`Could not verify the signed-in account: ${userError.message}`);
  if (!user) redirect(`/login?next=${encodeURIComponent(PORTAL_PATH)}`);

  const { error } = await supabase.rpc("education_teacher_request_assignment_revision", {
    p_submission_id: input.data.submissionId,
    p_note: input.data.note,
  });
  if (error) {
    console.error("Could not request an education assignment revision:", error.message);
    redirect(`${PORTAL_PATH}?assignment=revision-error`);
  }
  revalidatePath(PORTAL_PATH);
  revalidatePath("/student-education-portal");
  revalidatePath("/education-portal");
  redirect(`${PORTAL_PATH}?assignment=revision-requested`);
}

export async function recordEducationTeacherAttendance(formData: FormData) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(`Could not verify the signed-in account: ${userError.message}`);
  if (!user) redirect(`/login?next=${encodeURIComponent(PORTAL_PATH)}`);
  const { error } = await supabase.rpc("education_teacher_record_student_attendance", {
    p_org_id: String(formData.get("org_id") ?? ""),
    p_class_id: String(formData.get("class_id") ?? ""),
    p_student_id: String(formData.get("student_id") ?? ""),
    p_attendance_date: String(formData.get("attendance_date") ?? ""),
    p_status: String(formData.get("status") ?? ""),
    p_note: String(formData.get("note") ?? ""),
  });
  if (error) {
    console.error("Could not record teacher portal attendance:", error.message);
    redirect(`${PORTAL_PATH}?attendance=error`);
  }
  revalidatePath(PORTAL_PATH);
  redirect(`${PORTAL_PATH}?attendance=saved`);
}

export async function signInToEducationTeacherPortal(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length > 256) {
    redirect(`${PORTAL_PATH}?signin=invalid`);
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user) redirect(`${PORTAL_PATH}?signin=invalid`);
  if (data.user.app_metadata?.must_change_password === true) {
    redirect(`/reset-password?next=${encodeURIComponent(PORTAL_PATH)}`);
  }
  redirect(PORTAL_PATH);
}

export async function claimEducationTeacherPortalAccount() {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(`Could not verify the signed-in account: ${userError.message}`);
  if (!user) redirect(`/login?next=${encodeURIComponent(PORTAL_PATH)}`);
  const { data: claimedCount, error } = await supabase.rpc("education_claim_teacher_account");
  if (error) {
    if (error.code === "42501") redirect(`${PORTAL_PATH}?claim=verify-email`);
    console.error("Could not link the Think Education teacher account:", error.message);
    redirect(`${PORTAL_PATH}?claim=error`);
  }
  if (claimedCount < 1) redirect(`${PORTAL_PATH}?claim=not-found`);
  revalidatePath(PORTAL_PATH);
  redirect(`${PORTAL_PATH}?claim=linked`);
}
