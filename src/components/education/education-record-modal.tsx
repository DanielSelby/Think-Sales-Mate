"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Copy, Plus, UserPlus, X } from "lucide-react";

export interface EducationRecordActionResult {
  success?: boolean;
  error?: string;
  username?: string;
  temporaryPassword?: string;
  warning?: string;
}

export interface EducationRecordField {
  name: string;
  label: string;
  type?: "text" | "email" | "tel" | "date" | "select";
  required?: boolean;
  maxLength?: number;
  pattern?: string;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
}

interface EducationRecordModalProps {
  title: string;
  description: string;
  buttonLabel: string;
  submitLabel: string;
  fields: EducationRecordField[];
  action: (formData: FormData) => Promise<EducationRecordActionResult>;
  canCreateAccount?: boolean;
  accountRole?: string;
  accountRoles?: Array<{ value: string; label: string }>;
}

function makeTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$%";
  const values = new Uint32Array(16);
  window.crypto.getRandomValues(values);
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
}

export function EducationRecordModal({
  title,
  description,
  buttonLabel,
  submitLabel,
  fields,
  action,
  canCreateAccount = false,
  accountRole,
  accountRoles = [],
}: EducationRecordModalProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [createAccount, setCreateAccount] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [credentials, setCredentials] = useState<{ username: string; password: string } | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const close = () => {
    setIsOpen(false);
    setCreateAccount(false);
    setError(null);
    setSuccess(false);
    setCredentials(null);
    setCopyStatus(null);
    router.refresh();
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(false);
    setCredentials(null);
    const formData = new FormData(event.currentTarget);
    if (createAccount) {
      const email = String(formData.get("email") ?? "").trim();
      if (!email) {
        setError("Enter an email address to create a login account.");
        return;
      }
      formData.set("create_account", "true");
      formData.set("account_password", makeTemporaryPassword());
      if (accountRole) formData.set("account_role", accountRole);
    }

    setIsSubmitting(true);
    try {
      const result = await action(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSuccess(true);
      if (result.username && result.temporaryPassword) {
        setCredentials({ username: result.username, password: result.temporaryPassword });
      } else {
        formRef.current?.reset();
        router.refresh();
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "The record could not be saved.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyCredentials = async () => {
    if (!credentials) return;
    await navigator.clipboard?.writeText(`Username: ${credentials.username}\nPassword: ${credentials.password}`);
    setCopyStatus("Temporary credentials copied.");
  };

  return <>
    <button type="button" onClick={() => setIsOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">
      <Plus className="h-4 w-4" /> {buttonLabel}
    </button>
    {isOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <section role="dialog" aria-modal="true" aria-labelledby="education-record-title" className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-100 text-blue-700"><UserPlus className="h-5 w-5" /></span>
            <div>
              <h2 id="education-record-title" className="font-semibold text-slate-950">{title}</h2>
              <p className="mt-0.5 text-xs text-slate-500">{description}</p>
            </div>
          </div>
          <button type="button" onClick={close} aria-label="Close form" className="rounded-lg p-2 text-slate-500 hover:bg-slate-200"><X className="h-4 w-4" /></button>
        </header>

        <form ref={formRef} onSubmit={submit} className="min-h-0 overflow-y-auto p-5">
          {error && <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
          {success && <div role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            <p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" /> {title} saved.</p>
            {credentials && <div className="mt-3 rounded-lg border border-emerald-200 bg-white p-3">
              <p className="font-semibold">Temporary login credentials</p>
              <p className="mt-1 break-all">Username: {credentials.username}</p>
              <p className="break-all">Password: {credentials.password}</p>
              <p className="mt-2 text-xs">The account must change this password after signing in. Save these credentials now; they will not be shown again.</p>
              <button type="button" onClick={copyCredentials} className="mt-3 inline-flex items-center gap-1 rounded-md border border-emerald-300 px-3 py-1.5 text-xs font-semibold hover:bg-emerald-50">
                <Copy className="h-3.5 w-3.5" /> Copy credentials
              </button>
              {copyStatus && <p className="mt-1 text-xs" role="status">{copyStatus}</p>}
            </div>}
            {!credentials && <button type="button" onClick={close} className="mt-3 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white">Done</button>}
          </div>}

          {!success && <>
            <div className="grid gap-4 sm:grid-cols-2">
              {fields.map((field) => <label key={field.name} className="grid gap-1 text-sm font-medium text-slate-700">
                {field.label}
                {field.type === "select" ? <select required={field.required} name={field.name} defaultValue="" className="h-10 rounded-lg border border-slate-300 bg-white px-3 font-normal">
                  <option value="" disabled>Select {field.label.toLowerCase()}</option>
                  {(field.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select> : <input
                  required={field.required || (createAccount && field.name === "email")}
                  name={field.name}
                  type={field.type ?? "text"}
                  maxLength={field.maxLength}
                  pattern={field.pattern}
                  placeholder={field.placeholder}
                  className="h-10 rounded-lg border border-slate-300 px-3 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />}
              </label>)}
            </div>

            {canCreateAccount && <section className="mt-5 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
              <label className="flex items-start gap-2.5 text-sm font-medium text-slate-800">
                <input type="checkbox" checked={createAccount} onChange={(event) => setCreateAccount(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600" />
                <span>
                  Create a linked Think Education login
                  <span className="mt-0.5 block text-xs font-normal text-slate-600">A temporary password will be generated and shown once after saving. The account receives access only to Think Education.</span>
                </span>
              </label>
              {createAccount && accountRoles.length > 0 && <label className="mt-3 grid gap-1 text-sm font-medium text-slate-700">
                Education role
                <select name="account_role" defaultValue={accountRole ?? accountRoles[0]?.value} className="h-10 rounded-lg border border-slate-300 bg-white px-3 font-normal">
                  {accountRoles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
                </select>
              </label>}
            </section>}

            <footer className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={close} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
              <button type="submit" disabled={isSubmitting} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60">
                {isSubmitting ? "Saving…" : submitLabel}
              </button>
            </footer>
          </>}

          {success && credentials && <footer className="flex justify-end border-t border-slate-100 pt-4">
            <button type="button" onClick={close} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">Close</button>
          </footer>}
        </form>
      </section>
    </div>}
  </>;
}
