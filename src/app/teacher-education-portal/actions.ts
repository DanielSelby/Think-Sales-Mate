"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const PORTAL_PATH = "/teacher-education-portal";

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
