"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const RETURN_PATHS = new Set([
  "/education/notifications",
  "/education-portal",
  "/student-education-portal",
]);

function getReturnPath(formData: FormData) {
  const requested = String(formData.get("return_to") ?? "");
  return RETURN_PATHS.has(requested) ? requested : "/education/notifications";
}

export async function markEducationNotificationRead(formData: FormData) {
  const returnPath = getReturnPath(formData);
  const notificationId = String(formData.get("notification_id") ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(notificationId)) {
    redirect(`${returnPath}?notification=invalid`);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("education_notification_mark_read", {
    p_notification_id: notificationId,
  });
  if (error) {
    if (error.code === "P0002") redirect(`${returnPath}?notification=not-found`);
    if (error.code === "42501") redirect(`${returnPath}?notification=denied`);
    console.error("Could not mark Think Education notification as read:", error.message);
    redirect(`${returnPath}?notification=error`);
  }

  revalidatePath(returnPath);
  redirect(returnPath);
}

export async function setEducationNotificationPreference(formData: FormData) {
  const requestedReturn = String(formData.get("return_to") ?? "");
  const returnPath = RETURN_PATHS.has(requestedReturn) ? requestedReturn : "/education/notifications";
  const orgId = String(formData.get("org_id") ?? "");
  const notificationType = String(formData.get("notification_type") ?? "");
  const inAppEnabled = String(formData.get("in_app_enabled") ?? "") === "true";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orgId)
    || !["announcement", "attendance", "results", "fees", "admissions", "transport"].includes(notificationType)) {
    redirect(`${returnPath}?preference=invalid`);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("education_notification_set_preference", {
    p_org_id: orgId,
    p_notification_type: notificationType,
    p_in_app_enabled: inAppEnabled,
  });
  if (error) {
    if (error.code === "42501") redirect(`${returnPath}?preference=denied`);
    if (error.code === "22023") redirect(`${returnPath}?preference=invalid`);
    console.error("Could not save Think Education notification preference:", error.message);
    redirect(`${returnPath}?preference=error`);
  }

  revalidatePath(returnPath);
  redirect(`${returnPath}?preference=saved`);
}
