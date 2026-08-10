"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { countBusinessDays } from "@/lib/hrm/leave";
import { createLeaveRequest, type LeaveTypeOption } from "@/app/(dashboard)/hrm/leave/actions";

export interface EmployeeOption { id: string; name: string; }

interface NewLeaveRequestDialogProps {
  open: boolean;
  onClose: () => void;
  employees: EmployeeOption[];
  leaveTypes: LeaveTypeOption[];
  onCreated: () => void;
}

export function NewLeaveRequestDialog({ open, onClose, employees, leaveTypes, onCreated }: NewLeaveRequestDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const [employeeId, setEmployeeId] = React.useState(employees[0]?.id ?? "");
  const [leaveTypeId, setLeaveTypeId] = React.useState(leaveTypes[0]?.id ?? "");
  const [startDate, setStartDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setEmployeeId(employees[0]?.id ?? "");
    setLeaveTypeId(leaveTypes[0]?.id ?? "");
    setStartDate(new Date().toISOString().slice(0, 10));
    setEndDate(new Date().toISOString().slice(0, 10));
    setReason("");
    setError(null);
  }, [open, employees, leaveTypes]);

  const duration = countBusinessDays(startDate, endDate);

  function submit() {
    if (!employeeId || !leaveTypeId) {
      setError("Select an employee and leave type.");
      return;
    }
    startTransition(async () => {
      const result = await createLeaveRequest({ employeeId, leaveTypeId, startDate, endDate, reason: reason || null });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      onCreated();
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onClose={() => (isPending ? null : onClose())} title="New Leave Request">
      <div className="space-y-3">
        <Field label="Employee" required>
          <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
        </Field>
        <Field label="Leave Type" required>
          <Select value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)}>
            {leaveTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start Date"><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="flex h-10 w-full rounded-md border border-ledger-200 bg-white px-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white" /></Field>
          <Field label="End Date"><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="flex h-10 w-full rounded-md border border-ledger-200 bg-white px-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white" /></Field>
        </div>
        <p className="text-xs text-ledger-400">{duration} working day{duration === 1 ? "" : "s"} (weekends excluded)</p>
        <Field label="Reason (Optional)">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="flex w-full rounded-md border border-ledger-200 bg-white px-3 py-2 text-sm placeholder:text-ledger-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40 dark:border-ledger-700 dark:bg-ink-900 dark:text-white" />
        </Field>

        {error && <p className="text-sm text-alert">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="md" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button variant="primary" size="md" onClick={submit} disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />} Submit Request
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ledger-500">{label} {required && <span className="text-alert">*</span>}</span>
      {children}
    </label>
  );
}