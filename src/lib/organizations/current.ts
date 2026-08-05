import { createClient } from "@/lib/supabase/server";
import type { MemberRole } from "@/lib/rbac";

export interface CurrentOrgContext {
  userId: string;
  userEmail: string;
  orgId: string;
  orgName: string;
  currency: string;
  role: MemberRole;
  memberships: Array<{ orgId: string; orgName: string; role: MemberRole }>;
}

/**
 * Resolves the signed-in user's organizations and their role in each.
 * The "active" org is whichever the user last selected (cookie-based,
 * see components/nav/org-switcher.tsx); falls back to the first membership.
 */
export async function getCurrentOrgContext(activeOrgId?: string): Promise<CurrentOrgContext | null> {
  const supabase = createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: memberRows, error } = await supabase
    .from("organization_members")
    .select("org_id, role, organizations(name, currency)")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (error || !memberRows || memberRows.length === 0) return null;

  const memberships = memberRows.map((row) => {
    // organizations relation may resolve as an object or array depending on
    // schema introspection — normalize defensively.
    const org = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
    return {
      orgId: row.org_id,
      orgName: org?.name ?? "Untitled organization",
      currency: org?.currency ?? "USD",
      role: row.role as MemberRole
    };
  });

  const active = memberships.find((m) => m.orgId === activeOrgId) ?? memberships[0];

  return {
    userId: user.id,
    userEmail: user.email ?? "",
    orgId: active.orgId,
    orgName: active.orgName,
    currency: active.currency,
    role: active.role,
    memberships: memberships.map(({ orgId, orgName, role }) => ({ orgId, orgName, role }))
  };
}