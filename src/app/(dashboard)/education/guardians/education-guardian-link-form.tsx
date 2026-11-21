"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Copy } from "lucide-react";
import { createEducationGuardianLink } from "../actions";

interface StudentOption {
  id: string;
  branch_id: string;
  student_number: string;
  first_name: string;
  last_name: string;
  campus_name: string;
}

interface EducationGuardianLinkFormProps {
  students: StudentOption[];
}

export function EducationGuardianLinkForm({ students }: EducationGuardianLinkFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    email?: string;
    temporaryPassword?: string;
    warning?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);
    setIsSubmitting(true);
    try {
      const response = await createEducationGuardianLink(new FormData(event.currentTarget));
      if (response.error) {
        setError(response.error);
        return;
      }
      if (response.success) {
        setResult({
          email: response.email,
          temporaryPassword: response.temporaryPassword,
          warning: response.warning,
        });
        router.refresh();
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "The guardian relationship could not be created.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function copyCredentials() {
    if (!result?.email || !result.temporaryPassword) return;
    await navigator.clipboard.writeText(`Email: ${result.email}\nPassword: ${result.temporaryPassword}`);
    setCopied(true);
  }

  function addAnother() {
    setResult(null);
    setCopied(false);
    setError(null);
    formRef.current?.reset();
  }

  if (result) {
    return <section role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
      <p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" /> Guardian relationship created.</p>
      {result.temporaryPassword && result.email ? <>
        <p className="mt-2">Share these temporary credentials securely. The guardian must change the password at first sign-in.</p>
        <p className="mt-2"><span className="font-semibold">Email:</span> {result.email}</p>
        <p><span className="font-semibold">Temporary password:</span> <code className="break-all">{result.temporaryPassword}</code></p>
        <p className="mt-1 text-xs">Save this password now; it will not be shown again.</p>
        <button type="button" onClick={copyCredentials} className="mt-3 inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-emerald-100">
          <Copy className="h-3.5 w-3.5" /> {copied ? "Copied credentials" : "Copy credentials"}
        </button>
      </> : result.warning && <p className="mt-2">{result.warning}</p>}
      <button type="button" onClick={addAnother} className="ml-2 mt-3 rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800">
        Add another guardian
      </button>
    </section>;
  }

  return <form ref={formRef} onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900 sm:col-span-2 lg:col-span-4">{error}</p>}
    <label className="text-sm font-medium text-slate-700 sm:col-span-2">Student
      <select required name="student_id" defaultValue="" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
        <option value="" disabled>{students.length ? "Select an active student" : "No matching active students"}</option>
        {students.map((student) => <option key={student.id} value={student.id}>
          {student.first_name} {student.last_name} · {student.student_number} · {student.campus_name}
        </option>)}
      </select>
      {students.length === 100 && <span className="mt-1 block text-xs text-slate-500">Showing the first 100 matches. Search by name or number to narrow the list.</span>}
    </label>
    <label className="text-sm font-medium text-slate-700">Relationship
      <select required name="relationship" defaultValue="" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
        <option value="" disabled>Select relationship</option>
        {["Mother", "Father", "Guardian", "Grandparent", "Other"].map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
    </label>
    <label className="text-sm font-medium text-slate-700">First name
      <input required name="first_name" maxLength={100} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
    </label>
    <label className="text-sm font-medium text-slate-700">Last name
      <input required name="last_name" maxLength={100} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
    </label>
    <label className="text-sm font-medium text-slate-700">Email (needed for portal access)
      <input name="email" type="email" maxLength={254} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
    </label>
    <label className="text-sm font-medium text-slate-700">Phone
      <input name="phone" type="tel" maxLength={40} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
    </label>
    <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
      <input type="checkbox" name="is_primary" className="rounded border-slate-300" />
      Primary contact for this student
    </label>
    <p className="text-xs text-slate-500 sm:col-span-2 lg:col-span-4">When you provide an email, a guardian portal account and one-time password are created. The guardian must change the password after signing in.</p>
    <div className="lg:col-span-4">
      <button type="submit" disabled={isSubmitting || !students.length} className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">
        {isSubmitting ? "Creating guardian link..." : "Create pending guardian link"}
      </button>
    </div>
  </form>;
}
