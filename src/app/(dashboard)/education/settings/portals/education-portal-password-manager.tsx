"use client";

import { useState } from "react";
import { CheckCircle2, Copy, KeyRound } from "lucide-react";
import { issueEducationPortalTemporaryPassword } from "../../actions";

export function EducationPortalPasswordManager() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setCredentials(null);
    setCopied(false);
    setIsSubmitting(true);
    try {
      const result = await issueEducationPortalTemporaryPassword(new FormData(event.currentTarget));
      if (result.error) {
        setError(result.error);
      } else if (result.success && result.email && result.temporaryPassword) {
        setCredentials({ email: result.email, password: result.temporaryPassword });
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not issue a temporary portal password.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function copyCredentials() {
    if (!credentials) return;
    await navigator.clipboard.writeText(`Email: ${credentials.email}\nPassword: ${credentials.password}`);
    setCopied(true);
  }

  return <section className="rounded-xl border border-amber-200 bg-white p-5 shadow-sm">
    <h2 className="flex items-center gap-2 font-semibold text-slate-950"><KeyRound className="h-5 w-5 text-amber-700" /> Issue or reset a portal password</h2>
    <p className="mt-1 text-sm leading-6 text-slate-600">For an active student, teaching staff member, or guardian, generate a unique temporary password. The user must change it at first sign-in. Share it securely; it is displayed only once.</p>
    <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
      <label className="grid gap-1 text-sm font-medium text-slate-700">Portal
        <select name="portal_type" required defaultValue="student" className="h-10 rounded-lg border border-slate-300 bg-white px-3 font-normal">
          <option value="student">Student</option>
          <option value="staff">Teaching staff</option>
          <option value="guardian">Guardian</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm font-medium text-slate-700">Email on the active portal profile
        <input type="email" name="email" required maxLength={254} autoComplete="email" className="h-10 rounded-lg border border-slate-300 px-3 font-normal" />
      </label>
      <button type="submit" disabled={isSubmitting} className="self-end rounded-lg bg-amber-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-800 disabled:cursor-wait disabled:opacity-60">
        {isSubmitting ? "Generating..." : "Generate password"}
      </button>
    </form>
    {error && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">{error}</p>}
    {credentials && <div role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
      <p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" /> Temporary password ready</p>
      <p className="mt-2"><span className="font-semibold">Email:</span> {credentials.email}</p>
      <p><span className="font-semibold">Password:</span> <code className="break-all">{credentials.password}</code></p>
      <p className="mt-1 text-xs">Share securely. The password will not be shown again and must be changed after login.</p>
      <button type="button" onClick={copyCredentials} className="mt-3 inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-emerald-100">
        <Copy className="h-3.5 w-3.5" /> {copied ? "Copied credentials" : "Copy credentials"}
      </button>
    </div>}
  </section>;
}
