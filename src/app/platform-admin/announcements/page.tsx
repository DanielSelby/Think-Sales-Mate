import { redirect } from "next/navigation";
import { getPlatformAdmin, platformRoleCan } from "@/lib/platform-auth";
import { platformRoleCanAccessPage } from "@/lib/platform-admin-pages";
import { createPlatformAdminClient } from "@/lib/supabase/platform-admin";
import type { PlatformHubAnnouncement } from "@/lib/supabase/platform-admin";
import AnnouncementManager from "./announcement-manager";

export const dynamic = "force-dynamic";

export default async function PlatformHubAnnouncementsPage() {
  const admin = await getPlatformAdmin();
  if (!admin) redirect("/platform-admin/login");
  if (!platformRoleCanAccessPage(admin.role, admin.page_permissions, "Announcements")) {
    redirect("/platform-admin");
  }

  const platform = createPlatformAdminClient();
  const [announcementResult, productResult] = await Promise.all([
    platform
      .from("platform_hub_announcements")
      .select("id, title, summary, link_url, product_slugs, status, published_at, expires_at, created_by, updated_by, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(100),
    platform
      .from("platform_products")
      .select("slug, name")
      .eq("is_published", true)
      .order("name"),
  ]);
  if (announcementResult.error) throw new Error(`Could not load announcements: ${announcementResult.error.message}`);
  if (productResult.error) throw new Error(`Could not load published products: ${productResult.error.message}`);

  const announcements: PlatformHubAnnouncement[] = announcementResult.data ?? [];
  const products = productResult.data ?? [];

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Platform Administration</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Product Hub Announcements</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Publish platform news, product updates, maintenance notices, and helpful guides to the Product Hub.
            Drafts and archived announcements are not shown to users.
          </p>
        </header>
        <AnnouncementManager
          announcements={announcements}
          products={products}
          canManage={platformRoleCan(admin.role, "manage_platform")}
        />
      </div>
    </main>
  );
}
