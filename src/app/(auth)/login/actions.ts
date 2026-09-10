"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPlatformAdminClient } from "@/lib/supabase/platform-admin";
import { headers } from "next/headers";

function getLoginClientDetails(requestHeaders: Headers) {
  const userAgent = requestHeaders.get("user-agent") ?? "";
  const ipAddress = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? requestHeaders.get("x-real-ip")
    ?? null;
  const browser = /Edg\//.test(userAgent) ? "Edge"
    : /Chrome\//.test(userAgent) ? "Chrome"
    : /Firefox\//.test(userAgent) ? "Firefox"
    : /Safari\//.test(userAgent) ? "Safari"
    : "Unknown";
  const device = /Mobi|Android|iPhone|iPad/i.test(userAgent) ? "Mobile" : "Desktop";
  return { browser, device, ipAddress, userAgent };
}

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
      .select("user_id, org_id, status")
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
  const { data: sessionData, error } = await supabase.auth.signInWithPassword({ email: authEmail, password });
  if (error) return { error: error.message };

  try {
    const requestHeaders = await headers();
    const clientDetails = getLoginClientDetails(requestHeaders);
    const userId = sessionData.user.id;
    const admin = createAdminClient();
    const { data: memberships } = await admin
      .from("organization_members")
      .select("org_id")
      .eq("user_id", userId)
      .eq("status", "active");
    const platform = createPlatformAdminClient();
    const { error: auditError } = await platform.from("platform_audit_logs").insert(
      (memberships ?? []).map((membership) => ({
        organization_id: membership.org_id,
        action: "user_login",
        module: "authentication",
        metadata: { userId, email: authEmail, device: clientDetails.device, browser: clientDetails.browser },
        ip_address: clientDetails.ipAddress,
        user_agent: clientDetails.userAgent,
      })),
    );
    if (auditError) throw auditError;
  } catch (auditError) {
    console.error("Organization login audit recording failed:", auditError);
  }

  return { success: true };
}
