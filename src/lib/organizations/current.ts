import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
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
  priceGroups: Array<"retail" | "wholesale" | "vip" | "special">;
  isBranchScoped: boolean;
  allowedLocationIds: string[];
  masterLocationId: string | null;
  memberships: Array<{ orgId: string; orgName: string; role: MemberRole }>;
}

/**
 * Resolves the signed-in user's organizations and their role in each.
 * The "active" org is whichever the user last selected (cookie-based,
 * see components/nav/org-switcher.tsx); falls back to the first membership.
 */
export async function getCurrentOrgContext(activeOrgId?: string): Promise<CurrentOrgContext | null> {
  const supabase = await createClient();
  const requestCookies = await cookies();
  const requestedMasterLocationId = requestCookies.get("master_location_id")?.value ?? null;

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: memberRows, error } = await supabase
    .from("organization_members")
    .select("org_id, user_id, role, branch_scope, location_id, secondary_location_ids, can_view_other_users_transactions, can_check_cross_branch_stock, access_permissions, organizations(name, currency, created_by)")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (error || !memberRows || memberRows.length === 0) return null;

  const memberships = memberRows.map((row: any) => {
    // organizations relation may resolve as an object or array depending on
    // schema introspection — normalize defensively.
    // The workspace creator is the owner even if an older access-management
    // update wrote an administrative role into the membership row.
    const organization = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
    const org = organization;
    const isOwner = row.role === "owner" || organization?.created_by === user.id;
    const canViewOther = isOwner || row.can_view_other_users_transactions !== false;
    const canCheckCrossBranchStock = isOwner || row.can_check_cross_branch_stock === true;
    const configuredPriceGroups = row.access_permissions?.price_groups;
    const priceGroups = isOwner || !Array.isArray(configuredPriceGroups)
      ? ["retail", "wholesale", "vip", "special"] as const
      : configuredPriceGroups.filter((group: unknown): group is "retail" | "wholesale" | "vip" | "special" =>
          group === "retail" || group === "wholesale" || group === "vip" || group === "special");
    const branchScope = isOwner ? "all" : ((row.branch_scope as "all" | "assigned" | "single") || "assigned");
    const locationId = isOwner ? null : (row.location_id ?? null);
    const secondaryLocationIds = isOwner ? [] : ((row.secondary_location_ids as string[]) ?? []);

    const isBranchScoped = Boolean(locationId) && (branchScope !== "all" || (!isOwner && row.role !== "admin"));
    const allowedLocationIds = locationId
      ? Array.from(new Set([locationId, ...secondaryLocationIds]))
      : [];

    return {
      orgId: row.org_id,
      orgName: org?.name ?? "Untitled organization",
      currency: org?.currency ?? "USD",
      role: isOwner ? "owner" : row.role as MemberRole,
      branchScope,
      locationId,
      secondaryLocationIds,
      canViewOtherTransactions: canViewOther,
      canCheckCrossBranchStock,
      priceGroups: (priceGroups.length > 0 ? priceGroups : ["retail"]) as Array<"retail" | "wholesale" | "vip" | "special">,
      isBranchScoped,
      allowedLocationIds,
    };
  });

  const active = memberships.find((m) => m.orgId === activeOrgId) ?? memberships[0];
  let masterLocationId: string | null = null;
  if (active.branchScope === "all" && requestedMasterLocationId) {
    const { data: selectedLocation } = await supabase
      .from("business_locations")
      .select("id")
      .eq("org_id", active.orgId)
      .eq("id", requestedMasterLocationId)
      .eq("is_active", true)
      .maybeSingle();
    masterLocationId = selectedLocation?.id ?? null;
  }

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
    priceGroups: active.priceGroups,
    isBranchScoped: active.isBranchScoped,
    allowedLocationIds: active.allowedLocationIds,
    masterLocationId,
    memberships: memberships.map(({ orgId, orgName, role }) => ({ orgId, orgName, role }))
  };
}