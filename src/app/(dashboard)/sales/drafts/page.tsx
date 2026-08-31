import { cookies } from "next/headers";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { getDraftSales } from "@/app/(dashboard)/sales/actions";
import { DraftsListView } from "@/components/sales/drafts-list-view";

export const metadata = { title: "Drafts & Quotations · SalesMate ERP" };

export default async function DraftsPage() {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const drafts = await getDraftSales(context.orgId);

  return <DraftsListView drafts={drafts} currency={context.currency} />;
}