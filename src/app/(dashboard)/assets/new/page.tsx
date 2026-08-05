import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AssetForm } from "@/components/assets/asset-form";
import { createAsset } from "@/app/(dashboard)/assets/actions";

export default function NewAssetPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/assets" className="inline-flex items-center gap-1 text-sm text-ledger-500 hover:text-ink-900 dark:hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to assets
        </Link>
        <h1 className="mt-2 font-display text-2xl font-semibold text-ink-900 dark:text-white">Add asset</h1>
      </div>

      <AssetForm action={createAsset} error={searchParams.error} submitLabel="Add asset" />
    </div>
  );
}