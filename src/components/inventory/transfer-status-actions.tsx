"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { updateTransferStatus } from "@/app/(dashboard)/inventory/transfers/actions";
import type { TransferStatus } from "@/types/database";

export function TransferStatusActions({ transferId, status }: { transferId: string; status: TransferStatus }) {
  const [isPending, startTransition] = useTransition();

  function handleUpdate(next: TransferStatus) {
    startTransition(() => {
      updateTransferStatus(transferId, next);
    });
  }

  if (status === "completed" || status === "cancelled" || status === "received") return null;

  return (
    <div className="flex gap-2">
      {status === "pending" && (
        <Button size="sm" variant="outline" disabled={isPending} onClick={() => handleUpdate("in_transit")}>
          Mark in transit
        </Button>
      )}
      {(status === "pending" || status === "in_transit") && (
        <Button size="sm" disabled={isPending} onClick={() => handleUpdate("received")}>
          Mark received
        </Button>
      )}
      <Button size="sm" variant="destructive" disabled={isPending} onClick={() => handleUpdate("cancelled")}>
        Cancel transfer
      </Button>
    </div>
  );
}