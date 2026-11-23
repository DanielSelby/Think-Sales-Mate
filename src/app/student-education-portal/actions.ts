"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { educationSubmitAssignmentSchema } from "@/lib/education/assignments";

const PORTAL_PATH = "/student-education-portal";

export async function submitEducationAssignment(formData: FormData) {
  const input = educationSubmitAssignmentSchema.safeParse({
    assignmentId: String(formData.get("assignment_id") ?? ""),
    studentId: String(formData.get("student_id") ?? ""),
    submissionText: String(formData.get("submission_text") ?? ""),
  });
  if (!input.success) redirect(`${PORTAL_PATH}?assignment=invalid`);

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(`Could not verify the signed-in account: ${userError.message}`);
  if (!user) redirect(`/login?next=${encodeURIComponent(PORTAL_PATH)}`);

  const { error } = await supabase.rpc("education_student_submit_assignment", {
    p_assignment_id: input.data.assignmentId,
    p_student_id: input.data.studentId,
    p_submission_text: input.data.submissionText,
  });
  if (error) {
    console.error("Could not submit education assignment:", error.message);
    redirect(`${PORTAL_PATH}?assignment=error`);
  }
  revalidatePath(PORTAL_PATH);
  redirect(`${PORTAL_PATH}?assignment=submitted`);
}

export async function signInToEducationStudentPortal(formData: FormData) {
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

export async function claimEducationStudentPortalAccount() {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(`Could not verify the signed-in account: ${userError.message}`);
  if (!user) redirect(`/login?next=${encodeURIComponent(PORTAL_PATH)}`);

  const { data: claimedCount, error } = await supabase.rpc("education_claim_student_account");
  if (error) {
    if (error.code === "42501") redirect(`${PORTAL_PATH}?claim=verify-email`);
    if (error.code === "23505") redirect(`${PORTAL_PATH}?claim=already-linked`);
    console.error("Could not link the Think Education student account:", error.message);
    redirect(`${PORTAL_PATH}?claim=error`);
  }
  if (claimedCount < 1) redirect(`${PORTAL_PATH}?claim=not-found`);

  revalidatePath(PORTAL_PATH);
  redirect(`${PORTAL_PATH}?claim=linked`);
}
