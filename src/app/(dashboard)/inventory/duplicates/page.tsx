import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { GitMerge } from "lucide-react";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { can } from "@/lib/rbac";
import { getDuplicateReviewRows } from "@/app/(dashboard)/inventory/duplicate-actions";
import { DuplicateReviewCenter, DuplicateReviewSummary } from "@/components/inventory/duplicate-review-center";

export const metadata = { title: "Duplicate Review Center · ThinkSales" };

export default async function DuplicateReviewCenterPage() {
  const context = await getCurrentOrgContext((await cookies()).get("active_org_id")?.value);
  if (!context) redirect("/onboarding");
  if (!can(context.role, "inventory.view")) redirect("/dashboard");
  const rows = await getDuplicateReviewRows();
  return <div className="mx-auto max-w-7xl space-y-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs text-ledger-400">Products <span className="mx-1">›</span> Duplicate Review Center</p><h1 className="mt-1 font-display text-2xl font-bold text-ink-900 dark:text-white">Duplicate Review Center</h1><p className="text-sm text-ledger-500">Review exact matches, similar names, duplicate barcodes, and brand/model candidates.</p></div><Link href="/inventory/merge" className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white"><GitMerge className="h-4 w-4" /> Merge products</Link></div><DuplicateReviewSummary rows={rows} /><DuplicateReviewCenter rows={rows} /></div>;
}
