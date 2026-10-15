"use client";

import { AlertTriangle } from "lucide-react";
import type { RoleDefinition } from "../types";

interface ApprovalMatrixTabProps {
  roles: RoleDefinition[];
  canManage: boolean;
}

export function ApprovalMatrixTab({ canManage }: ApprovalMatrixTabProps) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/30">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div>
          <h2 className="text-sm font-bold text-ink-900 dark:text-white">
            Approval matrix is unavailable
          </h2>
          <p className="mt-1 text-xs leading-5 text-ledger-600 dark:text-ledger-300">
            This matrix is not connected to persisted approval policies. Values previously shown here were examples and were not saved or enforced.
            {canManage
              ? " Configure supported approval permissions on each member's profile instead."
              : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
