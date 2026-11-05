"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { issueServiceJobParts, returnServiceJobPart } from "@/app/(dashboard)/service-center/actions";
import type { ServiceJobStatus } from "@/types/database";

type PartsJob = {
  id: string;
  job_number: string;
  location_id: string;
  status: ServiceJobStatus;
};

type PartsProduct = {
  id: string;
  name: string;
  sku: string;
  unit: string;
  cost_price: number | null;
  stock_by_location: Array<{ location_id: string; quantity: number }>;
};

type PartMovement = {
  id: string;
  location_id: string;
  job_id: string;
  product_id: string;
  movement_type: "issued" | "returned";
  related_issue_id: string | null;
  quantity: number;
  returned_quantity: number;
  unit_cost: number;
  note: string | null;
  created_at: string;
  product_name: string;
  sku: string;
  job_number: string;
  remaining_quantity: number;
};

type PartLine = { id: number; productId: string; quantity: string };

const fieldClass = "w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 text-sm dark:border-ledger-600 dark:bg-ink-800";
const eligibleStatuses: ServiceJobStatus[] = ["approved", "in_progress", "awaiting_parts"];

export function ServiceJobPartsPanel({
  jobs,
  products,
  movements,
  canManageParts,
}: {
  jobs: PartsJob[];
  products: PartsProduct[];
  movements: PartMovement[];
  canManageParts: boolean;
}) {
  const router = useRouter();
  const eligibleJobs = jobs.filter((job) => eligibleStatuses.includes(job.status));
  const [selectedJobId, setSelectedJobId] = useState(eligibleJobs[0]?.id ?? "");
  const [lines, setLines] = useState<PartLine[]>([{ id: 1, productId: "", quantity: "1" }]);
  const [nextLineId, setNextLineId] = useState(2);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const selectedJob = eligibleJobs.find((job) => job.id === selectedJobId);
  const productsAtBranch = products.map((product) => ({
    ...product,
    available: product.stock_by_location.find((stock) => stock.location_id === selectedJob?.location_id)?.quantity ?? 0,
  }));
  const productById = new Map(products.map((product) => [product.id, product]));

  function updateLine(id: number, field: "productId" | "quantity", value: string) {
    setLines((current) => current.map((line) => line.id === id
      ? { ...line, [field]: value, ...(field === "productId" ? { quantity: "1" } : {}) }
      : line));
  }

  async function submitIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setError(null);
    setNotice(null);
    setIsPending(true);
    try {
      const result = await issueServiceJobParts(new FormData(form));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setLines([{ id: nextLineId, productId: "", quantity: "1" }]);
      setNextLineId((id) => id + 1);
      setNotice("Parts issued from this branch's inventory.");
      router.refresh();
    } catch (cause) {
      console.error("Service parts issue failed:", cause);
      setError("Parts could not be issued. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  async function submitReturn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setIsPending(true);
    try {
      const result = await returnServiceJobPart(new FormData(event.currentTarget));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice("Unused parts returned to the original branch's stock.");
      router.refresh();
    } catch (cause) {
      console.error("Service parts return failed:", cause);
      setError("The unused parts could not be returned. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-ledger-200 bg-ledger-50/60 p-5 dark:border-ledger-700 dark:bg-ink-950/40">
      <div>
        <h2 className="font-semibold text-ledger-900 dark:text-white">Repair parts and inventory</h2>
        <p className="mt-1 text-sm text-ledger-500 dark:text-ledger-400">
          Issued parts are deducted from the repair branch immediately. Unused quantities can be returned to that same branch.
        </p>
      </div>
      {(error || notice) && (
        <p role={error ? "alert" : "status"} className={`rounded-lg border px-3 py-2 text-sm ${error ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200" : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"}`}>
          {error ?? notice}
        </p>
      )}
      {canManageParts && (
        <form onSubmit={submitIssue} className="space-y-4 rounded-xl border border-ledger-200 bg-white p-4 dark:border-ledger-700 dark:bg-ink-900">
          <h3 className="font-medium text-ledger-900 dark:text-white">Issue parts to a repair job</h3>
          <label className="block space-y-1 text-sm text-ledger-700 dark:text-ledger-200">
            <span>Repair job</span>
            <select name="partsJobId" required value={selectedJobId} onChange={(event) => setSelectedJobId(event.target.value)} disabled={isPending || !eligibleJobs.length} className={fieldClass}>
              <option value="">Select an approved or active job</option>
              {eligibleJobs.map((job) => <option key={job.id} value={job.id}>{job.job_number}</option>)}
            </select>
          </label>
          <div className="space-y-3">
            {lines.map((line, index) => {
              const selectedProduct = productsAtBranch.find((product) => product.id === line.productId);
              return (
                <div key={line.id} className="grid gap-2 rounded-lg border border-ledger-200 p-3 dark:border-ledger-700 sm:grid-cols-[minmax(0,1fr)_120px_auto]">
                  <label className="space-y-1 text-xs text-ledger-600 dark:text-ledger-300">
                    <span>Part</span>
                    <select name="partProductId" required value={line.productId} onChange={(event) => updateLine(line.id, "productId", event.target.value)} disabled={isPending || !selectedJob} className={fieldClass}>
                      <option value="">Select a part</option>
                      {productsAtBranch.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name} · {product.sku} · {product.available} available
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1 text-xs text-ledger-600 dark:text-ledger-300">
                    <span>Quantity ({selectedProduct?.unit ?? "units"})</span>
                    <input name="partQuantity" type="number" min="1" max="10000" step="1" required value={line.quantity} onChange={(event) => updateLine(line.id, "quantity", event.target.value)} disabled={isPending || !selectedJob} className={fieldClass} />
                  </label>
                  <button type="button" aria-label={`Remove parts line ${index + 1}`} disabled={isPending || lines.length === 1} onClick={() => setLines((current) => current.filter((entry) => entry.id !== line.id))} className="self-end rounded-lg px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-40 dark:text-red-300 dark:hover:bg-red-950/30">
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <button type="button" disabled={isPending || lines.length >= 50} onClick={() => {
              setLines((current) => [...current, { id: nextLineId, productId: "", quantity: "1" }]);
              setNextLineId((id) => id + 1);
            }} className="rounded-lg border border-ledger-300 px-3 py-2 text-sm text-ledger-700 hover:bg-ledger-50 disabled:opacity-50 dark:border-ledger-600 dark:text-ledger-200 dark:hover:bg-ink-800">
              Add another part
            </button>
            <label className="min-w-[220px] flex-1 space-y-1 text-xs text-ledger-600 dark:text-ledger-300">
              <span>Note (optional)</span>
              <input name="partsIssueNote" maxLength={1000} disabled={isPending} className={fieldClass} />
            </label>
            <button type="submit" disabled={isPending || !selectedJob || !products.length} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">
              {isPending ? "Saving..." : "Issue parts"}
            </button>
          </div>
          {!products.length && <p className="text-sm text-ledger-500 dark:text-ledger-400">No active, stock-tracked inventory products are available to this branch.</p>}
        </form>
      )}
      {movements.length === 0 ? (
        <p className="rounded-lg bg-white px-4 py-8 text-center text-sm text-ledger-500 dark:bg-ink-900 dark:text-ledger-400">No parts have been issued to repair jobs.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ledger-200 bg-white dark:border-ledger-700 dark:bg-ink-900">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="bg-ledger-50 text-xs uppercase text-ledger-500 dark:bg-ink-800 dark:text-ledger-400">
              <tr>
                <th className="px-4 py-3 font-medium">Repair job</th>
                <th className="px-4 py-3 font-medium">Part</th>
                <th className="px-4 py-3 font-medium">Movement</th>
                <th className="px-4 py-3 font-medium">Quantity</th>
                <th className="px-4 py-3 font-medium">Date / note</th>
                {canManageParts && <th className="px-4 py-3 font-medium">Return unused</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-ledger-100 dark:divide-ink-800">
              {movements.map((movement) => {
                const product = productById.get(movement.product_id);
                return (
                  <tr key={movement.id} className="align-top">
                    <td className="px-4 py-3 font-medium text-ledger-900 dark:text-white">{movement.job_number}</td>
                    <td className="px-4 py-3 text-ledger-700 dark:text-ledger-200">{movement.product_name} <span className="text-xs text-ledger-500">{movement.sku}</span></td>
                    <td className="px-4 py-3 text-ledger-700 dark:text-ledger-200">{movement.movement_type === "issued" ? "Issued" : "Returned"}</td>
                    <td className="px-4 py-3 text-ledger-700 dark:text-ledger-200">{movement.quantity} {product?.unit ?? "units"}</td>
                    <td className="px-4 py-3 text-xs text-ledger-600 dark:text-ledger-300">
                      <p>{new Date(movement.created_at).toLocaleString()}</p>
                      <p className="mt-1">{movement.note ?? "No note"}</p>
                    </td>
                    {canManageParts && (
                      <td className="px-4 py-3">
                        {movement.movement_type === "issued" && movement.remaining_quantity > 0 ? (
                          <form onSubmit={submitReturn} className="flex min-w-[230px] flex-col gap-2">
                            <input type="hidden" name="partIssueId" value={movement.id} />
                            <span className="text-xs text-ledger-500 dark:text-ledger-400">{movement.remaining_quantity} not yet returned</span>
                            <input name="partReturnQuantity" type="number" min="1" max={movement.remaining_quantity} step="1" required disabled={isPending} aria-label={`Quantity to return for ${movement.product_name}`} className={fieldClass} />
                            <input name="partReturnNote" required maxLength={1000} disabled={isPending} aria-label={`Return reason for ${movement.product_name}`} placeholder="Return reason" className={fieldClass} />
                            <button type="submit" disabled={isPending} className="self-start rounded-lg bg-ledger-100 px-3 py-2 text-xs font-medium text-ledger-700 hover:bg-ledger-200 disabled:opacity-50 dark:bg-ink-700 dark:text-ledger-200 dark:hover:bg-ink-600">
                              Return to stock
                            </button>
                          </form>
                        ) : movement.movement_type === "issued" ? (
                          <span className="text-xs text-ledger-500 dark:text-ledger-400">Fully returned</span>
                        ) : null}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
