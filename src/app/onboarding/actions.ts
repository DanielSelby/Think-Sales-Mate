"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
  const supabase = createClient();
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

  const baseSlug = slugify(name) || "workspace";
  const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 7)}`;

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({ name, slug, created_by: user.id })
    .select("id")
    .single();

  if (orgError || !org) {
    redirectWithError(orgError?.message ?? "Could not create the workspace.");
  }

  const { error: memberError } = await admin.from("organization_members").insert({
    org_id: org.id,
    user_id: user.id,
    role: "owner",
    status: "active"
  });

  if (memberError) {
    redirectWithError(memberError.message);
  }

  redirect("/dashboard");
}
