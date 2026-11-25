"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { educationGuardianContactUpdateSchema } from "@/lib/education/guardian-schedule";

const PORTAL_PATH = "/education-portal";

export async function updateEducationGuardianContact(formData: FormData) {
  const input = educationGuardianContactUpdateSchema.safeParse({
    orgId: String(formData.get("org_id") ?? ""),
    firstName: String(formData.get("first_name") ?? ""),
    lastName: String(formData.get("last_name") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
  });
  if (!input.success) redirect(`${PORTAL_PATH}?profile=invalid`);

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(`Could not verify the signed-in account: ${userError.message}`);
  if (!user) redirect(`/login?next=${encodeURIComponent(PORTAL_PATH)}`);

  const { error } = await supabase.rpc("education_guardian_update_own_contact", {
    p_org_id: input.data.orgId,
    p_first_name: input.data.firstName,
    p_last_name: input.data.lastName,
    p_email: input.data.email || null,
    p_phone: input.data.phone || null,
  });
  if (error) {
    if (error.code === "42501") redirect(`${PORTAL_PATH}?profile=denied`);
    if (error.code === "22023") redirect(`${PORTAL_PATH}?profile=invalid`);
    console.error("Could not update guardian contact details:", error.message);
    redirect(`${PORTAL_PATH}?profile=error`);
  }

  revalidatePath(PORTAL_PATH);
  redirect(`${PORTAL_PATH}?profile=saved`);
}

export async function signInToEducationGuardianPortal(formData: FormData) {
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

export async function claimEducationGuardianPortalAccount() {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(`Could not verify the signed-in account: ${userError.message}`);
  if (!user) redirect(`/login?next=${encodeURIComponent(PORTAL_PATH)}`);

  const { data: claimedCount, error } = await supabase.rpc("education_claim_guardian_account");
  if (error) {
    if (error.code === "42501") redirect(`${PORTAL_PATH}?claim=verify-email`);
    if (error.code === "23505") redirect(`${PORTAL_PATH}?claim=already-linked`);
    console.error("Could not link the Think Education guardian account:", error.message);
    redirect(`${PORTAL_PATH}?claim=error`);
  }
  if (claimedCount < 1) redirect(`${PORTAL_PATH}?claim=not-found`);

  revalidatePath(PORTAL_PATH);
  redirect(`${PORTAL_PATH}?claim=linked`);
}
