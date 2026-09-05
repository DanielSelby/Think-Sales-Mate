import type { TransferStatus } from "@/types/database";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<TransferStatus, string> = {
  pending: "bg-ledger-100 text-ledger-600 dark:bg-white/[0.06] dark:text-ledger-300",
  in_transit: "bg-amber-soft text-amber",
  received: "bg-signal-soft text-signal",
  completed: "bg-signal-soft text-signal",
  cancelled: "bg-alert-soft text-alert"
};

const STATUS_LABELS: Record<TransferStatus, string> = {
  pending: "Pending",
  in_transit: "In transit",
  received: "Accepted",
  completed: "Completed",
  cancelled: "Cancelled"
};

export function TransferStatusBadge({ status }: { status: TransferStatus }) {
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", STATUS_STYLES[status])}>
      {STATUS_LABELS[status]}
    </span>
  );
}