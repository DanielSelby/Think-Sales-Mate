import { cookies } from "next/headers";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { can } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { BulkImportWizard } from "@/components/inventory/bulk-import-wizard";

export default async function BulkImportPage() {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;
  if (!can(context.role, "inventory.manage")) redirect("/inventory");

  return <BulkImportWizard />;
}