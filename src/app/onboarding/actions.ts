"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncOrganizationToPlatform } from "@/lib/supabase/platform-admin";
import { notifyRegistrationApplication } from "@/lib/organizations/registration-email";

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function redirectWithError(message: string): never {
  redirect(`/onboarding?error=${encodeURIComponent(message)}`);
}

export async function createOrganization(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirectWithError("Workspace name is required.");

  // Verify the caller with the request-scoped (cookie-based) client — this
  // cannot be spoofed by the browser, since it re-validates the session
  // against Supabase Auth on every call.
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirectWithError("Your session expired — please sign in again.");
  }

  // A brand-new user has no organization yet, so they can't satisfy the
  // "existing member" RLS check that every other org write goes through.
  // Bootstrapping their first workspace is therefore done with the
  // service-role client — safe here because `user` above is already
  // verified server-side, not something the browser can forge.
  const admin = createAdminClient();
  const { count: recentAttempts, error: attemptsError } = await admin
    .from("organization_registration_attempts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  if (attemptsError) throw new Error(`Could not verify registration rate limit: ${attemptsError.message}`);
  if ((recentAttempts ?? 0) >= 3) {
    redirectWithError("You have reached the workspace registration limit. Please try again later.");
  }
  const { error: attemptError } = await admin.from("organization_registration_attempts").insert({ user_id: user.id });
  if (attemptError) throw new Error(`Could not record registration attempt: ${attemptError.message}`);

  const baseSlug = slugify(name) || "workspace";
  const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 7)}`;

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({ name, slug, created_by: user.id, registration_status: "pending" })
    .select("id")
    .single();

  if (orgError || !org) {
    redirectWithError(orgError?.message ?? "Could not create the workspace.");
  }

  const { error: memberError } = await admin.from("organization_members").insert({
    org_id: org.id,
    user_id: user.id,
    role: "owner",
    status: "invited"
  });

  if (memberError) {
    redirectWithError(memberError.message);
  }

  try {
    await syncOrganizationToPlatform({
      id: org.id,
      name,
      status: "pending",
      ownerUserId: user.id,
      ownerEmail: user.email ?? "",
    });
  } catch (syncError) {
    console.error("Platform organization synchronization failed:", syncError);
  }
  try {
    await notifyRegistrationApplication({ id: org.id, name, ownerEmail: user.email ?? "" });
  } catch (notificationError) {
    console.error("Platform registration notification failed:", notificationError);
  }

  redirect("/registration-status");
}
