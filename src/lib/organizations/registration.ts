import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPlatformAdminClient } from "@/lib/supabase/platform-admin";

export type OrganizationRegistrationApplication = {
  organizationId: string;
  organizationName: string;
  status: "pending" | "rejected" | "suspended";
  registrationState: "pending" | "information_requested" | "approved" | "rejected";
  registrationNotes: string | null;
  messages: Array<{ id: string; author_type: "owner" | "platform_admin" | "system"; message: string; created_at: string }>;
};

export async function getUserRegistrationApplications() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, applications: [] as OrganizationRegistrationApplication[] };

  const admin = createAdminClient();
  const { data: organizations, error: organizationsError } = await admin
    .from("organizations")
    .select("id, name, created_by, registration_status")
    .eq("created_by", user.id)
    .in("registration_status", ["pending", "rejected", "suspended"]);
  if (organizationsError) throw new Error(`Could not load registration status: ${organizationsError.message}`);
  const applications = organizations ?? [];
  if (!applications.length) return { user, applications: [] as OrganizationRegistrationApplication[] };

  const platform = createPlatformAdminClient();
  const [{ data: messages, error: messagesError }, { data: platformApplications, error: platformError }] = await Promise.all([
    admin
    .from("organization_registration_messages")
    .select("id, organization_id, author_type, message, created_at")
    .in("organization_id", applications.map((application) => application.id))
    .order("created_at", { ascending: true }),
    platform.from("platform_organizations")
      .select("organization_id, registration_state, registration_notes")
      .in("organization_id", applications.map((application) => application.id)),
  ]);
  if (messagesError) throw new Error(`Could not load registration messages: ${messagesError.message}`);
  if (platformError) throw new Error(`Could not load registration review details: ${platformError.message}`);
  const platformByOrganization = new Map((platformApplications ?? []).map((application) => [application.organization_id, application]));

  return {
    user,
    applications: applications.map((application) => ({
      organizationId: application.id,
      organizationName: application.name,
      status: application.registration_status as OrganizationRegistrationApplication["status"],
      registrationState: platformByOrganization.get(application.id)?.registration_state ?? "pending",
      registrationNotes: platformByOrganization.get(application.id)?.registration_notes ?? null,
      messages: (messages ?? [])
        .filter((message) => message.organization_id === application.id)
        .map(({ id, author_type, message, created_at }) => ({ id, author_type, message, created_at })),
    })),
  };
}
