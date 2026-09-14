import { cookies } from "next/headers";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { AssetManagementView } from "@/components/assets/asset-management-view";
import type { AssetRow } from "@/components/assets/assets-table";

export default async function AssetsPage() {
  const activeOrgId = await (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("assets")
    .select("*")
    .eq("org_id", context.orgId)
    .order("name");

  const assets: AssetRow[] = (rows ?? []).map((a) => ({
    id: a.id,
    code: "asset_code" in a && typeof a.asset_code === "string" ? a.asset_code : "Pending code",
    name: a.name,
    category: a.category,
    purchaseCost: a.purchase_cost,
    currentValue: a.current_value,
    status: a.status,
    purchaseDate: a.purchase_date,
    location: a.location,
  }));

  const canManage = can(context.role, "assets.manage");
  return <div className="mx-auto max-w-[1600px]"><AssetManagementView assets={assets} canManage={canManage} currency={context.currency} /></div>;
}