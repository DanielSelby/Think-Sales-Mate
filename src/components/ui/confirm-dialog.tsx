"use client";

import { AlertTriangle } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  description?: string;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
}

export function ConfirmDialog({
  open,
  title = "Are you sure?",
  description = "This action cannot be undone.",
  onCancel,
  onConfirm,
  confirmLabel = "OK"
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onCancel} title={title}>
      <div className="flex flex-col items-center text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-amber-200 text-amber-500 dark:border-amber-400/30">
          <AlertTriangle className="h-9 w-9" strokeWidth={1.5} />
        </div>
        <p className="mt-4 text-sm text-ledger-600 dark:text-ledger-300">{description}</p>
        <div className="mt-6 flex w-full justify-center gap-3">
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="button" variant="destructive" onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </Dialog>
  );
}
