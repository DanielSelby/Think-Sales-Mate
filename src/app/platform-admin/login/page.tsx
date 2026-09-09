"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginPlatformAdmin } from "./actions";

export default function PlatformAdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await loginPlatformAdmin(email, password);
    if (result.error) setError(result.error);
    else { router.push("/platform-admin"); router.refresh(); }
    setBusy(false);
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-slate-800 bg-white p-8 shadow-2xl">
        <img src="/thinksales-logo.svg" alt="ThinkSales" className="h-14 w-14 rounded-xl" />
        <p className="mt-6 text-xs font-semibold uppercase tracking-widest text-blue-600">Restricted access</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">Platform Administration</h1>
        <p className="mt-2 text-sm text-slate-500">Sign in with your separate platform administrator account.</p>
        <label className="mt-6 block text-sm font-semibold text-slate-700">Email<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="username" className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3" /></label>
        <label className="mt-4 block text-sm font-semibold text-slate-700">Password<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3" /></label>
        {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <button disabled={busy} className="mt-6 h-11 w-full rounded-lg bg-blue-600 font-semibold text-white disabled:opacity-50">{busy ? "Signing in..." : "Sign in to Platform Admin"}</button>
      </form>
    </main>
  );
}
