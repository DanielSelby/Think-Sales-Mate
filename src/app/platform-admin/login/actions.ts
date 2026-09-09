"use server";

import { createPlatformServerClient } from "@/lib/supabase/platform-server";

export async function loginPlatformAdmin(email: string, password: string) {
  if (!email.trim() || !password) return { error: "Enter your platform administrator email and password." };
  const supabase = await createPlatformServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) return { error: "Invalid platform administrator credentials." };
  return { success: true };
}

export async function logoutPlatformAdmin() {
  const supabase = await createPlatformServerClient();
  await supabase.auth.signOut();
}
