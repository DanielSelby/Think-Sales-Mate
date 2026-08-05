import { cookies } from "next/headers";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { can } from "@/lib/rbac";
import { SettingsTabs } from "@/components/nav/settings-tabs";
import { UserManagement, type ManagedUser, type UserBranch } from "@/components/dashboard/user-management";

export default async function OrganizationSettingsPage() {
  const activeOrgId = cookies().get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const supabase = createClient();
  const [{ data: memberRows }, { data: locationRows }] = await Promise.all([
    supabase
      .from("organization_members")
      .select("id, user_id, invited_email, role, status, location_id, created_at")
      .eq("org_id", context.orgId),
    supabase.from("business_locations").select("id, name").eq("org_id", context.orgId).eq("is_active", true).order("name")
  ]);

  const branches: UserBranch[] = (locationRows ?? []).map((l) => ({ id: l.id, name: l.name }));
  const branchById = new Map(branches.map((b) => [b.id, b.name]));

  const admin = createAdminClient();
  const users: ManagedUser[] = [];

  for (const row of memberRows ?? []) {
    let email = row.invited_email ?? "";
    let lastSignInAt: string | null = null;
    if (row.user_id) {
      const { data } = await admin.auth.admin.getUserById(row.user_id);
      email = data.user?.email ?? email;
      lastSignInAt = data.user?.last_sign_in_at ?? null;
    }
    users.push({
      id: row.id,
      email,
      role: row.role,
      status: row.status,
      locationId: row.location_id,
      locationName: row.location_id ? branchById.get(row.location_id) ?? null : null,
      lastSignInAt,
      joinedAt: row.created_at,
      isSelf: row.user_id === context.userId
    });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <SettingsTabs active="team" />
      <UserManagement
        users={users}
        branches={branches}
        canManage={can(context.role, "org.manage_members")}
        orgName={context.orgName}
      />
    </div>
  );
}