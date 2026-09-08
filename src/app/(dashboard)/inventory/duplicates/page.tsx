import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AlertTriangle, Barcode, GitMerge, Search, Tag, type LucideIcon } from "lucide-react";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { can } from "@/lib/rbac";
import { getDuplicateReviewRows } from "@/app/(dashboard)/inventory/duplicate-actions";

export const metadata = { title: "Duplicate Review Center · ThinkSales" };

export default async function DuplicateReviewCenterPage() {
  const context = await getCurrentOrgContext((await cookies()).get("active_org_id")?.value);
  if (!context) redirect("/onboarding");
  if (!can(context.role, "inventory.view")) redirect("/dashboard");
  const rows = await getDuplicateReviewRows();
  const exact = rows.filter((row) => row.type === "exact");
  const similar = rows.filter((row) => row.type === "similar");
  const barcodes = rows.filter((row) => row.type === "barcode");
  return <div className="mx-auto max-w-7xl space-y-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs text-ledger-400">Products <span className="mx-1">›</span> Duplicate Review Center</p><h1 className="mt-1 font-display text-2xl font-bold text-ink-900 dark:text-white">Duplicate Review Center</h1><p className="text-sm text-ledger-500">Review exact matches, similar names, and duplicate barcodes before they affect reports.</p></div><Link href="/inventory/merge" className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white"><GitMerge className="h-4 w-4" /> Merge products</Link></div><div className="grid gap-3 sm:grid-cols-3"><Summary icon={AlertTriangle} label="Exact duplicates" value={exact.length} color="bg-red-50 text-red-600" /><Summary icon={Search} label="Similar products" value={similar.length} color="bg-amber-50 text-amber-600" /><Summary icon={Barcode} label="Duplicate barcodes" value={barcodes.length} color="bg-purple-50 text-purple-600" /></div><div className="overflow-hidden rounded-2xl border border-ledger-100 bg-white shadow-card dark:border-ledger-700 dark:bg-ink-900"><div className="flex gap-2 border-b border-ledger-100 p-4 text-xs dark:border-ledger-700"><span className="rounded-lg bg-red-50 px-3 py-2 font-semibold text-red-700">Exact Duplicates ({exact.length})</span><span className="rounded-lg px-3 py-2 text-ledger-500">Similar Products ({similar.length})</span><span className="rounded-lg px-3 py-2 text-ledger-500">Duplicate Barcodes ({barcodes.length})</span><span className="rounded-lg px-3 py-2 text-ledger-500">Brand + Model</span></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-ledger-50 text-[10px] uppercase tracking-wide text-ledger-500 dark:bg-ink-950"><tr><th className="px-5 py-3">Products</th><th className="px-3 py-3">SKU</th><th className="px-3 py-3">Brand</th><th className="px-3 py-3">Similarity</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Actions</th></tr></thead><tbody className="divide-y divide-ledger-100 dark:divide-ledger-700">{rows.map((row) => <tr key={row.id}><td className="px-5 py-4 font-semibold">{row.name}</td><td className="px-3 py-4 text-xs text-ledger-500">{row.sku}</td><td className="px-3 py-4 text-xs">{row.brand ?? "—"}</td><td className="px-3 py-4"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${row.score === 100 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{row.score}%</span></td><td className="px-3 py-4 text-xs text-ledger-500">{row.type === "barcode" ? "Duplicate barcode" : "Needs review"}</td><td className="px-3 py-4"><div className="flex gap-2"><Link href="/inventory/merge" className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-700"><GitMerge className="h-3 w-3" /> Merge</Link><button className="rounded-lg border border-ledger-200 px-2 py-1 text-xs text-ledger-500">Ignore</button></div></td></tr>)}</tbody></table></div>{!rows.length && <div className="p-12 text-center text-sm text-ledger-500"><Tag className="mx-auto mb-2 h-6 w-6 text-ledger-300" />No duplicate candidates found.</div>}</div></div>;
}

function Summary({ icon: Icon, label, value, color }: { icon: LucideIcon; label: string; value: number; color: string }) {
  return <div className="rounded-2xl border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900"><div className="flex items-center gap-3"><span className={`rounded-xl p-2 ${color}`}><Icon className="h-5 w-5" /></span><div><p className="text-xs text-ledger-500">{label}</p><p className="text-2xl font-bold">{value}</p></div></div></div>;
}
