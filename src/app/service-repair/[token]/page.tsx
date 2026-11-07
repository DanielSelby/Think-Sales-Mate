import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatCurrencyAmount } from "@/lib/currency";
import { hashServiceRepairPortalToken } from "@/lib/service-center/portal";
import { parseServiceRepairPortalView } from "@/lib/service-center/portal-view";
import { createAdminClient } from "@/lib/supabase/admin";
import { ServiceRepairPortalResponseForm } from "@/components/service-center/service-repair-portal-response-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Repair update",
  robots: { index: false, follow: false },
};

const STATUS_LABELS: Record<string, string> = {
  received: "Received",
  inspection: "Under inspection",
  awaiting_quotation: "Estimate in progress",
  awaiting_customer_approval: "Awaiting your response",
  approved: "Estimate approved",
  rejected: "Estimate declined",
  in_progress: "Repair in progress",
  awaiting_parts: "Waiting for parts",
  quality_check: "Quality check",
  ready_for_collection: "Ready for collection",
  awaiting_payment: "Awaiting payment",
  completed: "Repair completed",
  closed: "Collected",
  cancelled: "Cancelled",
};

export default async function ServiceRepairPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const tokenHash = hashServiceRepairPortalToken(token);
  if (!tokenHash) notFound();

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_service_repair_portal_view", {
    p_token_hash: tokenHash,
  });
  if (error) throw new Error(`Unable to load the customer repair portal: ${error.message}`);
  const view = parseServiceRepairPortalView(data);
  if (!view) notFound();

  const currency = { code: view.currency };
  const statusLabel = STATUS_LABELS[view.jobStatus]
    ?? view.jobStatus.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

  return (
    <main className="min-h-screen bg-ledger-50 px-4 py-8 dark:bg-ink-950 sm:py-12">
      <section className="mx-auto max-w-2xl rounded-2xl border border-ledger-200 bg-white p-5 shadow-sm dark:border-ledger-700 dark:bg-ink-900 sm:p-8">
        <p className="text-sm font-semibold text-sky-700 dark:text-sky-300">Repair update</p>
        <h1 className="mt-2 text-2xl font-semibold text-ledger-900 dark:text-white">
          Repair {view.jobNumber}
        </h1>
        <div className="mt-5 rounded-xl bg-ledger-50 p-4 dark:bg-ink-800">
          <p className="text-xs font-medium uppercase tracking-wide text-ledger-500">Current status</p>
          <p className="mt-1 font-medium text-ledger-900 dark:text-white">{statusLabel}</p>
        </div>

        <section aria-labelledby="repair-progress-heading" className="mt-7 border-t border-ledger-200 pt-6 dark:border-ledger-700">
          <h2 id="repair-progress-heading" className="text-lg font-semibold text-ledger-900 dark:text-white">
            Repair progress
          </h2>
          {view.statusHistory.length ? (
            <ol aria-label="Repair status history" className="mt-4 space-y-0">
              {view.statusHistory.map((event, index) => (
                <li key={`${event.status}-${event.occurredAt}-${index}`} className="relative flex gap-3 pb-5 last:pb-0">
                  {index < view.statusHistory.length - 1 && (
                    <span aria-hidden="true" className="absolute bottom-0 left-[0.4375rem] top-3 w-px bg-ledger-200 dark:bg-ledger-700" />
                  )}
                  <span
                    aria-hidden="true"
                    className={`relative mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-white dark:ring-ink-900 ${
                      index === view.statusHistory.length - 1 ? "bg-sky-600" : "bg-ledger-300 dark:bg-ledger-600"
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ledger-900 dark:text-white">
                      {STATUS_LABELS[event.status] ?? event.status.replaceAll("_", " ")}
                    </p>
                    <time dateTime={event.occurredAt} className="mt-0.5 block text-xs text-ledger-500">
                      {new Date(event.occurredAt).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </time>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-sm text-ledger-500">No repair progress updates are available yet.</p>
          )}
          <p className="mt-4 text-xs text-ledger-500">
            This timeline shows status updates only; private staff notes are not displayed.
          </p>
        </section>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <h2 className="text-sm font-semibold text-ledger-900 dark:text-white">Equipment</h2>
            <p className="mt-1 text-sm text-ledger-600 dark:text-ledger-300">
              {view.equipment
                ? [view.equipment.brand, view.equipment.model, view.equipment.type].filter(Boolean).join(" ")
                : "Equipment details not provided"}
            </p>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-ledger-900 dark:text-white">Reported issue</h2>
            <p className="mt-1 whitespace-pre-wrap text-sm text-ledger-600 dark:text-ledger-300">{view.reportedProblem}</p>
          </div>
        </div>

        <div className="mt-8 border-t border-ledger-200 pt-6 dark:border-ledger-700">
          <h2 className="text-lg font-semibold text-ledger-900 dark:text-white">
            Estimate v{view.quotation.version}
          </h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-ledger-500">
                <tr>
                  <th className="py-2 font-medium">Work or part</th>
                  <th className="py-2 text-right font-medium">Qty</th>
                  <th className="py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ledger-100 dark:divide-ledger-800">
                {view.quotation.items.map((item, index) => (
                  <tr key={`${item.description}-${index}`}>
                    <td className="py-2 pr-3 text-ledger-700 dark:text-ledger-200">{item.description}</td>
                    <td className="py-2 text-right text-ledger-600 dark:text-ledger-300">{item.quantity}</td>
                    <td className="py-2 text-right text-ledger-700 dark:text-ledger-200">
                      {formatCurrencyAmount(item.lineTotal, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-ledger-200 dark:border-ledger-700">
                <tr>
                  <th className="pt-3 text-left text-sm font-semibold text-ledger-900 dark:text-white" colSpan={2}>Subtotal</th>
                  <td className="pt-3 text-right font-medium text-ledger-900 dark:text-white">
                    {formatCurrencyAmount(view.quotation.subtotal, currency)}
                  </td>
                </tr>
                {view.quotation.taxRate > 0 && (
                  <tr>
                    <th className="pt-1 text-left text-xs font-normal text-ledger-500" colSpan={2}>
                      Tax ({view.quotation.taxRate}%)
                    </th>
                    <td className="pt-1 text-right text-xs text-ledger-600 dark:text-ledger-300">
                      {formatCurrencyAmount(view.quotation.taxAmount, currency)}
                    </td>
                  </tr>
                )}
                <tr>
                  <th className="pt-2 text-left text-base font-semibold text-ledger-900 dark:text-white" colSpan={2}>Total</th>
                  <td className="pt-2 text-right text-base font-semibold text-ledger-900 dark:text-white">
                    {formatCurrencyAmount(view.quotation.total, currency)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          {view.quotation.notes && (
            <p className="mt-4 whitespace-pre-wrap rounded-lg bg-ledger-50 p-3 text-sm text-ledger-600 dark:bg-ink-800 dark:text-ledger-300">
              {view.quotation.notes}
            </p>
          )}
        </div>

        {view.canRespond ? (
          <ServiceRepairPortalResponseForm token={token} />
        ) : (
          <p className="mt-6 rounded-lg border border-ledger-200 bg-ledger-50 p-4 text-sm text-ledger-600 dark:border-ledger-700 dark:bg-ink-800 dark:text-ledger-300">
            This link is view-only. Contact the service center if you need to discuss this estimate or repair.
          </p>
        )}
        <p className="mt-5 text-xs text-ledger-500">
          This private link expires on {new Date(view.expiresAt).toLocaleDateString()}.
          Anyone with the link can view this repair, so please do not forward it.
        </p>
      </section>
    </main>
  );
}
