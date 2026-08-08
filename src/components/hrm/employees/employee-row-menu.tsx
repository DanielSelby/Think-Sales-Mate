"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, Pencil, MoreVertical, CalendarOff, Power, Trash2, Loader2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setEmployeeStatus, setEmployeeOnLeave, deleteEmployee } from "@/app/(dashboard)/hrm/actions";

interface EmployeeRowMenuProps {
  employeeId: string;
  employeeName: string;
  status: "active" | "inactive";
  onNotice: (message: string, tone?: "success" | "error") => void;
}

export function EmployeeRowMenu({ employeeId, employeeName, status, onNotice }: EmployeeRowMenuProps) {
  const router = useRouter();
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = React.useState(false);
  const [untilDate, setUntilDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [isPending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen]);

  function run(action: () => Promise<{ ok: boolean; error?: string }>, message: string) {
    setMenuOpen(false);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) return onNotice(result.error ?? "Something went wrong.", "error");
      onNotice(message);
      router.refresh();
    });
  }

  function submitLeave() {
    startTransition(async () => {
      const result = await setEmployeeOnLeave(employeeId, untilDate);
      if (!result.ok) return onNotice(result.error ?? "Something went wrong.", "error");
      onNotice(`${employeeName} marked on leave until ${untilDate}`);
      setLeaveDialogOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex items-center justify-end gap-1 text-ledger-400">
        <Link href={`/hrm/employees/${employeeId}`} className="rounded-md p-1.5 hover:bg-ledger-100 hover:text-ink-900 dark:hover:bg-white/[0.06] dark:hover:text-white" title="View">
          <Eye className="h-4 w-4" />
        </Link>
        <Link href={`/hrm/employees/${employeeId}/edit`} className="rounded-md p-1.5 hover:bg-ledger-100 hover:text-ink-900 dark:hover:bg-white/[0.06] dark:hover:text-white" title="Edit">
          <Pencil className="h-4 w-4" />
        </Link>
        <div className="relative" ref={menuRef}>
          <button onClick={() => setMenuOpen((v) => !v)} className="rounded-md p-1.5 hover:bg-ledger-100 hover:text-ink-900 dark:hover:bg-white/[0.06] dark:hover:text-white" title="More">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
          </button>
          {menuOpen && (
            <div role="menu" className="absolute right-0 top-8 z-40 w-48 overflow-hidden rounded-md border border-ledger-100 bg-white py-1 shadow-card-hover dark:border-ledger-700 dark:bg-ink-900">
              <button onClick={() => { setMenuOpen(false); setLeaveDialogOpen(true); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-900 hover:bg-ledger-50 dark:text-white dark:hover:bg-white/[0.06]">
                <CalendarOff className="h-4 w-4 text-ledger-400" /> Set On Leave
              </button>
              <button
                onClick={() => run(() => setEmployeeStatus(employeeId, status === "active" ? "inactive" : "active"), `${employeeName} ${status === "active" ? "deactivated" : "activated"}`)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-900 hover:bg-ledger-50 dark:text-white dark:hover:bg-white/[0.06]"
              >
                <Power className="h-4 w-4 text-ledger-400" /> {status === "active" ? "Deactivate" : "Activate"}
              </button>
              <button
                onClick={() => run(() => deleteEmployee(employeeId), `${employeeName} deleted`)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-alert hover:bg-alert-soft"
              >
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            </div>
          )}
        </div>
      </div>

      <Dialog open={leaveDialogOpen} onClose={() => setLeaveDialogOpen(false)} title="Set On Leave" description={`Mark ${employeeName} on leave until a return date.`}>
        <div className="space-y-3">
          <Input type="date" value={untilDate} onChange={(e) => setUntilDate(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="md" onClick={() => setLeaveDialogOpen(false)} disabled={isPending}>Cancel</Button>
            <Button variant="primary" size="md" onClick={submitLeave} disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />} Confirm
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}