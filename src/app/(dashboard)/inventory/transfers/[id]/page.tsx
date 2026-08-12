import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Circle } from "lucide-react";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { can } from "@/lib/rbac";
import { Card, CardContent } from "@/components/ui/card";
import { TransferStatusBadge } from "@/components/inventory/transfer-status-badge";
import { TransferStatusActions } from "@/components/inventory/transfer-status-actions";

function formatMoney(value: number) {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export default async function StockTransferDetailPage({ params }: { params: { id: string } }) {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const supabase = await createClient();
  const { data: transfer } = await supabase
    .from("stock_transfers")
    .select(
      "id, transfer_number, reference_no, status, reason, notes, created_at, completed_at, created_by, from:from_location_id(name), to:to_location_id(name)"
    )
    .eq("id", params.id)
    .eq("org_id", context.orgId)
    .single();

  if (!transfer) notFound();

  const from = Array.isArray(transfer.from) ? transfer.from[0] : transfer.from;
  const to = Array.isArray(transfer.to) ? transfer.to[0] : transfer.to;

  const { data: items } = await supabase
    .from("stock_transfer_items")
    .select("id, quantity, unit_cost, products(name, sku)")
    .eq("transfer_id", transfer.id);

  let requestedByEmail = "—";
  if (transfer.created_by) {
    const admin = createAdminClient();
    const { data } = await admin.auth.admin.getUserById(transfer.created_by);
    requestedByEmail = data.user?.email ?? "—";
  }

  const totalValue = (items ?? []).reduce((sum, i) => sum + i.quantity * i.unit_cost, 0);

  // An honest timeline reflecting this app's actual 3-stage lifecycle —
  // created (in transit) then either completed or cancelled — rather than
  // a fabricated multi-stage approval workflow this schema doesn't have.
  const timelineSteps = [
    { label: "Created", by: requestedByEmail, at: transfer.created_at, done: true },
    {
      label: transfer.status === "cancelled" ? "Cancelled" : "Completed",
      by: transfer.status === "completed" || transfer.status === "cancelled" ? requestedByEmail : null,
      at: transfer.completed_at,
      done: transfer.status === "completed" || transfer.status === "cancelled"
    }
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href="/inventory/transfers"
          className="inline-flex items-center gap-1 text-sm text-ledger-500 hover:text-ink-900 dark:hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to stock transfer history
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="font-display text-2xl font-semibold text-ink-900 dark:text-white">
            {transfer.reference_no || `Transfer #${String(transfer.transfer_number).padStart(4, "0")}`}
          </h1>
          <TransferStatusBadge status={transfer.status} />
        </div>
        <p className="text-sm text-ledger-500 dark:text-ledger-400">
          {from?.name ?? "Unknown"} → {to?.name ?? "Unknown"} · {new Date(transfer.created_at).toLocaleString()}
          {transfer.reason ? ` · ${transfer.reason}` : ""}
        </p>
        <p className="text-xs text-ledger-400">Requested by {requestedByEmail}</p>
      </div>

      {can(context.role, "inventory.manage") && (
        <TransferStatusActions transferId={transfer.id} status={transfer.status} />
      )}

      <Card>
        <CardContent className="pt-5">
          <table className="w-full text-sm">
            <thead className="border-b border-ledger-100 text-left text-xs font-medium uppercase tracking-wide text-ledger-400 dark:border-ledger-700">
              <tr>
                <th className="pb-2">Item</th>
                <th className="pb-2 text-right">Qty</th>
                <th className="pb-2 text-right">Unit cost</th>
                <th className="pb-2 text-right">Total value</th>
              </tr>
            </thead>
            <tbody>
              {(items ?? []).map((item) => {
                const product = Array.isArray(item.products) ? item.products[0] : item.products;
                return (
                  <tr key={item.id} className="border-b border-ledger-50 last:border-0 dark:border-ledger-700/50">
                    <td className="py-2 text-ink-900 dark:text-white">
                      {product?.name ?? "Deleted product"}
                      <span className="ml-2 font-mono text-xs text-ledger-400">{product?.sku}</span>
                    </td>
                    <td className="py-2 text-right figure">{item.quantity}</td>
                    <td className="py-2 text-right figure text-ledger-500 dark:text-ledger-400">${formatMoney(item.unit_cost)}</td>
                    <td className="py-2 text-right figure font-medium text-ink-900 dark:text-white">
                      ${formatMoney(item.unit_cost * item.quantity)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="mt-3 flex items-center justify-between border-t border-ledger-100 pt-3 dark:border-ledger-700">
            <span className="text-sm font-medium text-ledger-600 dark:text-ledger-300">Total value</span>
            <span className="figure text-lg font-semibold text-ink-900 dark:text-white">${formatMoney(totalValue)}</span>
          </div>

          {transfer.notes && (
            <div className="mt-4 border-t border-ledger-100 pt-4 dark:border-ledger-700">
              <p className="text-xs font-medium uppercase tracking-wide text-ledger-400">Notes</p>
              <p className="mt-1 text-sm text-ledger-600 dark:text-ledger-300">{transfer.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Timeline</h2>
          <ul className="mt-3 space-y-3">
            {timelineSteps.map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                {step.done ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-signal" />
                ) : (
                  <Circle className="mt-0.5 h-4 w-4 shrink-0 text-ledger-300" />
                )}
                <div>
                  <p className={step.done ? "text-sm font-medium text-ink-900 dark:text-white" : "text-sm text-ledger-400"}>
                    {step.label}
                  </p>
                  {step.at && (
                    <p className="text-xs text-ledger-400">
                      {new Date(step.at).toLocaleString()}
                      {step.by ? ` · ${step.by}` : ""}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
