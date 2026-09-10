"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { loginPlatformAdmin } from "./actions";

export default function PlatformAdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
        <h1 className="mt-2 text-2xl font-bold text-slate-950">System Administration Platform</h1>
        <p className="mt-2 text-sm text-slate-500">Sign in with your separate platform administrator account.</p>
        <label className="mt-6 block text-sm font-semibold text-slate-700">Email<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="username" className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3" /></label>
        <label className="mt-4 block text-sm font-semibold text-slate-700">
          Password
          <span className="relative mt-1 block">
            <input value={password} onChange={(e) => setPassword(e.target.value)} type={showPassword ? "text" : "password"} autoComplete="current-password" className="h-11 w-full rounded-lg border border-slate-200 px-3 pr-11" />
            <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 hover:text-slate-700">
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </span>
        </label>
        {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <button disabled={busy} className="mt-6 h-11 w-full rounded-lg bg-blue-600 font-semibold text-white disabled:opacity-50">{busy ? "Signing in..." : "Sign in to System Administration Platform"}</button>
        <Link href="/platform-admin/forgot-password" className="mt-4 block text-center text-sm font-semibold text-blue-600 hover:text-blue-800">Forgot password?</Link>
      </form>
    </main>
  );
}
