"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function completeRequiredPasswordChange(): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { error: "Your session has expired. Sign in again and reset your password." };

  const admin = createAdminClient();
  const { data, error: lookupError } = await admin.auth.admin.getUserById(user.id);
  if (lookupError || !data.user) return { error: "Could not verify your account's password-change requirement." };

  const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { ...data.user.app_metadata, must_change_password: false },
    user_metadata: { ...data.user.user_metadata, must_change_password: false },
  });
  if (updateError) return { error: "Your password was updated, but the required password-change status could not be cleared. Please try again." };

  return {};
}
