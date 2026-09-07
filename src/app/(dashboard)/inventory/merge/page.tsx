import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { can } from "@/lib/rbac";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { ProductMergeView } from "@/components/inventory/product-merge-view";
import { getProductsForMerge } from "./actions";

export const metadata = { title: "Merge Products · ThinkSales Pro" };

export default async function ProductMergePage({
  searchParams,
}: {
  searchParams?: { ids?: string };
}) {
  const context = await getCurrentOrgContext((await cookies()).get("active_org_id")?.value);
  if (!context) return null;
  if (!can(context.role, "inventory.manage")) redirect("/inventory");

  const ids = (searchParams?.ids ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const initialProducts = await getProductsForMerge([...new Set(ids)]);

  return <ProductMergeView initialProducts={initialProducts} currency={context.currency} />;
}
