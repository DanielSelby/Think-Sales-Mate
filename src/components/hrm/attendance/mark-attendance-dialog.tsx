"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ATTENDANCE_STATUS_LABEL, WORK_TYPES } from "@/lib/hrm/attendance";
import { markAttendance } from "@/app/(dashboard)/hrm/attendance/actions";
import type { AttendanceStatus } from "@/types/database";

export interface EmployeeOption { id: string; name: string; }

export interface EditingAttendance {
  employeeId: string;
  workDate: string;
  status: AttendanceStatus;
  checkIn: string | null;
  checkOut: string | null;
  workType: string;
  notes: string | null;
}

interface MarkAttendanceDialogProps {
  open: boolean;
  onClose: () => void;
  employees: EmployeeOption[];
  selectedDate: string;
  editing: EditingAttendance | null;
  onSaved: () => void;
}

const STATUS_OPTIONS: AttendanceStatus[] = ["present", "absent", "late", "early_leave", "on_leave"];

function toTimeInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function MarkAttendanceDialog({ open, onClose, employees, selectedDate, editing, onSaved }: MarkAttendanceDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const [employeeId, setEmployeeId] = React.useState(editing?.employeeId ?? employees[0]?.id ?? "");
  const [status, setStatus] = React.useState<AttendanceStatus>(editing?.status ?? "present");
  const [checkInTime, setCheckInTime] = React.useState(toTimeInput(editing?.checkIn ?? null));
  const [checkOutTime, setCheckOutTime] = React.useState(toTimeInput(editing?.checkOut ?? null));
  const [workType, setWorkType] = React.useState<string>(editing?.workType ?? WORK_TYPES[0]);
  const [notes, setNotes] = React.useState(editing?.notes ?? "");

  React.useEffect(() => {
    if (!open) return;
    setEmployeeId(editing?.employeeId ?? employees[0]?.id ?? "");
    setStatus(editing?.status ?? "present");
    setCheckInTime(toTimeInput(editing?.checkIn ?? null));
    setCheckOutTime(toTimeInput(editing?.checkOut ?? null));
    setWorkType(editing?.workType ?? WORK_TYPES[0]);
    setNotes(editing?.notes ?? "");
    setError(null);
  }, [open, editing, employees]);

  function submit() {
    if (!employeeId) {
      setError("Select an employee.");
      return;
    }
    startTransition(async () => {
      const result = await markAttendance({
        employeeId, workDate: editing?.workDate ?? selectedDate, status,
        checkIn: checkInTime || null, checkOut: checkOutTime || null, workType, notes: notes || null,
      });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      onSaved();
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onClose={() => (isPending ? null : onClose())} title={editing ? "Correct Attendance" : "Add Manual Entry"} description={editing?.workDate ?? selectedDate}>
      <div className="space-y-3">
        <Field label="Employee" required>
          <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} disabled={!!editing}>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value as AttendanceStatus)}>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{ATTENDANCE_STATUS_LABEL[s]}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Check In"><Input type="time" value={checkInTime} onChange={(e) => setCheckInTime(e.target.value)} /></Field>
          <Field label="Check Out"><Input type="time" value={checkOutTime} onChange={(e) => setCheckOutTime(e.target.value)} /></Field>
        </div>
        <Field label="Work Type">
          <Select value={workType} onChange={(e) => setWorkType(e.target.value)}>
            {WORK_TYPES.map((w) => <option key={w} value={w}>{w}</option>)}
          </Select>
        </Field>
        <Field label="Notes (Optional)">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reason for correction, etc." />
        </Field>

        {error && <p className="text-sm text-alert">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="md" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button variant="primary" size="md" onClick={submit} disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />} Save
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