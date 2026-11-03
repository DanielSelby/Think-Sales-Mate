"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, LogOut, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatOrganizationExpiryDate, getOrganizationExpiryStatus } from "@/lib/organization-access-expiry";

export function OrganizationExpiryWarning({ expiryDate }: { expiryDate: string | null }) {
  const [dismissed, setDismissed] = useState(false);
  if (!expiryDate) return null;

  const { daysRemaining } = getOrganizationExpiryStatus(expiryDate);
  if (dismissed || daysRemaining === null || daysRemaining < 0 || daysRemaining > 7) return null;
  const message = daysRemaining === 0
    ? "Organization access expires today."
    : `Organization access expires in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}.`;

  return (
    <aside className="org-expiry-warning" role="alert">
      <div className="org-expiry-warning-icon"><AlertTriangle className="h-5 w-5" /></div>
      <div className="min-w-0 flex-1">
        <p className="font-bold">{message}</p>
        <p className="mt-1 text-sm">Renew by {formatOrganizationExpiryDate(expiryDate)} to avoid interruption. Contact your Platform Admin.</p>
      </div>
      <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss expiry warning" className="rounded-lg p-2 hover:bg-amber-100/70">
        <X className="h-4 w-4" />
      </button>
    </aside>
  );
}

export function OrganizationExpiredScreen({
  organizationName,
  expiryDate,
}: {
  organizationName: string;
  expiryDate: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const signOut = async () => {
    setBusy(true);
    setError(null);
    try {
      const { error: signOutError } = await createClient().auth.signOut();
      if (signOutError) throw signOutError;
      router.replace("/login");
      router.refresh();
    } catch (signOutError) {
      setError(`Could not sign out: ${signOutError instanceof Error ? signOutError.message : "Please try again."}`);
      setBusy(false);
    }
  };

  return (
    <main className="org-expired-screen">
      <section className="org-expired-card" role="alert">
        <div className="org-expired-emblem"><AlertTriangle className="h-8 w-8" /></div>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-orange-700">ThinkSales workspace access</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Access is paused</h1>
        <p className="mt-4 text-slate-700">
          Access for <strong>{organizationName}</strong> expired on <strong>{formatOrganizationExpiryDate(expiryDate)}</strong>.
          Your organization&apos;s data has not been deleted.
        </p>
        <p className="mt-3 text-sm text-slate-600">
          Contact your Platform Admin to renew the organization access date. Access will return after it is renewed.
        </p>
        {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <button type="button" disabled={busy} onClick={() => void signOut()} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-lg disabled:opacity-50">
          <LogOut className="h-4 w-4" />
          {busy ? "Signing out..." : "Sign out"}
        </button>
      </section>
    </main>
  );
}
