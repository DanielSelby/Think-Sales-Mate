"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setServiceStatusNotificationsEnabled } from "@/app/(dashboard)/service-center/actions";
import type { ServiceJobStatus } from "@/types/database";

export function ServiceStatusNotificationSettings({
  enabled,
  canManage,
  recentResults,
}: {
  enabled: boolean;
  canManage: boolean;
  recentResults: Array<{
    id: string;
    job_id: string;
    job_number: string;
    status: ServiceJobStatus;
    delivery_status: "pending" | "processing" | "sent" | "failed" | "skipped";
    result_message: string | null;
    created_at: string;
  }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function updateSetting(nextEnabled: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await setServiceStatusNotificationsEnabled(nextEnabled);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="service-status-notifications-heading" className="rounded-xl border border-ledger-200 bg-white p-4 dark:border-ledger-700 dark:bg-ink-900">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="service-status-notifications-heading" className="font-semibold text-ledger-900 dark:text-white">
            Automatic repair status messages
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-ledger-500 dark:text-ledger-400">
            Sends only for received, estimate-awaiting-approval, in-progress, awaiting-parts, ready-for-collection, and awaiting-payment status changes. Each repair also needs the customer&apos;s recorded channel opt-in and a configured provider. Only the customer&apos;s preferred channel is used; there is no fallback. Provider charges may apply.
          </p>
        </div>
        {canManage ? (
          <button
            type="button"
            aria-pressed={enabled}
            disabled={isPending}
            onClick={() => updateSetting(!enabled)}
            className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60 ${
              enabled ? "bg-emerald-700 hover:bg-emerald-800" : "bg-slate-700 hover:bg-slate-800"
            }`}
          >
            {isPending ? "Saving..." : enabled ? "Enabled — turn off" : "Disabled — turn on"}
          </button>
        ) : (
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
            enabled ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"
          }`}>
            {enabled ? "Enabled" : "Disabled"}
          </span>
        )}
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
      {canManage && recentResults.length > 0 && (
        <details className="mt-4 border-t border-ledger-200 pt-3 dark:border-ledger-700">
          <summary className="cursor-pointer text-sm font-medium text-ledger-700 dark:text-ledger-200">
            Recent automatic message results ({recentResults.length})
          </summary>
          <ul className="mt-3 space-y-2">
            {recentResults.map((result) => (
              <li key={result.id} className="rounded-lg bg-ledger-50 px-3 py-2 text-sm dark:bg-ink-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-ledger-800 dark:text-ledger-100">
                    {result.job_number} · {result.status.replaceAll("_", " ")}
                  </span>
                  <span className={`text-xs font-semibold ${
                    result.delivery_status === "sent" ? "text-emerald-700 dark:text-emerald-300"
                      : result.delivery_status === "failed" ? "text-red-700 dark:text-red-300"
                        : "text-ledger-500 dark:text-ledger-400"
                  }`}>
                    {result.delivery_status}
                  </span>
                </div>
                {result.result_message && (
                  <p className="mt-1 break-words text-xs text-ledger-600 dark:text-ledger-300">{result.result_message}</p>
                )}
                <time dateTime={result.created_at} className="mt-1 block text-xs text-ledger-500">
                  {new Date(result.created_at).toLocaleString()}
                </time>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
