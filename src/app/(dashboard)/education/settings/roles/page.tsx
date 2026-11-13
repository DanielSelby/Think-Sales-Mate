import { redirect } from "next/navigation";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { isOrganizationSuperAdminMember } from "@/lib/organizations/member-access";
import { getProductAppPath } from "@/lib/product-app-routes";

export default async function EducationRolesPage() {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!isOrganizationSuperAdminMember({
    role: context.role,
    userId: context.userId,
    accessPermissions: context.accessPermissions,
  })) {
    redirect("/dashboard?accessDenied=think-education.roles");
  }
  redirect(`${getProductAppPath("think-education", "/settings/organization")}?educationTab=product_permissions&educationProduct=think-education`);
}
