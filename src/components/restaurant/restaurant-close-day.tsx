"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { closeRestaurantBusinessDay } from "@/app/(dashboard)/restaurant/actions";
import { formatMoney } from "@/lib/currency";
import type { Database, Json } from "@/types/database";

type Closing = Database["public"]["Tables"]["restaurant_day_closings"]["Row"];
type Location = { id: string; name: string };
type Method = "cash" | "card" | "mobile_money" | "other";
const methods: Array<{ key: Method; label: string }> = [
  { key: "cash", label: "Cash" },
  { key: "card", label: "Card" },
  { key: "mobile_money", label: "Mobile money" },
  { key: "other", label: "Other" },
];

function amountFromJson(value: Json, method: Method) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return 0;
  const amount = value[method];
  return typeof amount === "number" ? amount : 0;
}

function money(value: number, currency: string) {
  return formatMoney(value, currency);
}

export function RestaurantCloseDay({
  businessDate,
  locations,
  closings,
  currency,
  canClose,
}: {
  businessDate: string;
  locations: Location[];
  closings: Closing[];
  currency: string;
  canClose: boolean;
}) {
  const router = useRouter();
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [counted, setCounted] = useState<Record<Method, string>>({ cash: "0", card: "0", mobile_money: "0", other: "0" });
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const closing = closings.find((entry) => entry.location_id === locationId && entry.business_date === businessDate);

  function closeDay(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const countedByMethod = {
      cash: Number(counted.cash),
      card: Number(counted.card),
      mobile_money: Number(counted.mobile_money),
      other: Number(counted.other),
    };
    startTransition(async () => {
      try {
        await closeRestaurantBusinessDay({ locationId, businessDate, countedByMethod });
        router.refresh();
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : "Could not close the Restaurant day.");
      }
    });
  }

  return <main className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
    <header>
      <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">Restaurant operations</p>
      <h1 className="mt-1 text-2xl font-bold text-slate-950">Restaurant close of day</h1>
      <p className="mt-1 text-sm text-slate-600">Compare recorded payment totals with counted tender for {businessDate}. This reconciliation is separate from the ERP physical-cash close.</p>
    </header>
    <label className="block max-w-sm text-xs font-semibold text-slate-600">Branch
      <select value={locationId} onChange={(event) => setLocationId(event.target.value)} className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm">
        {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
      </select>
    </label>
    {closing ? <section className="space-y-3 rounded-xl border bg-white p-4">
      <div><h2 className="font-bold text-slate-950">Day closed</h2><p className="text-xs text-slate-500">Closed {new Date(closing.closed_at).toLocaleString()}. This record is immutable.</p></div>
      <TenderTable closing={closing} currency={currency} />
    </section> : canClose ? <form onSubmit={closeDay} className="space-y-4 rounded-xl border bg-white p-4">
      <div><h2 className="font-bold text-slate-950">Count tender and close the day</h2><p className="text-xs text-slate-500">Expected totals are calculated from Restaurant payment and refund records for this branch and date. Amounts are matched by tender.</p></div>
      <div className="grid gap-3 sm:grid-cols-2">
        {methods.map(({ key, label }) => <label key={key} className="text-xs font-semibold text-slate-600">{label} counted
          <input required type="number" min="0" step="0.01" value={counted[key]} onChange={(event) => setCounted((current) => ({ ...current, [key]: event.target.value }))} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" />
        </label>)}
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={isPending || !locationId} className="rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{isPending ? "Closing…" : "Close Restaurant day"}</button>
    </form> : <p className="rounded-xl border bg-white p-4 text-sm text-slate-600">You have read-only access to Restaurant day closing.</p>}
    {locations.length === 0 && <p className="rounded-xl border bg-white p-4 text-sm text-slate-600">No Restaurant branches are available to your account.</p>}
  </main>;
}

function TenderTable({ closing, currency }: { closing: Closing; currency: string }) {
  return <div className="overflow-x-auto rounded-lg border">
    <table className="w-full min-w-[500px] text-left text-sm">
      <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Tender</th><th className="p-3 text-right">Expected</th><th className="p-3 text-right">Counted</th><th className="p-3 text-right">Variance</th></tr></thead>
      <tbody className="divide-y">{methods.map(({ key, label }) => {
        const variance = amountFromJson(closing.variance_by_method, key);
        return <tr key={key}><td className="p-3">{label}</td><td className="p-3 text-right">{money(amountFromJson(closing.expected_by_method, key), currency)}</td><td className="p-3 text-right">{money(amountFromJson(closing.counted_by_method, key), currency)}</td><td className={`p-3 text-right font-semibold ${variance === 0 ? "" : variance < 0 ? "text-red-700" : "text-amber-700"}`}>{money(variance, currency)}</td></tr>;
      })}</tbody>
    </table>
  </div>;
}
