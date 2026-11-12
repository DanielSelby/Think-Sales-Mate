"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const PORTAL_PATH = "/education-portal";

export async function requestEducationGuardianPortalSignIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect(`${PORTAL_PATH}?signin=invalid`);
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (!siteUrl) {
    console.error("Guardian portal sign-in was not sent because the application URL is not configured.");
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
    console.error("Could not send Think Education guardian portal sign-in:", error.message);
    redirect(`${PORTAL_PATH}?signin=error`);
  }

  redirect(`${PORTAL_PATH}?emailSent=1`);
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
