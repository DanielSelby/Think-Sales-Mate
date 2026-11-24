"use client";

import Link from "next/link";
import { useState } from "react";
import { getProductAppPath } from "@/lib/product-app-routes";

type PaymentRecord = {
  id: string;
  amountLabel: string;
  payment_method: string;
  reference: string | null;
  created_at: string;
};

export function EducationFeePaymentHistory({
  chargeId,
  initialCount,
  canPrintReceipt,
}: {
  chargeId: string;
  initialCount: number;
  canPrintReceipt: boolean;
}) {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [totalCount, setTotalCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadMore = async () => {
    if (loading || payments.length >= totalCount) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/education/finance/charges/${encodeURIComponent(chargeId)}/payments?offset=${payments.length}`,
        { cache: "no-store" },
      );
      const payload = await response.json() as { payments?: PaymentRecord[]; totalCount?: number; error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not load payment history.");
      setPayments((current) => [...current, ...(payload.payments ?? [])]);
      setTotalCount(payload.totalCount ?? 0);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load payment history.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <details
      className="text-sm"
      onToggle={(event) => {
        if (event.currentTarget.open && payments.length === 0 && !loading && !error) void loadMore();
      }}
    >
      <summary className="cursor-pointer font-medium text-blue-800">Payment history ({totalCount})</summary>
      {payments.length > 0 && <ul className="mt-2 space-y-2 pl-4">
        {payments.map((payment) => <li key={payment.id} className="flex flex-wrap justify-between gap-2 text-slate-600">
          <span>
            {new Date(payment.created_at).toLocaleString()} · {payment.payment_method.replace("_", " ")}
            {payment.reference ? ` · ${payment.reference}` : ""}
          </span>
          <span className="flex items-center gap-3">
            <span className="font-medium text-slate-800">{payment.amountLabel} · Receipt {payment.id.toUpperCase()}</span>
            {canPrintReceipt && <Link
              href={getProductAppPath("think-education", `/finance/receipts/${payment.id}`)}
              className="font-semibold text-blue-700 hover:text-blue-900 print:hidden"
            >Open receipt</Link>}
          </span>
        </li>)}
      </ul>}
      {loading && <p role="status" className="mt-2 text-slate-500">Loading payment history…</p>}
      {error && <div role="alert" className="mt-2 flex items-center gap-3 text-rose-700">
        <span>{error}</span>
        <button type="button" onClick={() => void loadMore()} className="font-semibold underline">Retry</button>
      </div>}
      {payments.length < totalCount && !loading && !error && <button
        type="button"
        onClick={() => void loadMore()}
        className="mt-2 font-semibold text-blue-700 hover:text-blue-900"
      >Load more</button>}
    </details>
  );
}
