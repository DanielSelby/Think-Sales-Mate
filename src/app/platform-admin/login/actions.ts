"use server";

import { createPlatformServerClient } from "@/lib/supabase/platform-server";

export async function loginPlatformAdmin(email: string, password: string) {
  if (!email.trim() || !password) return { error: "Enter your platform administrator email and password." };
  const supabase = await createPlatformServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) {
    if (error.code === "email_not_confirmed") {
      return { error: "Confirm this platform administrator email in the Platform Supabase project before signing in." };
    }
    return { error: "Platform sign-in failed. Confirm the account exists in the separate Platform Supabase project and reset its password there if needed." };
  }
  if (!data.user) return { error: "Platform sign-in did not return an authenticated user." };

  const { data: admin, error: adminError } = await supabase
    .from("platform_admins")
    .select("id")
    .eq("auth_user_id", data.user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (adminError) return { error: "Platform sign-in succeeded, but the platform administrator record could not be verified." };
  if (!admin) return { error: "This account is authenticated but is not assigned as an active platform administrator." };
  await supabase.from("platform_admins").update({ last_login_at: new Date().toISOString() }).eq("id", admin.id);
  await supabase.from("platform_audit_logs").insert({
    admin_id: admin.id,
    action: "platform_user_login",
    module: "security",
    metadata: { email: data.user.email ?? email.trim().toLowerCase() },
  });
  return { success: true };
}

export async function logoutPlatformAdmin() {
  const supabase = await createPlatformServerClient();
  await supabase.auth.signOut();
}
