"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Resolves a staff username to its internal Auth email, then signs in using
 * the regular Supabase password flow. Email users continue to use their email
 * directly, so existing accounts and OAuth are unaffected.
 */
export async function loginWithIdentifier(identifier: string, password: string) {
  const value = identifier.trim().toLowerCase();
  if (!value || !password) return { error: "Enter your username or email and password." };

  let authEmail = value;
  if (!value.includes("@")) {
    const admin = createAdminClient();
    const { data: members, error } = await admin
      .from("organization_members")
      .select("user_id, status")
      .eq("username", value)
      .limit(2);
    if (error) return { error: "Unable to resolve username." };
    if (!members?.length) return { error: "Invalid username or password." };
    if (members.length > 1) return { error: "This username is used by more than one organization. Sign in with email." };
    if (members[0].status !== "active" || !members[0].user_id) return { error: "This staff account is not active." };

    const { data: authUser, error: userError } = await admin.auth.admin.getUserById(members[0].user_id);
    if (userError || !authUser.user?.email) return { error: "Unable to resolve username." };
    authEmail = authUser.user.email;
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password });
  return error ? { error: error.message } : { success: true };
}
