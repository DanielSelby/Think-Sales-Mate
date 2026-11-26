"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { educationGuardianContactUpdateSchema } from "@/lib/education/guardian-schedule";
import {
  getEducationPortalPathFromInput,
  getEducationPortalScopedPath,
  getEducationPortalStatusPath,
} from "@/lib/education/portal-auth";

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
  const portalPath = getEducationPortalScopedPath(PORTAL_PATH, input.data.orgId);
  const profilePath = (status: string) => getEducationPortalStatusPath(portalPath, "profile", status);

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(`Could not verify the signed-in account: ${userError.message}`);
  if (!user) redirect(`/login?next=${encodeURIComponent(portalPath)}`);

  const { error } = await supabase.rpc("education_guardian_update_own_contact", {
    p_org_id: input.data.orgId,
    p_first_name: input.data.firstName,
    p_last_name: input.data.lastName,
    p_email: input.data.email || null,
    p_phone: input.data.phone || null,
  });
  if (error) {
    if (error.code === "42501") redirect(profilePath("denied"));
    if (error.code === "22023") redirect(profilePath("invalid"));
    console.error("Could not update guardian contact details:", error.message);
    redirect(profilePath("error"));
  }

  revalidatePath(PORTAL_PATH);
  redirect(profilePath("saved"));
}

export async function signInToEducationGuardianPortal(formData: FormData) {
  const portalPath = getEducationPortalPathFromInput(PORTAL_PATH, formData.get("org_id"));
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

export async function claimEducationGuardianPortalAccount(formData: FormData) {
  const portalPath = getEducationPortalPathFromInput(PORTAL_PATH, formData.get("org_id"));
  if (!portalPath) redirect(`${PORTAL_PATH}?claim=error`);
  const claimPath = (status: string) => getEducationPortalStatusPath(portalPath, "claim", status);
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(`Could not verify the signed-in account: ${userError.message}`);
  if (!user) redirect(`/login?next=${encodeURIComponent(portalPath)}`);

  const { data: claimedCount, error } = await supabase.rpc("education_claim_guardian_account");
  if (error) {
    if (error.code === "42501") redirect(claimPath("verify-email"));
    if (error.code === "23505") redirect(claimPath("already-linked"));
    console.error("Could not link the Think Education guardian account:", error.message);
    redirect(claimPath("error"));
  }
  if (claimedCount < 1) redirect(claimPath("not-found"));

  revalidatePath(PORTAL_PATH);
  redirect(claimPath("linked"));
}

export async function acknowledgeEducationReportCard(formData: FormData) {
  const orgId = String(formData.get("org_id") ?? "");
  const reportCardId = String(formData.get("report_card_id") ?? "");
  const comment = String(formData.get("comment") ?? "").trim();
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(orgId) || !uuidPattern.test(reportCardId) || comment.length > 2000) {
    redirect(`${PORTAL_PATH}?acknowledgement=invalid`);
  }

  const portalPath = getEducationPortalScopedPath(PORTAL_PATH, orgId);
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(`Could not verify the signed-in account: ${userError.message}`);
  if (!user) redirect(`/login?next=${encodeURIComponent(portalPath)}`);

  const { error } = await supabase.rpc("education_acknowledge_report_card", {
    p_org_id: orgId,
    p_report_card_id: reportCardId,
    p_comment: comment || null,
  });
  if (error) {
    if (error.code === "42501") redirect(`${portalPath}?acknowledgement=denied`);
    if (error.code === "P0002") redirect(`${portalPath}?acknowledgement=not-found`);
    if (error.code === "22023") redirect(`${portalPath}?acknowledgement=invalid`);
    console.error("Could not acknowledge the Think Education report card:", error.message);
    redirect(`${portalPath}?acknowledgement=error`);
  }

  revalidatePath(PORTAL_PATH);
  revalidatePath("/education-portal/report-card");
  redirect(`${portalPath}?acknowledgement=saved`);
}

export async function bookEducationPTM(formData: FormData) {
  const orgId = String(formData.get("org_id") ?? "");
  const meetingId = String(formData.get("meeting_id") ?? "");
  const purpose = String(formData.get("purpose") ?? "").trim();
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(orgId) || !uuidPattern.test(meetingId) || purpose.length > 500) {
    redirect(`${PORTAL_PATH}?ptm=invalid`);
  }
  const portalPath = getEducationPortalScopedPath(PORTAL_PATH, orgId);
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(`Could not verify the signed-in account: ${userError.message}`);
  if (!user) redirect(`/login?next=${encodeURIComponent(portalPath)}`);
  const { error } = await supabase.rpc("education_guardian_book_ptm", {
    p_org_id: orgId,
    p_meeting_id: meetingId,
    p_purpose: purpose || null,
  });
  if (error) {
    if (error.code === "42501") redirect(`${portalPath}?ptm=denied`);
    if (error.code === "P0002") redirect(`${portalPath}?ptm=not-found`);
    if (error.code === "22023") redirect(`${portalPath}?ptm=conflict`);
    console.error("Could not book the Think Education meeting:", error.message);
    redirect(`${portalPath}?ptm=error`);
  }
  revalidatePath(PORTAL_PATH);
  revalidatePath("/teacher-education-portal");
  redirect(`${portalPath}?ptm=booked`);
}
