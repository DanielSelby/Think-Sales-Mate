"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

function initials(email: string) {
  const name = email.split("@")[0];
  return name.slice(0, 2).toUpperCase();
}

export function UserMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="relative ml-auto">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-ledger-100 text-xs font-semibold text-ledger-700 hover:bg-ledger-200 dark:bg-white/10 dark:text-ledger-100 dark:hover:bg-white/20"
        aria-label="Account menu"
      >
        {initials(email)}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-52 rounded-md border border-ledger-100 bg-white py-1 shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <div className="truncate border-b border-ledger-50 px-3 py-2 text-xs text-ledger-500 dark:border-ledger-700/50 dark:text-ledger-400">
            {email}
          </div>
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-alert hover:bg-alert-soft dark:hover:bg-alert/10"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
