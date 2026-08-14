import { cookies } from "next/headers";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { CompanyProfileForm } from "@/components/settings/company-profile-form";

export default async function CompanyProfilePage() {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;

  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("company_profile")
    .select("*")
    .eq("org_id", context.orgId)
    .maybeSingle();

  return (
    <CompanyProfileForm
      profile={profile}
      canManage={can(context.role, "settings.edit")}
    />
  );
}