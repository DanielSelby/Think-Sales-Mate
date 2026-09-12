"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Check, ChevronRight, Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { approveStockRequest, rejectStockRequest } from "@/app/(dashboard)/inventory/stock-requests/actions";

interface RequestRow {
  id: string;
  label: string;
  status: string;
  source: string;
  destination: string;
  createdAt: string;
  totalQuantity: number;
  transferId: string | null;
  items: { productName: string; sku: string | null; quantity: number; reason: string | null }[];
}

export function StockRequestHistory({ requests, canApprove, initialRequestId }: { requests: RequestRow[]; canApprove: boolean; initialRequestId?: string }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [viewing, setViewing] = useState<RequestRow | null>(null);
  useEffect(() => {
    if (initialRequestId) setViewing(requests.find((request) => request.id === initialRequestId) ?? null);
  }, [initialRequestId, requests]);
  const decide = (requestId: string, decision: "approve" | "reject") => {
    const reason = decision === "reject" ? window.prompt("Why is this request being rejected?") : undefined;
    if (decision === "reject" && !reason) return;
    startTransition(async () => {
      const result = decision === "approve" ? await approveStockRequest(requestId) : await rejectStockRequest(requestId, reason!);
      setMessage(result.error ?? `Request ${decision === "approve" ? "approved and transferred" : "rejected"}.`);
    });
  };
  return (
    <div className="space-y-4 text-xs">
      <div className="flex items-start justify-between">
        <div><p className="text-sm text-ledger-500">Inventory <ChevronRight className="inline h-3 w-3" /> Branch Stock Requests</p><h1 className="font-display text-2xl font-bold text-ink-900 dark:text-white">Request History</h1></div>
        <Link href="/inventory/stock-requests"><Button className="bg-signal text-white">New Request</Button></Link>
      </div>
      {message && <div className="rounded-xl border border-signal/20 bg-signal-soft px-4 py-3 text-signal">{message}</div>}
      <div className="overflow-hidden rounded-2xl border border-ledger-100 bg-white shadow-card dark:border-ledger-700 dark:bg-ink-900">
        <table className="w-full text-left"><thead className="border-b border-ledger-100 text-[10px] uppercase tracking-wide text-ledger-400"><tr><th className="px-4 py-3">Request</th><th>From</th><th>Requesting Branch</th><th>Date</th><th>Qty</th><th>Status</th><th className="px-4">Actions</th></tr></thead>
          <tbody>{requests.map((request) => <tr key={request.id} className="border-b border-ledger-50 dark:border-ledger-800"><td className="px-4 py-3 font-semibold">{request.label}</td><td>{request.source}</td><td>{request.destination}</td><td>{new Date(request.createdAt).toLocaleDateString()}</td><td>{request.totalQuantity}</td><td><span className="rounded-full bg-ledger-100 px-2 py-1 capitalize dark:bg-ink-800">{request.status.replace("_", " ")}</span></td><td className="px-4"><span className="flex items-center gap-1"><button onClick={() => setViewing(request)} className="rounded p-1 text-blue-600 hover:bg-blue-50" title="View request"><Eye className="h-4 w-4" /></button>{canApprove && request.status === "pending_approval" && <><button disabled={isPending} onClick={() => decide(request.id, "approve")} className="rounded p-1 text-signal hover:bg-signal-soft" title="Approve"><Check className="h-4 w-4" /></button><button disabled={isPending} onClick={() => decide(request.id, "reject")} className="rounded p-1 text-alert hover:bg-alert-soft" title="Reject"><X className="h-4 w-4" /></button></>}{request.transferId && <Link className="ml-1 text-signal underline" href={`/inventory/transfers/${request.transferId}`}>Transfer</Link>}</span></td></tr>)}</tbody>
        </table>
        {!requests.length && <p className="p-8 text-center text-ledger-400">No stock requests found.</p>}
      </div>
      {viewing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 p-4" role="dialog" aria-modal="true">
        <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl dark:bg-ink-900">
          <div className="flex items-start justify-between"><div><h2 className="font-display text-lg font-bold">{viewing.label}</h2><p className="text-sm text-ledger-500">{viewing.source} <ChevronRight className="inline h-3 w-3" /> {viewing.destination}</p></div><button onClick={() => setViewing(null)} className="rounded p-1 text-ledger-400 hover:bg-ledger-100" title="Close"><X className="h-4 w-4" /></button></div>
          <div className="mt-4 overflow-hidden rounded-xl border border-ledger-100 dark:border-ledger-700"><table className="w-full text-left text-sm"><thead className="bg-ledger-50 text-xs text-ledger-500 dark:bg-ink-950"><tr><th className="px-3 py-2">Product</th><th className="px-3 py-2">SKU</th><th className="px-3 py-2">Quantity</th><th className="px-3 py-2">Reason</th></tr></thead><tbody>{viewing.items.map((item) => <tr key={`${viewing.id}-${item.productName}-${item.sku}`} className="border-t border-ledger-100 dark:border-ledger-700"><td className="px-3 py-2">{item.productName}</td><td className="px-3 py-2">{item.sku ?? "—"}</td><td className="px-3 py-2">{item.quantity}</td><td className="px-3 py-2">{item.reason ?? "—"}</td></tr>)}</tbody></table></div>
        </div>
      </div>}
    </div>
  );
}
