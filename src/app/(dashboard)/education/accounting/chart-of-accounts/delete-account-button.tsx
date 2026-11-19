"use client";

import { deleteEducationAccountingAccount } from "../actions";

export function DeleteAccountButton({ accountId, accountName }: { accountId: string; accountName: string }) {
  return (
    <form
      action={deleteEducationAccountingAccount}
      onSubmit={(event) => {
        if (!window.confirm(`Permanently delete "${accountName}"? Accounts used by journals, mappings, or other accounts cannot be deleted.`)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="accountId" value={accountId} />
      <button type="submit" className="text-xs font-semibold text-rose-700 hover:underline">
        Delete
      </button>
    </form>
  );
}
