"use client";

import { useState } from "react";

export type EducationAttendanceStatus = "present" | "absent" | "late" | "excused";

const STATUS_CLASSES: Record<EducationAttendanceStatus, string> = {
  present: "border-emerald-300 bg-emerald-50 text-emerald-800 focus:ring-emerald-300",
  absent: "border-rose-300 bg-rose-50 text-rose-800 focus:ring-rose-300",
  late: "border-amber-300 bg-amber-50 text-amber-800 focus:ring-amber-300",
  excused: "border-sky-300 bg-sky-50 text-sky-800 focus:ring-sky-300",
};

const STATUSES: EducationAttendanceStatus[] = ["present", "absent", "late", "excused"];

export function AttendanceStatusSelect({
  defaultValue,
  name = "status",
  ariaLabel,
  className = "",
  bulkFormId,
  studentId,
}: {
  defaultValue: EducationAttendanceStatus;
  name?: string;
  ariaLabel: string;
  className?: string;
  bulkFormId?: string;
  studentId?: string;
}) {
  const [status, setStatus] = useState(defaultValue);

  return <>
    <select
      name={name}
      aria-label={ariaLabel}
      value={status}
      onChange={(event) => {
        const selectedStatus = STATUSES.find((option) => option === event.currentTarget.value);
        if (selectedStatus) setStatus(selectedStatus);
      }}
      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 ${STATUS_CLASSES[status]} ${className}`}
    >
      {STATUSES.map((option) => <option key={option} value={option}>
        {option[0].toUpperCase() + option.slice(1)}
      </option>)}
    </select>
    {bulkFormId && studentId && <input
      type="hidden"
      form={bulkFormId}
      name={`status_${studentId}`}
      value={status}
      readOnly
    />}
  </>;
}
