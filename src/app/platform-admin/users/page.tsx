import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlatformAdmin } from "@/lib/platform-auth";
import { createPlatformAdminClient } from "@/lib/supabase/platform-admin";
import PlatformAdminUsersView, { type PlatformAdminUserRow } from "./users-view";
import PlatformAdminSignOutButton from "../sign-out-button";
import { normalizePlatformAdminPages } from "@/lib/platform-admin-pages";

export const metadata = { title: "Platform Admin Users · ThinkSales ERP" };

export default async function PlatformAdminUsersPage() {
  const currentAdmin = await getPlatformAdmin();
  if (!currentAdmin) redirect("/platform-admin/login");
  if (currentAdmin.role !== "platform_owner") redirect("/platform-admin");

  const platform = createPlatformAdminClient();
  const { data, error } = await platform
    .from("platform_admins")
    .select("id, auth_user_id, email, display_name, role, is_active, page_permissions, mfa_required, last_login_at, created_at")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Could not load platform administrators: ${error.message}`);

  const users: PlatformAdminUserRow[] = (data ?? []).map((admin) => ({
    id: admin.id,
    authUserId: admin.auth_user_id,
    email: admin.email,
    displayName: admin.display_name,
    role: admin.role,
    isActive: admin.is_active,
    pagePermissions: normalizePlatformAdminPages(admin.page_permissions),
    mfaRequired: admin.mfa_required,
    lastLoginAt: admin.last_login_at,
    createdAt: admin.created_at,
  }));

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <Link href="/platform-admin" className="text-xs font-semibold text-blue-600 hover:text-blue-800">
              ← Platform Administration
            </Link>
            <h1 className="mt-1 text-xl font-bold text-slate-950">Platform Admin Users</h1>
            <p className="mt-1 text-sm text-slate-500">Invite administrators and manage their role and access.</p>
          </div>
          <PlatformAdminSignOutButton />
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <PlatformAdminUsersView
          key={users.map((user) => `${user.id}:${user.role}:${user.isActive}:${user.pagePermissions.join(",")}`).join("|")}
          initialUsers={users}
          currentAdminId={currentAdmin.id}
          currentUserId={currentAdmin.userId}
        />
      </div>
    </main>
  );
}
