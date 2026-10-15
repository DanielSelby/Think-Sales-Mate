"use client";

import { AlertTriangle } from "lucide-react";

interface LoginSessionsTabProps {
  canManage: boolean;
}

export function LoginSessionsTab({ canManage }: LoginSessionsTabProps) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/30">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div>
          <h2 className="text-sm font-bold text-ink-900 dark:text-white">
            Session inventory is unavailable
          </h2>
          <p className="mt-1 text-xs leading-5 text-ledger-600 dark:text-ledger-300">
            The authentication provider does not supply the session details required to verify active sessions or revoke them from this page.
            {canManage ? " Session termination is disabled until it can be performed by the authentication service." : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
