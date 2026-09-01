import { cookies } from "next/headers";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { can } from "@/lib/rbac";
import { UserManagement, type ManagedUser, type UserBranch } from "@/components/dashboard/user-management";

export default async function OrganizationSettingsPage() {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const supabase = await createClient();
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

  for (let i = 0; i < (memberRows ?? []).length; i++) {
    const row = (memberRows ?? [])[i];
    let email = row.invited_email ?? "";
    let lastSignInAt: string | null = null;
    let nameFromAuth: string | null = null;

    if (row.user_id) {
      const { data } = await admin.auth.admin.getUserById(row.user_id);
      email = data.user?.email ?? email;
      lastSignInAt = data.user?.last_sign_in_at ?? null;
      nameFromAuth = data.user?.user_metadata?.full_name || data.user?.user_metadata?.name || null;
    }

    const fallbackName = nameFromAuth || email.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

    users.push({
      id: row.id,
      userId: row.user_id,
      name: fallbackName,
      fullName: fallbackName,
      email,
      phone: "+233 24 123 4567",
      employeeId: `TS-EMP-0${i + 1}`,
      role: row.role,
      roleLabel: row.role ? (row.role.charAt(0).toUpperCase() + row.role.slice(1)) : "Staff",
      status: row.status as any,
      department: "Sales & Marketing",
      locationId: row.location_id,
      locationName: row.location_id ? branchById.get(row.location_id) ?? null : null,
      lastSignInAt,
      joinedAt: row.created_at,
      isSelf: row.user_id === context.userId,
      twoFactorEnabled: true,
      branchScope: "assigned"
    });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <UserManagement
        users={users}
        branches={branches}
        canManage={can(context.role, "org.manage_members")}
        orgName={context.orgName}
      />
    </div>
  );
}