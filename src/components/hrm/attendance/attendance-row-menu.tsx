"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Eye, MoreVertical, LogOut, Trash2, Loader2 } from "lucide-react";
import { checkOut, deleteAttendanceRecord } from "@/app/(dashboard)/hrm/attendance/actions";

interface AttendanceRowMenuProps {
  recordId: string | null;
  hasCheckOut: boolean;
  onEdit: () => void;
  onNotice: (message: string, tone?: "success" | "error") => void;
}

export function AttendanceRowMenu({ recordId, hasCheckOut, onEdit, onNotice }: AttendanceRowMenuProps) {
  const router = useRouter();
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen]);

  function handleCheckOut() {
    if (!recordId) return;
    setMenuOpen(false);
    startTransition(async () => {
      const result = await checkOut(recordId);
      if (!result.ok) return onNotice(result.error ?? "Something went wrong.", "error");
      onNotice("Checked out");
      router.refresh();
    });
  }

  function handleDelete() {
    if (!recordId) return;
    setMenuOpen(false);
    startTransition(async () => {
      const result = await deleteAttendanceRecord(recordId);
      if (!result.ok) return onNotice(result.error ?? "Something went wrong.", "error");
      onNotice("Record deleted");
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-end gap-1 text-ledger-400">
      <button onClick={onEdit} className="rounded-md p-1.5 hover:bg-ledger-100 hover:text-ink-900 dark:hover:bg-white/[0.06] dark:hover:text-white" title={recordId ? "View / Correct" : "Add manual entry"}>
        <Eye className="h-4 w-4" />
      </button>
      {recordId && (
        <div className="relative" ref={menuRef}>
          <button onClick={() => setMenuOpen((v) => !v)} className="rounded-md p-1.5 hover:bg-ledger-100 hover:text-ink-900 dark:hover:bg-white/[0.06] dark:hover:text-white" title="More">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
          </button>
          {menuOpen && (
            <div role="menu" className="absolute right-0 top-8 z-40 w-40 overflow-hidden rounded-md border border-ledger-100 bg-white py-1 shadow-card-hover dark:border-ledger-700 dark:bg-ink-900">
              {!hasCheckOut && (
                <button onClick={handleCheckOut} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-900 hover:bg-ledger-50 dark:text-white dark:hover:bg-white/[0.06]">
                  <LogOut className="h-4 w-4 text-ledger-400" /> Check Out
                </button>
              )}
              <button onClick={handleDelete} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-alert hover:bg-alert-soft">
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}