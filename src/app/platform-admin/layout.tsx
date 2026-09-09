import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getPlatformAdmin } from "@/lib/platform-auth";

export default async function PlatformAdminLayout({ children }: { children: React.ReactNode }) {
  if ((await headers()).get("x-platform-public") === "true") return children;
  const admin = await getPlatformAdmin();
  if (!admin) redirect("/platform-admin/login");
  return <div className="min-h-screen bg-slate-50">{children}</div>;
}
