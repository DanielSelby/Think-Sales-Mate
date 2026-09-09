"use client";

import { useState } from "react";
import Link from "next/link";
import { createPlatformClient } from "@/lib/supabase/platform-client";

export default function PlatformForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const siteUrl = window.location.origin;
    const { error: resetError } = await createPlatformClient().auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${siteUrl}/platform-admin/auth/callback`,
    });
    if (resetError) setError(resetError.message);
    else setSent(true);
    setLoading(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <h1 className="text-2xl font-bold text-slate-950">Reset platform password</h1>
        {sent ? (
          <p className="mt-4 text-sm text-slate-600">If the account exists, a reset link was sent. Check the inbox and use the newest email.</p>
        ) : (
          <form onSubmit={submit} className="mt-6">
            <label className="text-sm font-semibold text-slate-700">
              Platform administrator email
              <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3" />
            </label>
            {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <button disabled={loading} className="mt-6 h-11 w-full rounded-lg bg-blue-600 font-semibold text-white disabled:opacity-50">
              {loading ? "Sending..." : "Send reset link"}
            </button>
          </form>
        )}
        <Link href="/platform-admin/login" className="mt-6 block text-center text-sm font-semibold text-blue-600">Back to platform login</Link>
      </div>
    </main>
  );
}
