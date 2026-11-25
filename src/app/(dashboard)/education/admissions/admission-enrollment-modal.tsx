"use client";

import { useEffect, useRef, useState } from "react";
import { GraduationCap, Info, UserRound, X } from "lucide-react";
import { EducationSubmitButton } from "../submit-button";
import { updateEducationAdmissionStatus } from "../actions";

type EnrollmentApplication = {
  id: string;
  applicationNumber: string;
  firstName: string;
  otherNames: string | null;
  lastName: string;
  requestedClassId: string | null;
};

type ClassOption = { id: string; label: string };

export function AdmissionEnrollmentModal({
  application,
  classes,
}: {
  application: EnrollmentApplication;
  classes: ClassOption[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const applicantName = [application.firstName, application.otherNames, application.lastName]
    .filter(Boolean)
    .join(" ");
  const requestedClassIsAvailable = classes.some((classroom) => classroom.id === application.requestedClassId);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return <>
    <button
      type="button"
      onClick={() => setIsOpen(true)}
      className="mt-3 rounded-md bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800"
    >
      Enroll and create student
    </button>
    {isOpen && <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`admission-enrollment-title-${application.id}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setIsOpen(false);
      }}
    >
      <section className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-center justify-between gap-4 px-5 py-4 sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <GraduationCap className="h-5 w-5 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <h2 id={`admission-enrollment-title-${application.id}`} className="font-semibold">Enroll to Class</h2>
              <p className="mt-0.5 truncate text-xs">{applicantName}</p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Close enrollment form"
            className="shrink-0 rounded-lg p-2 text-white/90 hover:bg-white/15 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <form action={updateEducationAdmissionStatus} className="min-h-0 space-y-5 overflow-y-auto p-5 sm:px-7 sm:py-6">
          <input type="hidden" name="admission_id" value={application.id} />
          <input type="hidden" name="status" value="enrolled" />

          <div className="flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-slate-800">
            <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" aria-hidden="true" />
            <p className="min-w-0">
              <span className="font-semibold">{applicantName}</span>
              <span className="mt-0.5 block text-xs text-slate-600">Application {application.applicationNumber}</span>
            </p>
          </div>

          <section aria-labelledby={`admission-enrollment-class-title-${application.id}`}>
            <h3
              id={`admission-enrollment-class-title-${application.id}`}
              className="mb-4 flex items-center gap-2 border-b pb-2 text-sm font-bold text-slate-900"
              style={{ borderColor: "var(--theme-primary)" }}
            >
              <GraduationCap className="h-4 w-4" style={{ color: "var(--theme-primary)" }} aria-hidden="true" />
              Class &amp; student identity
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-700 sm:col-span-2">
                Active class / section <span className="text-rose-600">*</span>
                <select
                  required
                  name="class_id"
                  defaultValue={requestedClassIsAvailable ? application.requestedClassId! : ""}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal"
                >
                  <option value="" disabled>Select a class</option>
                  {classes.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.label}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700 sm:col-span-2">
                Student number (optional)
                <input
                  name="student_number"
                  maxLength={32}
                  pattern="[A-Za-z0-9._/-]{1,32}"
                  placeholder="Generated automatically if left blank"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal"
                />
              </label>
            </div>
          </section>

          <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-slate-700">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" aria-hidden="true" />
            <p>Enrolling creates the student record and assigns the selected class. A student number is generated automatically unless you enter one.</p>
          </div>

          <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <EducationSubmitButton
              disabled={classes.length === 0}
              pendingLabel="Enrolling student..."
              className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Enroll and create student
            </EducationSubmitButton>
          </footer>
        </form>
      </section>
    </div>}
  </>;
}
