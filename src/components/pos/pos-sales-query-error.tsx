import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function PosSalesQueryError({
  title = "POS sales query failed",
  code,
  message,
  migrationRequired = false,
}: {
  title?: string;
  code?: string | null;
  message: string;
  migrationRequired?: boolean;
}) {
  return (
    <main className="mx-auto max-w-3xl py-16">
      <Card>
        <CardContent className="space-y-3 p-8 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <h1 className="font-display text-xl font-semibold text-ink-900 dark:text-white">{title}</h1>
          <p className="break-words text-sm text-ledger-600 dark:text-ledger-300">{message}</p>
          {code && <p className="text-xs text-ledger-400">Database error code: {code}</p>}
          {migrationRequired && (
            <p className="text-sm text-ledger-500 dark:text-ledger-400">
              Apply <code className="rounded bg-ledger-100 px-1 py-0.5 dark:bg-ink-800">20261013180000_pos_list_rpc_and_refund_accounts.sql</code> to Supabase, then refresh.
            </p>
          )}
          <Link href="/pos/list?retry=1" className="inline-flex h-10 items-center justify-center rounded-md bg-signal px-4 text-sm font-semibold text-white hover:brightness-95">
            Retry
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
