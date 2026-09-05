"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, ChevronRight, X } from "lucide-react";
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
}

export function StockRequestHistory({ requests, canApprove }: { requests: RequestRow[]; canApprove: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
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
        <table className="w-full text-left"><thead className="border-b border-ledger-100 text-[10px] uppercase tracking-wide text-ledger-400"><tr><th className="px-4 py-3">Request</th><th>From</th><th>Requesting Branch</th><th>Date</th><th>Qty</th><th>Status</th><th className="px-4" /></tr></thead>
          <tbody>{requests.map((request) => <tr key={request.id} className="border-b border-ledger-50 dark:border-ledger-800"><td className="px-4 py-3 font-semibold">{request.label}</td><td>{request.source}</td><td>{request.destination}</td><td>{new Date(request.createdAt).toLocaleDateString()}</td><td>{request.totalQuantity}</td><td><span className="rounded-full bg-ledger-100 px-2 py-1 capitalize dark:bg-ink-800">{request.status.replace("_", " ")}</span></td><td className="px-4">{canApprove && request.status === "pending_approval" && <span className="flex gap-1"><button disabled={isPending} onClick={() => decide(request.id, "approve")} className="rounded p-1 text-signal hover:bg-signal-soft" title="Approve"><Check className="h-4 w-4" /></button><button disabled={isPending} onClick={() => decide(request.id, "reject")} className="rounded p-1 text-alert hover:bg-alert-soft" title="Reject"><X className="h-4 w-4" /></button></span>}{request.transferId && <Link className="text-signal underline" href={`/inventory/transfers/${request.transferId}`}>Transfer</Link>}</td></tr>)}</tbody>
        </table>
        {!requests.length && <p className="p-8 text-center text-ledger-400">No stock requests found.</p>}
      </div>
    </div>
  );
}
