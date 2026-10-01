"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { loginWithIdentifier } from "./actions";

function ModernGreenForm({ organizationName, preview, systemLogoUrl }: { organizationName: string | null; preview: boolean; systemLogoUrl: string | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (preview || loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await loginWithIdentifier(identifier, password);
      if (result.error) {
        setError(result.error);
        setLoading(false);
        return;
      }
      router.replace(searchParams.get("next") ?? "/dashboard");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to sign in. Please try again.");
      setLoading(false);
    }
  }

  async function oauth(provider: "google" | "azure") {
    if (preview || loading) return;
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}/auth/callback?next=${searchParams.get("next") ?? "/dashboard"}` },
      });
      if (oauthError) throw oauthError;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to start sign-in. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[inherit] items-center justify-center px-5 py-10 sm:px-10 lg:px-12 xl:px-14">
      <div className="w-full max-w-[500px] rounded-[28px] border border-slate-200/80 bg-white px-7 py-9 shadow-[0_24px_70px_rgba(15,23,42,0.12)] sm:px-10 sm:py-11">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200/80 bg-white p-2 shadow-lg shadow-slate-900/10">
            {systemLogoUrl ? (
              <img src={systemLogoUrl} alt="ThinkSales system logo" className="h-full w-full rounded-xl object-contain" />
            ) : (
              <svg viewBox="0 0 42 42" className="h-8 w-8 text-emerald-700" fill="none" aria-hidden="true">
                <rect x="7" y="19" width="7" height="15" rx="1.5" fill="currentColor" />
                <rect x="17.5" y="12" width="7" height="22" rx="1.5" fill="currentColor" />
                <rect x="28" y="6" width="7" height="28" rx="1.5" fill="currentColor" />
              </svg>
            )}
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900">Welcome back!</h1>
          <p className="mt-2 text-sm text-slate-500">
            Sign in to your {organizationName ? `${organizationName} ` : ""}ThinkSales Pro account.
          </p>
        </div>

        <form className="mt-8 space-y-5" onSubmit={submit}>
          <div>
            <label htmlFor="modern-login-email" className="mb-2 block text-sm font-semibold text-slate-800">Email address or username</label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-500" />
              <input
                id="modern-login-email"
                autoComplete="username"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                disabled={preview || loading}
                placeholder="you@company.com"
                className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-12 pr-4 text-sm text-slate-900 outline-none transition focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10 disabled:bg-slate-50"
              />
            </div>
          </div>
          <div>
            <label htmlFor="modern-login-password" className="mb-2 block text-sm font-semibold text-slate-800">Password</label>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-500" />
              <input
                id="modern-login-password"
                autoComplete="current-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={preview || loading}
                placeholder="Enter your password"
                className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-12 pr-12 text-sm text-slate-900 outline-none transition focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10 disabled:bg-slate-50"
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((visible) => !visible)}
                disabled={preview}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:text-slate-800 disabled:cursor-default"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 text-sm">
            <label className="flex items-center gap-2 text-slate-600">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
                disabled={preview}
                className="h-4 w-4 rounded border-slate-300 accent-emerald-700"
              />
              Remember me
            </label>
            <Link href="/forgot-password" onClick={(event) => { if (preview) event.preventDefault(); }} className="font-semibold text-emerald-800 hover:text-emerald-900">Forgot password?</Link>
          </div>

          {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button
            type="submit"
            disabled={preview || loading}
            className="flex h-12 w-full items-center justify-between rounded-xl bg-gradient-to-r from-emerald-700 to-emerald-600 px-5 text-sm font-semibold text-white shadow-lg shadow-emerald-900/15 transition hover:from-emerald-800 hover:to-emerald-700 disabled:cursor-default disabled:opacity-75"
          >
            <span>{preview ? "Sign in" : loading ? "Signing in..." : "Sign in"}</span>
            <ArrowRight className="h-5 w-5" />
          </button>
        </form>

        <div className="my-6 flex items-center gap-4 text-xs text-slate-400">
          <span className="h-px flex-1 bg-slate-200" />
          or continue with
          <span className="h-px flex-1 bg-slate-200" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button type="button" disabled={preview || loading} onClick={() => void oauth("google")} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-default">
            <GoogleMark /> Continue with Google
          </button>
          <button type="button" disabled={preview || loading} onClick={() => void oauth("azure")} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-default">
            <MicrosoftMark /> Continue with Microsoft
          </button>
        </div>
        <p className="mt-7 text-center text-xs text-slate-500">
          Don&apos;t have an account?{" "}
          <Link href="/signup" onClick={(event) => { if (preview) event.preventDefault(); }} className="font-semibold text-emerald-800 hover:text-emerald-900">Create account <ArrowRight className="inline h-3.5 w-3.5" /></Link>
        </p>
        {preview && <p className="mt-4 rounded-lg bg-blue-50 px-3 py-2 text-center text-xs font-medium text-blue-800">Preview only — theme changes are not active.</p>}
      </div>
    </div>
  );
}

function GoogleMark() {
  return <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true"><path fill="#4285F4" d="M21.35 12.2c0-.7-.06-1.4-.18-2.05H12v3.88h5.22a4.46 4.46 0 0 1-1.94 2.93v2.43h3.14c1.84-1.7 2.93-4.2 2.93-7.19Z" /><path fill="#34A853" d="M12 21.7c2.63 0 4.84-.87 6.45-2.35l-3.14-2.43c-.87.58-1.98.92-3.31.92-2.55 0-4.72-1.72-5.5-4.04H3.25v2.51A9.75 9.75 0 0 0 12 21.7Z" /><path fill="#FBBC05" d="M6.5 13.8a5.87 5.87 0 0 1 0-3.6V7.69H3.25a9.76 9.76 0 0 0 0 8.62L6.5 13.8Z" /><path fill="#EA4335" d="M12 6.16c1.43 0 2.72.49 3.74 1.46l2.8-2.8C16.83 3.25 14.62 2.3 12 2.3a9.75 9.75 0 0 0-8.75 5.39L6.5 10.2c.78-2.32 2.95-4.04 5.5-4.04Z" /></svg>;
}

function MicrosoftMark() {
  return <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true"><rect x="3" y="3" width="8.5" height="8.5" fill="#F25022" /><rect x="12.5" y="3" width="8.5" height="8.5" fill="#7FBA00" /><rect x="3" y="12.5" width="8.5" height="8.5" fill="#00A4EF" /><rect x="12.5" y="12.5" width="8.5" height="8.5" fill="#FFB900" /></svg>;
}

export function ModernGreenLogin({ organizationName = null, preview = false, device = "desktop", artworkUrl = null }: { organizationName?: string | null; preview?: boolean; device?: "desktop" | "tablet" | "mobile"; artworkUrl?: string | null }) {
  const [systemLogoUrl, setSystemLogoUrl] = useState<string | null>(null);
  const pageHeight = preview ? "min-h-[680px]" : "min-h-screen";
  const previewWidth = preview ? device === "mobile" ? "mx-auto max-w-[390px]" : device === "tablet" ? "mx-auto max-w-[900px]" : "w-full" : "w-full";
  const splitLayout = !preview || device !== "mobile";

  useEffect(() => {
    fetch("/api/system-logo", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Could not load system logo.");
        return response.json() as Promise<{ logoUrl?: string | null }>;
      })
      .then((result) => setSystemLogoUrl(result.logoUrl ?? null))
      .catch((error) => {
        console.error("Could not load login system logo:", error);
        setSystemLogoUrl(null);
      });
  }, []);

  return (
    <main className={`${pageHeight} ${previewWidth} overflow-hidden bg-[#f5f8f6] text-slate-900`}>
      <div className={`grid min-h-[inherit] min-w-0 ${splitLayout ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : "grid-cols-1"}`}>
        <section className={`relative min-h-[inherit] min-w-0 overflow-hidden bg-[#edf3f0] p-3 sm:p-4 ${splitLayout ? "hidden lg:block" : "hidden"}`}>
          <div className="relative h-full min-h-[inherit] min-w-0 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_8px_32px_rgba(15,23,42,0.08)]">
            <img src={artworkUrl ?? "/login/modern-green-artwork.jpeg"} alt="ThinkSales Pro login artwork with sales dashboard on a laptop" className="absolute inset-0 h-full w-full object-cover object-center" />
          </div>
        </section>
        <section className="relative flex min-h-[inherit] min-w-0 flex-col overflow-hidden bg-[radial-gradient(ellipse_at_bottom_right,rgba(16,185,129,0.08),transparent_36%),#f8faf9]">
          <div className="flex items-center justify-end gap-3 px-5 pt-5 sm:px-8 lg:px-10">
            <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-2 text-xs font-medium text-slate-600 shadow-sm">◎ &nbsp; English &nbsp;⌄</span>
          </div>
          <div className="flex flex-1 items-center justify-center">
            <Suspense fallback={<div className="h-96" />}>
              <ModernGreenForm organizationName={organizationName} preview={preview} systemLogoUrl={systemLogoUrl} />
            </Suspense>
          </div>
          <p className="pb-4 text-center text-[11px] text-slate-400">© {new Date().getFullYear()} ThinkSales Pro. All rights reserved.</p>
        </section>
      </div>
    </main>
  );
}
