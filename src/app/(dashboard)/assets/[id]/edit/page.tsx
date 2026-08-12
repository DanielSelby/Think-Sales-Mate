import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { ArrowLeft } from "lucide-react";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { AssetForm } from "@/components/assets/asset-form";
import { updateAsset } from "@/app/(dashboard)/assets/actions";

export default async function EditAssetPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const supabase = await createClient();
  const { data: asset } = await supabase
    .from("assets")
    .select("id, name, category, purchase_date, purchase_cost, current_value, status, location, notes")
    .eq("id", params.id)
    .eq("org_id", context.orgId)
    .single();

  if (!asset) notFound();

  const boundUpdate = updateAsset.bind(null, asset.id);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/assets" className="inline-flex items-center gap-1 text-sm text-ledger-500 hover:text-ink-900 dark:hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to assets
        </Link>
        <h1 className="mt-2 font-display text-2xl font-semibold text-ink-900 dark:text-white">Edit {asset.name}</h1>
      </div>

      <AssetForm action={boundUpdate} initialValues={asset} error={searchParams.error} submitLabel="Save changes" />
    </div>
  );
}
