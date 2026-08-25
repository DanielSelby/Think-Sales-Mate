import { cookies } from "next/headers";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { can } from "@/lib/rbac";
import { CompanyProfileForm } from "@/components/settings/company-profile-form";
import { getCompanyProfile } from "@/app/(dashboard)/settings/company/actions";

export const metadata = { title: "Company Information · SalesMate ERP" };

export default async function CompanySettingsPage() {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const profile = await getCompanyProfile(context.orgId);

  return <CompanyProfileForm profile={profile} canManage={can(context.role, "settings.edit")} />;
}