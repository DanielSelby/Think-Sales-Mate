import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { can } from "@/lib/rbac";
import { getDuplicateSettings } from "@/app/(dashboard)/inventory/duplicate-actions";
import { DuplicateSettingsForm } from "@/components/inventory/duplicate-settings-form";

export const metadata = { title: "Duplicate Product Control · ThinkSales" };

export default async function DuplicateProductSettingsPage() {
  const context = await getCurrentOrgContext((await cookies()).get("active_org_id")?.value);
  if (!context) redirect("/onboarding");
  if (!can(context.role, "settings.view")) redirect("/dashboard");
  return <DuplicateSettingsForm settings={await getDuplicateSettings()} canManage={can(context.role, "settings.edit")} />;
}
