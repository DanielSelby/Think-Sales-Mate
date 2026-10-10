"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { createAccountFromDialog } from "@/app/(dashboard)/banking/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AddAccountDialog({
  trigger = "button",
}: {
  trigger?: "button" | "quick-action";
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function closeDialog() {
    if (!isPending) {
      setOpen(false);
      setError(null);
    }
  }

  function submitAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setError(null);
    startTransition(async () => {
      const result = await createAccountFromDialog(formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      form.reset();
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      {trigger === "button" ? (
        <Button type="button" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add Bank Account
        </Button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-xl border border-ledger-100 p-3 text-left hover:border-blue-200 hover:bg-blue-50/50 dark:border-slate-700/80 dark:hover:border-blue-900 dark:hover:bg-blue-500/5"
        >
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"><Plus className="h-4 w-4" /></span>
          <span className="mt-2 block text-xs font-semibold text-ink-900 dark:text-white">Add Bank Account</span>
          <span className="mt-0.5 block text-[10px] text-ledger-500 dark:text-ledger-400">Add an account or wallet</span>
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink-950/55 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDialog();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") closeDialog();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-account-dialog-title"
            className="my-auto max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-ledger-100 bg-white p-6 shadow-2xl dark:border-slate-700/80 dark:bg-ink-900"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="add-account-dialog-title" className="font-display text-lg font-semibold text-ink-900 dark:text-white">Add Bank Account</h2>
                <p className="mt-1 text-sm text-ledger-500 dark:text-ledger-400">Add a bank account, cash account, or mobile money wallet.</p>
              </div>
              <button type="button" onClick={closeDialog} disabled={isPending} aria-label="Close add account dialog" className="rounded-lg p-2 text-ledger-500 hover:bg-ledger-50 disabled:opacity-50 dark:hover:bg-white/[0.06]">
                <X className="h-4 w-4" />
              </button>
            </div>

            {error && <p role="alert" className="mt-4 rounded-xl bg-alert-soft px-3 py-2 text-sm text-alert">{error}</p>}

            <form onSubmit={submitAccount} encType="multipart/form-data" className="mt-5 space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="dialog-account-name" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">Account or provider name</label>
                <Input id="dialog-account-name" name="name" required maxLength={120} placeholder="Bank name, wallet provider, or till name" />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="dialog-account-number" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
                  Account or wallet number <span className="font-normal text-ledger-400">(optional)</span>
                </label>
                <Input id="dialog-account-number" name="account_number" maxLength={80} placeholder="Enter the bank account or mobile money number" />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="dialog-account-logo" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
                  Bank or wallet logo <span className="font-normal text-ledger-400">(optional)</span>
                </label>
                <Input id="dialog-account-logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="file:mr-3 file:rounded-lg file:border-0 file:bg-ledger-100 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-ink-900 dark:file:bg-white/[0.08] dark:file:text-white" />
                <p className="text-xs text-ledger-400">PNG, JPG, or WebP; up to 2 MB. This appears in the account card.</p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="dialog-account-type" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">Account type</label>
                <select id="dialog-account-type" name="account_type" defaultValue="cash" className="h-10 w-full rounded-md border border-ledger-200 bg-white px-3 text-sm dark:border-slate-700/80 dark:bg-ink-900 dark:text-white">
                  <option value="cash">Cash</option>
                  <option value="checking">Current account</option>
                  <option value="savings">Savings account</option>
                  <option value="mobile_money">Mobile money</option>
                  <option value="card">Card settlement account</option>
                  <option value="other">Other</option>
                </select>
                <p className="text-xs text-ledger-400">Choose the account type from this list. Custom account types are not currently supported.</p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="dialog-account-opening-balance" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">Opening balance in your organization&apos;s base currency</label>
                <Input id="dialog-account-opening-balance" name="opening_balance" type="number" step="0.01" min="0" defaultValue={0} required />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" onClick={closeDialog} disabled={isPending}>Cancel</Button>
                <Button type="submit" disabled={isPending}>{isPending ? "Adding…" : "Add account"}</Button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
