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

export async function requestEducationTeacherPortalSignIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect(`${PORTAL_PATH}?signin=invalid`);
  }
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (!siteUrl) {
    console.error("Teacher portal sign-in was not sent because the application URL is not configured.");
    redirect(`${PORTAL_PATH}?signin=configuration`);
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${siteUrl.replace(/\/+$/, "")}/auth/callback?next=${PORTAL_PATH}`,
    },
  });
  if (error) {
    console.error("Could not send Think Education teacher portal sign-in:", error.message);
    redirect(`${PORTAL_PATH}?signin=error`);
  }
  redirect(`${PORTAL_PATH}?emailSent=1`);
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
