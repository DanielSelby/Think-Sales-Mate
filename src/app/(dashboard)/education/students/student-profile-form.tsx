"use client";

import { useState } from "react";
import { updateEducationStudent } from "@/app/(dashboard)/education/actions";
import type { EducationStudentProfile } from "@/lib/education/student-profile";

type Props = {
  student: EducationStudentProfile;
  canEdit: boolean;
  studentPhotoUrl: string | null;
};

export function StudentProfileForm({ student, canEdit, studentPhotoUrl }: Props) {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [warning, setWarning] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  if (!canEdit) {
    return (
      <dl className="grid gap-5 rounded-2xl border border-slate-200 bg-white p-6 sm:grid-cols-2">
        <div><dt className="text-sm text-slate-500">First name</dt><dd className="mt-1 font-medium text-slate-900">{student.first_name}</dd></div>
        <div><dt className="text-sm text-slate-500">Last name</dt><dd className="mt-1 font-medium text-slate-900">{student.last_name}</dd></div>
        <div><dt className="text-sm text-slate-500">Other names</dt><dd className="mt-1 font-medium text-slate-900">{student.other_names || "—"}</dd></div>
        <div><dt className="text-sm text-slate-500">Email</dt><dd className="mt-1 font-medium text-slate-900">{student.email || "—"}</dd></div>
        <div><dt className="text-sm text-slate-500">Phone</dt><dd className="mt-1 font-medium text-slate-900">{student.phone || "—"}</dd></div>
        <div><dt className="text-sm text-slate-500">Date of birth</dt><dd className="mt-1 font-medium text-slate-900">{student.date_of_birth || "—"}</dd></div>
        <div><dt className="text-sm text-slate-500">Gender</dt><dd className="mt-1 font-medium text-slate-900">{student.gender || "—"}</dd></div>
        <div className="sm:col-span-2"><dt className="text-sm text-slate-500">Home address</dt><dd className="mt-1 font-medium text-slate-900">{student.home_address || "—"}</dd></div>
      </dl>
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError("");
    setNotice("");
    setWarning("");
    setIsSaving(true);
    try {
      const result = await updateEducationStudent(formData);
      if ("error" in result) {
        setError(result.error ?? "The student profile could not be saved.");
      } else {
        if (result.warning) setWarning(result.warning);
        else setNotice("Student profile saved.");
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "The student profile could not be saved.");
    } finally {
      setIsSaving(false);
    }
  }

  const inputClassName = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6">
      <input type="hidden" name="student_id" value={student.id} />
      <label className="grid gap-2 text-sm font-medium text-slate-700 sm:grid-cols-[auto_1fr] sm:items-center">
        <span>
          Student photo
          <input name="student_photo" type="file" accept="image/jpeg,image/png,image/webp" className={inputClassName} />
          <span className="mt-1 block text-xs font-normal text-slate-500">JPEG, PNG, or WebP; maximum 5 MB.</span>
        </span>
      </label>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          First name
          <input name="first_name" required maxLength={100} defaultValue={student.first_name} className={inputClassName} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Last name
          <input name="last_name" required maxLength={100} defaultValue={student.last_name} className={inputClassName} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Other names
          <input name="other_names" maxLength={100} defaultValue={student.other_names ?? ""} className={inputClassName} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Email
          <input name="email" type="email" maxLength={254} defaultValue={student.email ?? ""} className={inputClassName} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Phone
          <input name="phone" type="tel" maxLength={32} defaultValue={student.phone ?? ""} className={inputClassName} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Date of birth
          <input name="date_of_birth" type="date" max={new Date().toISOString().slice(0, 10)} defaultValue={student.date_of_birth ?? ""} className={inputClassName} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Gender
          <input name="gender" maxLength={50} defaultValue={student.gender ?? ""} className={inputClassName} />
        </label>
        <label className="text-sm font-medium text-slate-700 sm:col-span-2">
          Home address
          <textarea name="home_address" maxLength={500} rows={3} defaultValue={student.home_address ?? ""} className={inputClassName} />
        </label>
      </div>
      {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
      {warning && <p role="status" className="text-sm font-medium text-amber-800">{warning}</p>}
      {notice && <p role="status" className="text-sm font-medium text-emerald-700">{notice}</p>}
      <button type="submit" disabled={isSaving} className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60">
        {isSaving ? "Saving..." : "Save changes"}
      </button>
    </form>
  );
}
