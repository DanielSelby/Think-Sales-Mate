"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { updateTransferStatus } from "@/app/(dashboard)/inventory/transfers/actions";
import type { TransferStatus } from "@/types/database";

export function TransferStatusActions({
  transferId,
  status,
  canManage,
  canReceive,
}: {
  transferId: string;
  status: TransferStatus;
  canManage: boolean;
  canReceive: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ kind: "success" | "warning" | "error"; text: string } | null>(null);

  function handleUpdate(next: TransferStatus) {
    setNotice(null);
    startTransition(() => {
      updateTransferStatus(transferId, next).then((result) => {
        if (result?.error) setNotice({ kind: "error", text: result.error });
        else {
          setNotice(result.warning
            ? { kind: "warning", text: result.warning }
            : { kind: "success", text: `Transfer ${next.replace("_", " ")} successfully.` });
          window.setTimeout(() => window.location.reload(), 700);
        }
      }).catch(() => setNotice({ kind: "error", text: "Unable to update the transfer. Please try again." }));
    });
  }

  if (status === "completed" || status === "cancelled" || status === "received") return null;

  const noticeStyle = notice?.kind === "success"
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : notice?.kind === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-red-200 bg-red-50 text-red-800";

  return (
    <div className="space-y-3">
      {notice && <div role="status" className={`rounded-xl border px-4 py-3 text-sm font-semibold shadow-sm ${noticeStyle}`}>{notice.text}</div>}
      <div className="flex gap-2">
      {canManage && status === "pending" && (
        <Button size="sm" variant="outline" disabled={isPending} onClick={() => handleUpdate("in_transit")}>
          Mark in transit
        </Button>
      )}
      {(status === "pending" || status === "in_transit") && canReceive && (
        <Button size="sm" disabled={isPending} onClick={() => handleUpdate("completed")}>
          Receive Stock (Complete)
        </Button>
      )}
      {canManage && (
        <Button size="sm" variant="destructive" disabled={isPending} onClick={() => handleUpdate("cancelled")}>
          Cancel transfer
        </Button>
      )}
      </div>
    </div>
  );
}