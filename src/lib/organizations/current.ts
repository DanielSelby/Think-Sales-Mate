import { createClient } from "@/lib/supabase/server";
import type { MemberRole } from "@/lib/rbac";

export interface CurrentOrgContext {
  userId: string;
  userEmail: string;
  orgId: string;
  orgName: string;
  currency: string;
  role: MemberRole;
  branchScope: "all" | "assigned" | "single";
  locationId: string | null;
  secondaryLocationIds: string[];
  canViewOtherTransactions: boolean;
  canCheckCrossBranchStock: boolean;
  isBranchScoped: boolean;
  allowedLocationIds: string[];
  memberships: Array<{ orgId: string; orgName: string; role: MemberRole }>;
}

/**
 * Resolves the signed-in user's organizations and their role in each.
 * The "active" org is whichever the user last selected (cookie-based,
 * see components/nav/org-switcher.tsx); falls back to the first membership.
 */
export async function getCurrentOrgContext(activeOrgId?: string): Promise<CurrentOrgContext | null> {
  const supabase = await createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: memberRows, error } = await supabase
    .from("organization_members")
    .select("org_id, role, branch_scope, location_id, secondary_location_ids, can_view_other_users_transactions, can_check_cross_branch_stock, organizations(name, currency)")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (error || !memberRows || memberRows.length === 0) return null;

  const memberships = memberRows.map((row: any) => {
    // organizations relation may resolve as an object or array depending on
    // schema introspection — normalize defensively.
    const org = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
    const canViewOther = row.can_view_other_users_transactions !== false;
    const canCheckCrossBranchStock = row.can_check_cross_branch_stock === true;
    const branchScope = (row.branch_scope as "all" | "assigned" | "single") || "assigned";
    const locationId = row.location_id ?? null;
    const secondaryLocationIds = (row.secondary_location_ids as string[]) ?? [];

    const isBranchScoped = Boolean(locationId) && (branchScope !== "all" || (row.role !== "admin" && row.role !== "owner"));
    const allowedLocationIds = locationId
      ? Array.from(new Set([locationId, ...secondaryLocationIds]))
      : [];

    return {
      orgId: row.org_id,
      orgName: org?.name ?? "Untitled organization",
      currency: org?.currency ?? "USD",
      role: row.role as MemberRole,
      branchScope,
      locationId,
      secondaryLocationIds,
      canViewOtherTransactions: canViewOther,
      canCheckCrossBranchStock,
      isBranchScoped,
      allowedLocationIds,
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
    branchScope: active.branchScope,
    locationId: active.locationId,
    secondaryLocationIds: active.secondaryLocationIds,
    canViewOtherTransactions: active.canViewOtherTransactions,
    canCheckCrossBranchStock: active.canCheckCrossBranchStock,
    isBranchScoped: active.isBranchScoped,
    allowedLocationIds: active.allowedLocationIds,
    memberships: memberships.map(({ orgId, orgName, role }) => ({ orgId, orgName, role }))
  };
}