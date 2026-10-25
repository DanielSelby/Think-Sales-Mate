"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { logoutPlatformAdmin } from "./login/actions";

export default function PlatformAdminSignOutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function signOut() {
    setError(null);
    startTransition(async () => {
      const result = await logoutPlatformAdmin();
      if (result.error) {
        setError(result.error);
        return;
      }
      router.replace("/platform-admin/login");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        onClick={signOut}
        disabled={pending}
        className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        {pending ? "Signing out…" : "Sign out"}
      </button>
      {error && <span role="alert" className="mt-1 text-xs text-red-600">{error}</span>}
    </div>
  );
}
