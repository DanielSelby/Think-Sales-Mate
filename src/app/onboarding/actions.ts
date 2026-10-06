"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncOrganizationToPlatform } from "@/lib/supabase/platform-admin";
import { notifyRegistrationApplication } from "@/lib/organizations/registration-email";
import { headers } from "next/headers";
import { getRegistrationIpHash } from "@/lib/organizations/registration-rate-limit";

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
  const baseSlug = slugify(name) || "workspace";
  const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 7)}`;
  const requestHeaders = await headers();
  const clientIp = requestHeaders.get("x-real-ip") ?? requestHeaders.get("cf-connecting-ip");
  const ipHash = clientIp ? getRegistrationIpHash(clientIp) : null;

  const { data: registrations, error: registrationError } = await admin.rpc("create_organization_registration", {
    p_user_id: user.id,
    p_name: name,
    p_slug: slug,
    p_ip_hash: ipHash,
  });
  if (registrationError) {
    if (registrationError.message.includes("registration limit") || registrationError.message.includes("Too many workspace registrations")) {
      redirectWithError(registrationError.message);
    }
    console.error(`[registration] Could not submit organization registration: ${registrationError.message}`);
    redirectWithError("We could not submit your registration. Please try again in a moment.");
  }
  const registration = registrations?.[0];
  if (!registration) throw new Error("Registration was not created. Please try again.");
  if (!registration.created) redirect("/registration-status?alreadySubmitted=1");

  try {
    await syncOrganizationToPlatform({
      id: registration.organization_id,
      name,
      status: "pending",
      ownerUserId: user.id,
      ownerEmail: user.email ?? "",
    });
  } catch (syncError) {
    console.error("Platform organization synchronization failed:", syncError);
  }
  try {
    await notifyRegistrationApplication({ id: registration.organization_id, name, ownerEmail: user.email ?? "" });
  } catch (notificationError) {
    console.error("Platform registration notification failed:", notificationError);
  }

  redirect("/registration-status?submitted=1");
}
