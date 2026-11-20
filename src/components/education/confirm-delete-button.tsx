"use client";

import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";

export function ConfirmDeleteButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      onClick={(event) => {
        if (!window.confirm("Delete this unposted expense? This action cannot be undone.")) {
          event.preventDefault();
        }
      }}
      className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:cursor-wait disabled:opacity-70"
    >
      {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {pending ? "Deleting..." : "Delete"}
    </button>
  );
}
