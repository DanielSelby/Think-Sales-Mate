"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isEducationOrganizationId } from "@/lib/education/portal-auth";

const RETURN_PATHS = new Set([
  "/education/notifications",
  "/education-portal",
  "/student-education-portal",
]);

function getReturnPath(formData: FormData) {
  const requested = String(formData.get("return_to") ?? "");
  try {
    const destination = new URL(requested, "https://portal.invalid");
    if (
      destination.origin !== "https://portal.invalid"
      || !RETURN_PATHS.has(destination.pathname)
      || [...destination.searchParams.keys()].some((key) => key !== "org")
    ) {
      return "/education/notifications";
    }

    const organizationIds = destination.searchParams.getAll("org");
    if (organizationIds.length > 1 || (organizationIds.length === 1 && !isEducationOrganizationId(organizationIds[0]))) {
      return "/education/notifications";
    }
    return organizationIds.length
      ? `${destination.pathname}?org=${encodeURIComponent(organizationIds[0])}`
      : destination.pathname;
  } catch {
    return "/education/notifications";
  }
}

function withReturnStatus(returnPath: string, key: string, value: string) {
  const destination = new URL(returnPath, "https://portal.invalid");
  destination.searchParams.set(key, value);
  return `${destination.pathname}${destination.search}`;
}

function revalidateReturnPath(returnPath: string) {
  revalidatePath(new URL(returnPath, "https://portal.invalid").pathname);
}

export async function markEducationNotificationRead(formData: FormData) {
  const returnPath = getReturnPath(formData);
  const notificationId = String(formData.get("notification_id") ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(notificationId)) {
    redirect(withReturnStatus(returnPath, "notification", "invalid"));
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("education_notification_mark_read", {
    p_notification_id: notificationId,
  });
  if (error) {
    if (error.code === "P0002") redirect(withReturnStatus(returnPath, "notification", "not-found"));
    if (error.code === "42501") redirect(withReturnStatus(returnPath, "notification", "denied"));
    console.error("Could not mark Think Education notification as read:", error.message);
    redirect(withReturnStatus(returnPath, "notification", "error"));
  }

  revalidateReturnPath(returnPath);
  redirect(returnPath);
}

export async function setEducationNotificationPreference(formData: FormData) {
  const returnPath = getReturnPath(formData);
  const orgId = String(formData.get("org_id") ?? "");
  const notificationType = String(formData.get("notification_type") ?? "");
  const inAppEnabled = String(formData.get("in_app_enabled") ?? "") === "true";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orgId)
    || !["announcement", "attendance", "results", "fees", "admissions", "transport", "assignment"].includes(notificationType)) {
    redirect(withReturnStatus(returnPath, "preference", "invalid"));
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("education_notification_set_preference", {
    p_org_id: orgId,
    p_notification_type: notificationType,
    p_in_app_enabled: inAppEnabled,
  });
  if (error) {
    if (error.code === "42501") redirect(withReturnStatus(returnPath, "preference", "denied"));
    if (error.code === "22023") redirect(withReturnStatus(returnPath, "preference", "invalid"));
    console.error("Could not save Think Education notification preference:", error.message);
    redirect(withReturnStatus(returnPath, "preference", "error"));
  }

  revalidateReturnPath(returnPath);
  redirect(withReturnStatus(returnPath, "preference", "saved"));
}

export async function setEducationAnnouncementDeliveryPreference(formData: FormData) {
  const returnPath = getReturnPath(formData);
  const orgId = String(formData.get("org_id") ?? "");
  const channel = String(formData.get("channel") ?? "");
  const enabledValue = String(formData.get("enabled") ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orgId)
    || !["email", "sms"].includes(channel)
    || !["true", "false"].includes(enabledValue)) {
    redirect(withReturnStatus(returnPath, "preference", "invalid"));
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("education_notification_set_delivery_preference", {
    p_org_id: orgId,
    p_channel: channel,
    p_enabled: enabledValue === "true",
  });
  if (error) {
    if (error.code === "42501") redirect(withReturnStatus(returnPath, "preference", "denied"));
    if (error.code === "22023") redirect(withReturnStatus(returnPath, "preference", "invalid"));
    console.error("Could not save Think Education announcement delivery preference:", error.message);
    redirect(withReturnStatus(returnPath, "preference", "error"));
  }

  revalidateReturnPath(returnPath);
  redirect(withReturnStatus(returnPath, "preference", "saved"));
}
