"use client";

import { useEffect, useState } from "react";
import { Pencil, X } from "lucide-react";
import { saveEducationAccountingAccount } from "../actions";

type AccountOption = { id: string; code: string; name: string };

export function EditAccountDialog({
  account,
  parents,
}: {
  account: {
    id: string;
    code: string;
    name: string;
    description: string | null;
    parentAccountId: string | null;
    isCashAccount: boolean;
    cashFlowActivity: string | null;
  };
  parents: AccountOption[];
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline">
        <Pencil className="h-3.5 w-3.5" /> Edit
      </button>
      {open && (
        <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby={`edit-account-title-${account.id}`} className="my-auto max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id={`edit-account-title-${account.id}`} className="text-lg font-semibold">Edit account</h2>
                <p className="mt-1 text-sm text-slate-500">Update this account in the chart of accounts.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close edit account form" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </div>
            <form action={saveEducationAccountingAccount} className="mt-5 grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="accountId" value={account.id} />
              <label className="text-sm font-medium text-slate-700">Account code
                <input required name="code" defaultValue={account.code} minLength={2} maxLength={20} pattern="[A-Za-z0-9][A-Za-z0-9._/-]{1,19}" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm" />
              </label>
              <label className="text-sm font-medium text-slate-700">Account name
                <input required name="name" defaultValue={account.name} maxLength={120} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </label>
              <label className="text-sm font-medium text-slate-700 sm:col-span-2">Description
                <input name="description" defaultValue={account.description ?? ""} maxLength={500} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </label>
              <label className="text-sm font-medium text-slate-700 sm:col-span-2">Parent account
                <select name="parentAccountId" defaultValue={account.parentAccountId ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                  <option value="">No parent</option>
                  {parents.map((parent) => <option key={parent.id} value={parent.id}>{parent.code} · {parent.name}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input type="checkbox" name="isCashAccount" defaultChecked={account.isCashAccount} className="h-4 w-4 rounded border-slate-300" />
                Cash or bank account
              </label>
              <label className="text-sm font-medium text-slate-700">Cash flow activity
                <select name="cashFlowActivity" defaultValue={account.cashFlowActivity ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                  <option value="">Unclassified</option>
                  <option value="operating">Operating</option>
                  <option value="investing">Investing</option>
                  <option value="financing">Financing</option>
                </select>
              </label>
              <p className="text-xs text-slate-500 sm:col-span-2">Account type and campus scope cannot be changed after creation because they affect posted journals and account mappings.</p>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">Save changes</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
