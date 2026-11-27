"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, FileText, MoreHorizontal, Pencil, Users, Wallet, X } from "lucide-react";

type StudentAction = {
  tab: "fees" | "attendance" | "exams" | "guardians" | "personal";
  label: string;
};

type Props = {
  studentName: string;
  profileHref: string;
  actions: StudentAction[];
};

const ACTION_ICONS = {
  fees: Wallet,
  attendance: CalendarDays,
  exams: FileText,
  guardians: Users,
  personal: Pencil,
} as const;

export function StudentDirectoryActions({ studentName, profileHref, actions }: Props) {
  const [activeAction, setActiveAction] = useState<StudentAction | null>(null);
  const menuRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (!activeAction) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveAction(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeAction]);

  if (!actions.length) return null;

  const closeDialog = () => setActiveAction(null);
  const actionHref = activeAction
    ? `${profileHref}?tab=${activeAction.tab}&popup=1`
    : "about:blank";

  return <>
    <details ref={menuRef} className="relative">
      <summary
        aria-label={`More actions for ${studentName}`}
        title="More actions"
        className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 [&::-webkit-details-marker]:hidden"
      ><MoreHorizontal className="h-4 w-4" /></summary>
      <div className="absolute right-0 z-20 mt-1 min-w-48 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
        {actions.map((action) => {
          const Icon = ACTION_ICONS[action.tab];
          return <button
            key={action.tab}
            type="button"
            onClick={() => {
              menuRef.current?.removeAttribute("open");
              setActiveAction(action);
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-800"
          >
            <Icon className="h-4 w-4" /> {action.label}
          </button>;
        })}
      </div>
    </details>
    {activeAction && <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeDialog();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-directory-action-title"
        className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 id="student-directory-action-title" className="font-semibold text-slate-950">{activeAction.label}</h2>
            <p className="truncate text-sm text-slate-500">{studentName}</p>
          </div>
          <button
            type="button"
            onClick={closeDialog}
            aria-label="Close student action"
            className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          ><X className="h-4 w-4" /></button>
        </header>
        <iframe
          key={actionHref}
          src={actionHref}
          title={`${activeAction.label} for ${studentName}`}
          className="min-h-0 flex-1 border-0"
          referrerPolicy="same-origin"
        />
      </section>
    </div>}
  </>;
}
