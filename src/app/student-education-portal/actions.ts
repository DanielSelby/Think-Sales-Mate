"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { educationSubmitAssignmentSchema } from "@/lib/education/assignments";
import {
  getEducationPortalPathFromInput,
  getEducationPortalStatusPath,
} from "@/lib/education/portal-auth";

const PORTAL_PATH = "/student-education-portal";

function getPortalPath(formData: FormData) {
  return getEducationPortalPathFromInput(PORTAL_PATH, formData.get("org_id"));
}

export async function submitEducationAssignment(formData: FormData) {
  const portalPath = getPortalPath(formData) ?? PORTAL_PATH;
  const input = educationSubmitAssignmentSchema.safeParse({
    assignmentId: String(formData.get("assignment_id") ?? ""),
    studentId: String(formData.get("student_id") ?? ""),
    submissionText: String(formData.get("submission_text") ?? ""),
  });
  if (!input.success) redirect(getEducationPortalStatusPath(portalPath, "assignment", "invalid"));

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(`Could not verify the signed-in account: ${userError.message}`);
  if (!user) redirect(`/login?next=${encodeURIComponent(portalPath)}`);

  const { data: submissionId, error } = await supabase.rpc("education_student_submit_assignment", {
    p_assignment_id: input.data.assignmentId,
    p_student_id: input.data.studentId,
    p_submission_text: input.data.submissionText,
  });
  if (error) {
    console.error("Could not submit education assignment:", error.message);
    redirect(getEducationPortalStatusPath(portalPath, "assignment", "error"));
  }
  if (!submissionId) {
    console.error("Could not submit education assignment: no submission ID was returned.");
    redirect(getEducationPortalStatusPath(portalPath, "assignment", "error"));
  }
  revalidatePath(PORTAL_PATH);
  redirect(getEducationPortalStatusPath(portalPath, "assignment", "submitted"));
}

export async function signInToEducationStudentPortal(formData: FormData) {
  const portalPath = getPortalPath(formData);
  if (!portalPath) redirect(`${PORTAL_PATH}?signin=invalid`);
  const invalidPath = getEducationPortalStatusPath(portalPath, "signin", "invalid");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length > 256) {
    redirect(invalidPath);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user) redirect(invalidPath);
  if (data.user.app_metadata?.must_change_password === true) {
    redirect(`/reset-password?next=${encodeURIComponent(portalPath)}`);
  }
  redirect(portalPath);
}

export async function claimEducationStudentPortalAccount(formData: FormData) {
  const portalPath = getPortalPath(formData);
  if (!portalPath) redirect(`${PORTAL_PATH}?claim=error`);
  const claimPath = (status: string) => getEducationPortalStatusPath(portalPath, "claim", status);
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(`Could not verify the signed-in account: ${userError.message}`);
  if (!user) redirect(`/login?next=${encodeURIComponent(portalPath)}`);

  const { data: claimedCount, error } = await supabase.rpc("education_claim_student_account");
  if (error) {
    if (error.code === "42501") redirect(claimPath("verify-email"));
    if (error.code === "23505") redirect(claimPath("already-linked"));
    console.error("Could not link the Think Education student account:", error.message);
    redirect(claimPath("error"));
  }
  if (claimedCount < 1) redirect(claimPath("not-found"));

  revalidatePath(PORTAL_PATH);
  redirect(claimPath("linked"));
}
