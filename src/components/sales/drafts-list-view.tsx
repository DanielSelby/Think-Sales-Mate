"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Pencil, Trash2, FileText, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDateTime } from "@/lib/sales/format";
import { deleteDraftSale, type DraftSaleRow } from "@/app/(dashboard)/sales/actions";
import { cn } from "@/lib/utils";

const DOC_STATUS_LABEL: Record<DraftSaleRow["documentStatus"], string> = {
  draft: "Draft",
  quotation: "Quotation",
  proforma: "Proforma",
};

const DOC_STATUS_TONE: Record<DraftSaleRow["documentStatus"], "neutral" | "amber" | "signal"> = {
  draft: "neutral",
  quotation: "amber",
  proforma: "signal",
};

export function DraftsListView({ drafts, currency }: { drafts: DraftSaleRow[]; currency: string }) {
  const [rows, setRows] = useState(drafts);
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ message: string; tone: "success" | "error" } | null>(null);

  function handleDelete(id: string) {
    if (!confirm("Delete this draft? This can't be undone.")) return;
    setPendingId(id);
    startTransition(async () => {
      const result = await deleteDraftSale(id);
      setPendingId(null);
      if (!result.ok) {
        setNotice({ message: result.error ?? "Couldn't delete this draft.", tone: "error" });
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== id));
      setNotice({ message: "Draft deleted.", tone: "success" });
      setTimeout(() => setNotice(null), 3000);
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-ledger-400">Sales &gt; Drafts &amp; Quotations</p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-ink-900 dark:text-white">Drafts &amp; Quotations</h1>
          <p className="text-sm text-ledger-500 dark:text-ledger-400">
            {rows.length} saved draft{rows.length === 1 ? "" : "s"}, quotation{rows.length === 1 ? "" : "s"}, and proforma{rows.length === 1 ? "" : "s"}
          </p>
        </div>
        <Link
          href="/sales/new"
          className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-ink-900 px-4 text-sm font-medium text-white shadow-sm hover:bg-ink-950 dark:bg-white dark:text-ink-900"
        >
          New Sale
        </Link>
      </div>

      {notice && (
        <div
          className={cn(
            "flex items-center justify-between gap-2 rounded-md border px-4 py-2.5 text-sm",
            notice.tone === "success"
              ? "border-signal/30 bg-signal-soft text-ink-900 dark:bg-signal/10 dark:text-white"
              : "border-alert/30 bg-alert-soft text-alert"
          )}
        >
          {notice.message}
          <button onClick={() => setNotice(null)}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-card border border-ledger-100 bg-white shadow-card dark:border-ledger-700 dark:bg-ink-900">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-ledger-400">
            <FileText className="h-6 w-6" />
            No drafts, quotations, or proformas saved yet.
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-ledger-100 text-ledger-400 dark:border-ledger-700">
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-3 py-3 font-medium">Customer</th>
                <th className="px-3 py-3 font-medium">Date</th>
                <th className="px-3 py-3 text-right font-medium">Total</th>
                <th className="px-3 py-3 pr-4 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ledger-100 dark:divide-ledger-700">
              {rows.map((d) => {
                const { date } = formatDateTime(d.createdAt);
                return (
                  <tr key={d.id} className="hover:bg-ledger-50/60 dark:hover:bg-white/[0.03]">
                    <td className="px-4 py-3">
                      <Badge tone={DOC_STATUS_TONE[d.documentStatus]}>{DOC_STATUS_LABEL[d.documentStatus]}</Badge>
                    </td>
                    <td className="px-3 py-3 text-ink-900 dark:text-white">{d.customerName}</td>
                    <td className="px-3 py-3 text-ledger-600 dark:text-ledger-300">{date}</td>
                    <td className="px-3 py-3 text-right font-mono font-medium text-ink-900 dark:text-white">
                      {formatCurrency(d.total, currency)}
                    </td>
                    <td className="px-3 py-3 pr-4">
                      <div className="flex items-center justify-end gap-1 text-ledger-400">
                        <Link
                          href={`/sales/${d.id}/edit`}
                          className="rounded-md p-1.5 hover:bg-ledger-100 hover:text-ink-900 dark:hover:bg-white/[0.06] dark:hover:text-white"
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Link>
                        <button
                          onClick={() => handleDelete(d.id)}
                          disabled={isPending && pendingId === d.id}
                          className="rounded-md p-1.5 hover:bg-alert-soft hover:text-alert disabled:opacity-40"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}