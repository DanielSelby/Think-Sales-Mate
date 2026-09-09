import "server-only";
import { createPlatformServerClient } from "@/lib/supabase/platform-server";
import type { PlatformRole } from "@/types/platform-database";

export async function getPlatformAdmin() {
  const supabase = await createPlatformServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: admin } = await supabase
    .from("platform_admins")
    .select("*")
    .eq("auth_user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  return admin ? { ...admin, userId: user.id } : null;
}

export function platformRoleCan(role: PlatformRole, permission: "manage_platform" | "manage_billing" | "manage_support" | "manage_security") {
  if (role === "platform_owner") return true;
  return {
    platform_administrator: ["manage_platform"],
    support_administrator: ["manage_support"],
    billing_administrator: ["manage_billing"],
    technical_administrator: ["manage_security"],
  }[role]?.includes(permission) ?? false;
}
