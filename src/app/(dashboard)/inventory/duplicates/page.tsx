import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { GitMerge, ScanSearch, ShieldCheck } from "lucide-react";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { can } from "@/lib/rbac";
import { getDuplicateReviewRows } from "@/app/(dashboard)/inventory/duplicate-actions";
import { DuplicateReviewCenter, DuplicateReviewSummary } from "@/components/inventory/duplicate-review-center";
import { ProductMergeView } from "@/components/inventory/product-merge-view";
import { getProductsForMerge } from "@/app/(dashboard)/inventory/merge/actions";
import { getDuplicateSettings } from "@/app/(dashboard)/inventory/duplicate-actions";
import { DuplicateSettingsForm } from "@/components/inventory/duplicate-settings-form";

export const metadata = { title: "Duplicate Review Center · ThinkSales" };

export default async function DuplicateReviewCenterPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string; ids?: string }>;
}) {
  const context = await getCurrentOrgContext((await cookies()).get("active_org_id")?.value);
  if (!context) redirect("/onboarding");
  if (!can(context.role, "inventory.view")) redirect("/dashboard");
  const rows = await getDuplicateReviewRows();
  const resolvedSearchParams = await searchParams;
  const activeTab = resolvedSearchParams?.tab === "merge"
    ? "merge"
    : resolvedSearchParams?.tab === "control"
      ? "control"
      : "duplicates";
  const ids = (resolvedSearchParams?.ids ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  const mergeProducts = activeTab === "merge" && can(context.role, "inventory.manage")
    ? await getProductsForMerge([...new Set(ids)])
    : [];
  const duplicateSettings = activeTab === "control" && can(context.role, "settings.view")
    ? await getDuplicateSettings()
    : null;

  return (
    <div className="mx-auto min-w-0 max-w-[1600px] space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-ledger-400">Products <span className="mx-1">›</span> Duplicate Review Center</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-ink-900 dark:text-white">Duplicate Review Center</h1>
          <p className="text-sm text-ledger-500">Review duplicate candidates and consolidate products from one workspace.</p>
        </div>
      </div>
      <div className="flex gap-1 border-b border-ledger-200">
        <Link href="/inventory/duplicates" className={`inline-flex items-center gap-2 rounded-lg border-b-2 px-4 py-2.5 text-sm font-semibold ${activeTab === "duplicates" ? "border-[var(--theme-primary)] bg-[var(--theme-primary-pale)] text-[var(--theme-primary)]" : "border-transparent text-ledger-500"}`}>
          <ScanSearch className="h-4 w-4" /> Duplicate Review
        </Link>
        {can(context.role, "inventory.manage") && (
          <Link href="/inventory/duplicates?tab=merge" className={`inline-flex items-center gap-2 rounded-lg border-b-2 px-4 py-2.5 text-sm font-semibold ${activeTab === "merge" ? "border-[var(--theme-primary)] bg-[var(--theme-primary-pale)] text-[var(--theme-primary)]" : "border-transparent text-ledger-500"}`}>
            <GitMerge className="h-4 w-4" /> Merge Products
          </Link>
        )}
        {can(context.role, "settings.view") && (
          <Link href="/inventory/duplicates?tab=control" className={`inline-flex items-center gap-2 rounded-lg border-b-2 px-4 py-2.5 text-sm font-semibold ${activeTab === "control" ? "border-[var(--theme-primary)] bg-[var(--theme-primary-pale)] text-[var(--theme-primary)]" : "border-transparent text-ledger-500"}`}>
            <ShieldCheck className="h-4 w-4" /> Duplicate Product Control
          </Link>
        )}
      </div>
      {activeTab === "merge" && can(context.role, "inventory.manage") ? (
        <ProductMergeView initialProducts={mergeProducts} currency={context.currency} />
      ) : activeTab === "control" && duplicateSettings ? (
        <DuplicateSettingsForm settings={duplicateSettings} canManage={can(context.role, "settings.edit")} />
      ) : (
        <>
          <DuplicateReviewSummary rows={rows} />
          <DuplicateReviewCenter rows={rows} />
        </>
      )}
    </div>
  );
}
