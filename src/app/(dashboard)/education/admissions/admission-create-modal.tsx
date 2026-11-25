"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, UserPlus, X } from "lucide-react";
import { createEducationAdmission } from "../actions";

type CampusOption = { id: string; name: string };
type ClassOption = { id: string; branchId: string; label: string };

const ERROR_MESSAGES: Record<string, string> = {
  invalid: "Check the applicant details, date of birth, and guardian requirements.",
  permission: "Your role does not have permission to create this application.",
  database_permission: "Application saving is blocked by a database permission configuration. Ask an administrator to apply the latest database migration.",
  campus: "Select one of your assigned campuses.",
  duplicate: "The application number is already in use. Please try again.",
  class: "Choose an active class at the selected campus and academic year.",
  save: "The application could not be saved. Please try again.",
};

export function AdmissionCreateModal({
  campuses,
  classes,
  canViewClasses,
  initiallyOpen,
  admissionsPath,
}: {
  campuses: CampusOption[];
  classes: ClassOption[];
  canViewClasses: boolean;
  initiallyOpen: boolean;
  admissionsPath: string;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(initiallyOpen);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedCampusId, setSelectedCampusId] = useState(campuses[0]?.id ?? "");
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setIsOpen(false);
    setErrorMessage("");
    if (initiallyOpen) router.replace(admissionsPath, { scroll: false });
  }, [admissionsPath, initiallyOpen, router]);

  useEffect(() => {
    if (initiallyOpen) setIsOpen(true);
  }, [initiallyOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [close, isOpen]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    const form = event.currentTarget;
    const formData = new FormData(form);
    const guardianFields = [
      "guardian_first_name",
      "guardian_last_name",
      "guardian_email",
      "guardian_phone",
      "guardian_relationship",
    ];
    const hasGuardianDetails = guardianFields.some((field) => String(formData.get(field) ?? "").trim());
    const hasGuardianNameAndRelationship = ["guardian_first_name", "guardian_last_name", "guardian_relationship"]
      .every((field) => String(formData.get(field) ?? "").trim());
    const hasGuardianContact = ["guardian_email", "guardian_phone"]
      .some((field) => String(formData.get(field) ?? "").trim());
    if (hasGuardianDetails && (!hasGuardianNameAndRelationship || !hasGuardianContact)) {
      setErrorMessage("For guardian details, enter first and last names, relationship, and at least an email or phone.");
      return;
    }

    setIsSaving(true);
    try {
      const result = await createEducationAdmission(formData);
      if ("error" in result) {
        setErrorMessage(ERROR_MESSAGES[result.error] ?? ERROR_MESSAGES.save);
        return;
      }
      setIsOpen(false);
      form.reset();
      router.replace(`${admissionsPath}?created=1`, { scroll: false });
    } catch (submitError) {
      setErrorMessage(submitError instanceof Error
        ? submitError.message
        : "The application could not be saved. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return <>
    <button
      type="button"
      onClick={() => {
        setErrorMessage("");
        setIsOpen(true);
      }}
      className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
    >
      <Plus className="h-4 w-4" /> New application
    </button>

    {isOpen && <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admission-create-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-7">
          <div>
            <h2 id="admission-create-title" className="flex items-center gap-2 text-xl font-bold text-slate-950">
              <UserPlus className="h-5 w-5 text-blue-700" /> New admission applicant
            </h2>
            <p className="mt-1 text-sm text-slate-600">Create an application for a prospective student.</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={close}
            aria-label="Close new application form"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="overflow-y-auto px-5 py-5 sm:px-7">
          {errorMessage && <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{errorMessage}</p>}
          {!campuses.length ? <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            No campus access is assigned to your account. Ask an authorized Think Education administrator to assign your campus scope.
          </p> : <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm font-medium text-slate-700">Campus
              <select required name="branch_id" value={selectedCampusId} onChange={(event) => setSelectedCampusId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal">
                {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
              </select>
            </label>
            <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">An application number will be generated when you save.</p>
            <label className="text-sm font-medium text-slate-700">Applicant first name
              <input required name="first_name" maxLength={100} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />
            </label>
            <label className="text-sm font-medium text-slate-700">Applicant last name
              <input required name="last_name" maxLength={100} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />
            </label>
            <label className="text-sm font-medium text-slate-700">Other names
              <input name="other_names" maxLength={100} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />
            </label>
            <label className="text-sm font-medium text-slate-700">Date of birth
              <input name="date_of_birth" type="date" max={new Date().toISOString().slice(0, 10)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />
            </label>
            <label className="text-sm font-medium text-slate-700">Gender
              <input name="gender" maxLength={50} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />
            </label>
            <label className="text-sm font-medium text-slate-700">Home address
              <textarea name="address" maxLength={500} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />
            </label>
            <label className="text-sm font-medium text-slate-700">Email (optional)
              <input name="email" type="email" maxLength={254} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />
            </label>
            <label className="text-sm font-medium text-slate-700">Phone (optional)
              <input name="phone" type="tel" maxLength={32} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />
            </label>
            <fieldset className="rounded-lg border border-slate-200 p-4 sm:col-span-2 lg:col-span-3">
              <legend className="px-1 text-sm font-semibold text-slate-800">Guardian details (optional)</legend>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="text-sm font-medium text-slate-700">First name
                  <input name="guardian_first_name" maxLength={100} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />
                </label>
                <label className="text-sm font-medium text-slate-700">Last name
                  <input name="guardian_last_name" maxLength={100} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />
                </label>
                <label className="text-sm font-medium text-slate-700">Email
                  <input name="guardian_email" type="email" maxLength={254} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />
                </label>
                <label className="text-sm font-medium text-slate-700">Phone
                  <input name="guardian_phone" type="tel" maxLength={40} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />
                </label>
                <label className="text-sm font-medium text-slate-700">Relationship
                  <input name="guardian_relationship" maxLength={60} placeholder="Parent, guardian, etc." className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />
                </label>
              </div>
              <p className="mt-3 text-xs text-slate-500">If you provide any guardian details, include first and last names, relationship, and at least an email or phone. The guardian record is created during enrollment.</p>
            </fieldset>
            {canViewClasses && <label className="text-sm font-medium text-slate-700">Requested class (optional)
              <select key={selectedCampusId} name="requested_class_id" defaultValue="" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal">
                <option value="">Not selected</option>
                {classes.filter((classroom) => classroom.branchId === selectedCampusId).map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.label}</option>)}
              </select>
            </label>}
            <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4 sm:col-span-2 lg:col-span-3">
              <button
                type="submit"
                disabled={isSaving || !campuses.length}
                className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-wait disabled:opacity-70"
              >
                {isSaving ? "Saving application..." : "Save application"}
              </button>
              <button type="button" onClick={close} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
            </div>
          </form>}
        </div>
      </section>
    </div>}
  </>;
}
