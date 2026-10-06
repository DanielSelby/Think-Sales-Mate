"use client";

import { useFormStatus } from "react-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function SubmitWorkspaceButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-live="polite" className="w-full disabled:cursor-wait disabled:opacity-70">
      {pending ? "Submitting registration..." : "Submit for review"}
    </Button>
  );
}

export function OrganizationRegistrationForm({
  action,
  error,
}: {
  action: (formData: FormData) => void | Promise<void>;
  error?: string;
}) {
  return (
    <form action={action} className="space-y-4 rounded-card border border-ledger-100 bg-white p-6 shadow-card dark:border-ledger-700 dark:bg-ink-900">
      {error && <p role="alert" className="rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">{error}</p>}
      <div className="space-y-1.5">
        <label htmlFor="name" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
          Business name
        </label>
        <Input id="name" name="name" required maxLength={120} placeholder="Boateng Traders Ltd." />
      </div>
      <p className="text-xs text-ledger-500 dark:text-ledger-400">
        After submission, your organization will be reviewed before workspace access is enabled.
      </p>
      <SubmitWorkspaceButton />
      <p className="min-h-5 text-center text-xs text-ledger-500 dark:text-ledger-400" aria-live="polite">
        Submitting disables the button until the registration is received.
      </p>
    </form>
  );
}
