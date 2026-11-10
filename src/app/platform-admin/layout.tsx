import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getPlatformAdmin } from "@/lib/platform-auth";
import { ALL_PLATFORM_ADMIN_PAGES, normalizePlatformAdminPages } from "@/lib/platform-admin-pages";
import PlatformAdminNavigation from "./platform-admin-navigation";

export default async function PlatformAdminLayout({ children }: { children: React.ReactNode }) {
  if ((await headers()).get("x-platform-public") === "true") return children;
  const admin = await getPlatformAdmin();
  if (!admin) redirect("/platform-admin/login");
  const accessiblePages = admin.role === "platform_owner"
    ? ALL_PLATFORM_ADMIN_PAGES
    : normalizePlatformAdminPages(admin.page_permissions);
  const items = accessiblePages.map((page) => ({
    page,
    label: page === "registrations" ? "Registration Approvals"
      : page === "communication" ? "Communication Management"
        : page === "Announcements" ? "Product Hub Announcements"
        : page,
    href: page === "registrations" ? "/platform-admin/registrations"
      : page === "communication" ? "/platform-admin/communication"
        : page === "Announcements" ? "/platform-admin/announcements"
        : `/platform-admin?tab=${encodeURIComponent(page)}`,
  }));
  if (accessiblePages.includes("Feature Access")) {
    items.push({ page: "Feature Access", label: "Product Catalog", href: "/platform-admin/products" });
  }
  return (
    <div className="min-h-screen bg-slate-50 lg:pl-64">
      <PlatformAdminNavigation items={items} isPlatformOwner={admin.role === "platform_owner"} />
      {children}
    </div>
  );
}
