"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function completeRequiredPasswordChange(password: string): Promise<{ error?: string }> {
  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    return { error: "Password must be between 8 and 128 characters." };
  }

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { error: "Your session has expired. Sign in again and reset your password." };

  const admin = createAdminClient();
  const { data, error: lookupError } = await admin.auth.admin.getUserById(user.id);
  if (lookupError || !data.user) return { error: "Could not verify your account's password-change requirement." };

  const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
    password,
    app_metadata: { ...data.user.app_metadata, must_change_password: false },
    user_metadata: { ...data.user.user_metadata, must_change_password: false },
  });
  if (updateError) {
    console.error("Could not complete the required password change:", updateError.message);
    return { error: "Could not update your password. Please try again." };
  }

  return {};
}
