import Link from "next/link";
import { cookies } from "next/headers";
import { Plus } from "lucide-react";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { AssetsTable, type AssetRow } from "@/components/assets/assets-table";

export default async function AssetsPage() {
  const activeOrgId = await (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("assets")
    .select("id, name, category, purchase_cost, current_value, status")
    .eq("org_id", context.orgId)
    .order("name");

  const assets: AssetRow[] = (rows ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    category: a.category,
    purchaseCost: a.purchase_cost,
    currentValue: a.current_value,
    status: a.status
  }));

  const canManage = can(context.role, "assets.manage");
  const totalValue = assets.reduce((sum, a) => sum + a.currentValue, 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900 dark:text-white">Assets</h1>
          <p className="text-sm text-ledger-500 dark:text-ledger-400">
            {assets.length} asset{assets.length === 1 ? "" : "s"} · ${totalValue.toFixed(2)} current value
          </p>
        </div>
        {canManage && (
          <Link href="/assets/new">
            <Button>
              <Plus className="h-4 w-4" />
              Add asset
            </Button>
          </Link>
        )}
      </div>

      <AssetsTable assets={assets} canManage={canManage} />
    </div>
  );
}