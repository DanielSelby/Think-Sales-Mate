"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Eye, Check, X, Trash2, Loader2, Download } from "lucide-react";
import { approveLeaveRequest, rejectLeaveRequest, deleteLeaveRequest } from "@/app/(dashboard)/hrm/leave/actions";
import type { LeaveStatus } from "@/types/database";

interface LeaveRowMenuProps {
  requestId: string;
  status: LeaveStatus;
  onNotice: (message: string, tone?: "success" | "error") => void;
}

export function LeaveRowMenu({ requestId, status, onNotice }: LeaveRowMenuProps) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();

  function run(action: () => Promise<{ ok: boolean; error?: string }>, message: string) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) return onNotice(result.error ?? "Something went wrong.", "error");
      onNotice(message);
      router.refresh();
    });
  }

  if (isPending) {
    return <div className="flex justify-end"><Loader2 className="h-4 w-4 animate-spin text-ledger-400" /></div>;
  }

  return (
    <div className="flex items-center justify-end gap-1 text-ledger-400">
      <button className="rounded-md p-1.5 hover:bg-ledger-100 hover:text-ink-900 dark:hover:bg-white/[0.06] dark:hover:text-white" title="View">
        <Eye className="h-4 w-4" />
      </button>
      {status === "pending" && (
        <>
          <button onClick={() => run(() => approveLeaveRequest(requestId), "Leave approved")} className="rounded-md p-1.5 text-signal hover:bg-signal-soft" title="Approve">
            <Check className="h-4 w-4" />
          </button>
          <button onClick={() => run(() => rejectLeaveRequest(requestId), "Leave rejected")} className="rounded-md p-1.5 text-alert hover:bg-alert-soft" title="Reject">
            <X className="h-4 w-4" />
          </button>
        </>
      )}
      {status === "approved" && (
        <button className="rounded-md p-1.5 hover:bg-ledger-100 hover:text-ink-900 dark:hover:bg-white/[0.06] dark:hover:text-white" title="Download">
          <Download className="h-4 w-4" />
        </button>
      )}
      <button onClick={() => run(() => deleteLeaveRequest(requestId), "Leave request deleted")} className="rounded-md p-1.5 text-alert/70 hover:bg-alert-soft hover:text-alert" title="Delete">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}