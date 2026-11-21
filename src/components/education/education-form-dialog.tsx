"use client";

import { useState, type ReactNode } from "react";
import { Dialog } from "@/components/ui/dialog";

export function EducationFormDialog({
  buttonLabel,
  title,
  description,
  children,
}: {
  buttonLabel: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return <>
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
    >
      {buttonLabel}
    </button>
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      title={title}
      description={description}
      className="max-h-[90vh] max-w-3xl overflow-y-auto"
    >
      {children}
    </Dialog>
  </>;
}
