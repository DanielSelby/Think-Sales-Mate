"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { loginWithIdentifier } from "./actions";

export function isLoginArtworkVideo(url: string) {
  try {
    return /\.(mp4|webm)$/i.test(new URL(url, "https://login-artwork.invalid").pathname);
  } catch {
    return false;
  }
}

export function LoginArtwork({ url, className, poster = "/login/modern-green-artwork.jpeg", showControlsWhenReducedMotion = true, style }: {
  url: string;
  className: string;
  poster?: string;
  showControlsWhenReducedMotion?: boolean;
  style?: React.CSSProperties;
}) {
  const [reducedMotion, setReducedMotion] = useState(true);
  const isVideo = isLoginArtworkVideo(url);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(preference.matches);
    updatePreference();
    preference.addEventListener("change", updatePreference);
    return () => preference.removeEventListener("change", updatePreference);
  }, []);

  if (!isVideo) {
    return <img src={url} alt="ThinkSales Pro login artwork" className={className} style={style} />;
  }

  return (
    <video
      aria-label="ThinkSales Pro login artwork"
      className={className}
      style={style}
      autoPlay={!reducedMotion}
      loop={!reducedMotion}
      muted
      playsInline
      controls={reducedMotion && showControlsWhenReducedMotion}
      preload="metadata"
      poster={poster}
    >
      <source src={url} type={url.toLowerCase().includes(".webm") ? "video/webm" : "video/mp4"} />
    </video>
  );
}

function ModernGreenForm({ organizationName, preview, systemLogoUrl, loginFormTransparent }: {
  organizationName: string | null;
  preview: boolean;
  systemLogoUrl: string | null;
  loginFormTransparent: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const submissionInProgress = useRef(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (preview || submissionInProgress.current) return;
    submissionInProgress.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await loginWithIdentifier(identifier, password);
      if (result.error) {
        setError(result.error);
        setLoading(false);
        submissionInProgress.current = false;
        return;
      }
      router.replace(searchParams.get("next") ?? "/dashboard");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to sign in. Please try again.");
      setLoading(false);
      submissionInProgress.current = false;
    }
  }

  async function oauth(provider: "google" | "azure") {
    if (preview || submissionInProgress.current) return;
    submissionInProgress.current = true;
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
      submissionInProgress.current = false;
    }
  }

  return (
    <div className="modern-login-form-shell flex min-h-[inherit] items-center justify-center px-3 py-3 sm:px-6 lg:px-8">
      <div className={`modern-login-card login-card-enter login-neumorphic-card w-full max-w-[540px] rounded-[28px] px-7 py-9 sm:px-11 sm:py-12 ${loginFormTransparent ? "login-neumorphic-card-transparent" : ""}`}>
        <div className="flex flex-col items-center text-center">
          <div className="modern-login-logo login-logo-enter login-neumorphic-logo flex h-[76px] w-[76px] items-center justify-center rounded-[24px] p-2">
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
          <h1 className="modern-login-title mt-4 text-3xl font-bold tracking-tight text-slate-900">Welcome back!</h1>
          <p className="modern-login-subtitle mt-2 text-sm text-slate-500">
            Sign in to your {organizationName ? `${organizationName} ` : ""}ThinkSales Pro account.
          </p>
        </div>

        <form className="modern-login-fields login-fields-stagger mt-9 space-y-5" onSubmit={submit} aria-busy={loading}>
          <div>
            <label htmlFor="modern-login-email" className="mb-2 block text-sm font-semibold text-slate-800">Email address or username</label>
            <div className="relative">
              <UserRound className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-500" />
              <input
                id="modern-login-email"
                type="text"
                required
                autoComplete="username"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                disabled={preview || loading}
                aria-invalid={Boolean(error)}
                placeholder="you@company.com"
                className="modern-login-input login-neumorphic-input login-input login-input-green h-[52px] w-full rounded-xl border pl-12 pr-4 text-[15px] text-slate-900 outline-none"
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
                aria-invalid={Boolean(error)}
                placeholder="Enter your password"
                className="modern-login-input login-neumorphic-input login-input login-input-green h-[52px] w-full rounded-xl border pl-12 pr-12 text-[15px] text-slate-900 outline-none"
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((visible) => !visible)}
                disabled={preview}
                className="login-neumorphic-control absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:text-slate-800 disabled:cursor-default"
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
                className="h-4 w-4 rounded border-slate-300 accent-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
              />
              Remember me
            </label>
            <Link href="/forgot-password" onClick={(event) => { if (preview) event.preventDefault(); }} className="font-semibold text-emerald-800 hover:text-emerald-900">Forgot password?</Link>
          </div>

          {error && <p role="alert" aria-live="assertive" className="login-error-enter rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button
            type="submit"
            disabled={preview || loading}
            className="modern-login-submit login-neumorphic-submit login-submit flex h-[52px] w-full items-center justify-between rounded-xl px-5 text-sm font-semibold text-white disabled:cursor-default disabled:opacity-75"
          >
            <span>{preview ? "Sign in" : loading ? "Signing in..." : "Sign in"}</span>
            {loading ? <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" /> : <ArrowRight className="h-5 w-5" />}
          </button>
        </form>

        <div className="modern-login-divider my-6 flex items-center gap-4 text-xs text-slate-400">
          <span className="h-px flex-1 bg-slate-200" />
          or continue with
          <span className="h-px flex-1 bg-slate-200" />
        </div>
        <div className="modern-login-oauth grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button type="button" disabled={preview || loading} onClick={() => void oauth("google")} className="login-neumorphic-oauth flex h-11 items-center justify-center gap-2 rounded-xl text-xs font-semibold text-slate-700 transition hover:-translate-y-0.5 disabled:cursor-default">
            <GoogleMark /> Continue with Google
          </button>
          <button type="button" disabled={preview || loading} onClick={() => void oauth("azure")} className="login-neumorphic-oauth flex h-11 items-center justify-center gap-2 rounded-xl text-xs font-semibold text-slate-700 transition hover:-translate-y-0.5 disabled:cursor-default">
            <MicrosoftMark /> Continue with Microsoft
          </button>
        </div>
        <p className="modern-login-signup mt-7 text-center text-xs text-slate-500">
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

export function ModernGreenLogin({
  organizationName = null,
  preview = false,
  device = "desktop",
  artworkUrl = null,
  backgroundArtworkUrl = null,
  backgroundArtworkVisibility = 100,
  loginFormTransparent = false,
}: {
  organizationName?: string | null;
  preview?: boolean;
  device?: "desktop" | "tablet" | "mobile";
  artworkUrl?: string | null;
  backgroundArtworkUrl?: string | null;
  backgroundArtworkVisibility?: number;
  loginFormTransparent?: boolean;
}) {
  const [systemLogoUrl, setSystemLogoUrl] = useState<string | null>(null);
  const pageHeight = preview ? "min-h-[680px]" : "min-h-[100dvh]";
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
    <main
      className={`login-neumorphic-page modern-login-page login-page-enter ${pageHeight} ${previewWidth} text-slate-900`}
      style={{
        "--login-primary": "#1d8f5e",
        "--login-primary-hover": "#16744b",
      } as React.CSSProperties}
    >
      <div className={`modern-login-layout grid min-h-[inherit] min-w-0 ${splitLayout ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : "grid-cols-1"}`}>
        <section className={`relative min-h-[inherit] min-w-0 overflow-hidden bg-[#e9f4ed] p-3 sm:p-4 lg:p-5 ${splitLayout ? "hidden lg:block" : "hidden"}`}>
          <div className="relative h-full min-h-[inherit] min-w-0 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_8px_32px_rgba(15,23,42,0.08)]">
            <LoginArtwork
              url={artworkUrl ?? "/login/modern-green-artwork.jpeg"}
              className="absolute inset-0 h-full w-full object-cover object-center"
            />
          </div>
        </section>
        <section className="login-neumorphic-panel modern-login-form-panel relative flex min-h-[inherit] min-w-0 flex-col overflow-hidden">
          {backgroundArtworkUrl && (
            <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
              <LoginArtwork
                url={backgroundArtworkUrl}
                showControlsWhenReducedMotion={false}
                className="absolute inset-0 h-full w-full object-cover"
                style={{ opacity: backgroundArtworkVisibility / 100 }}
              />
              <div
                className="absolute inset-0 bg-white dark:bg-slate-950"
                style={{ opacity: ((100 - backgroundArtworkVisibility) / 100) * 0.45 }}
              />
            </div>
          )}
          <div className="modern-login-bubbles" aria-hidden="true">
            <span className="modern-login-bubble modern-login-bubble-one" />
            <span className="modern-login-bubble modern-login-bubble-two" />
            <span className="modern-login-bubble modern-login-bubble-three" />
            <span className="modern-login-bubble modern-login-bubble-four" />
          </div>
          <div className="login-background-glow" aria-hidden="true" />
          <div className="modern-login-language relative z-10 flex items-center justify-end gap-3 px-5 pt-5 sm:px-8 lg:px-10">
            <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-2 text-xs font-medium text-slate-600 shadow-sm">◎ &nbsp; English &nbsp;⌄</span>
          </div>
          <div className="modern-login-form-enter relative z-10 flex min-h-0 flex-1 items-center justify-center">
            <Suspense fallback={<div className="h-96" />}>
              <ModernGreenForm
                organizationName={organizationName}
                preview={preview}
                systemLogoUrl={systemLogoUrl}
                loginFormTransparent={loginFormTransparent}
              />
            </Suspense>
          </div>
          <p className="modern-login-copyright relative z-10 pb-4 text-center text-[11px] text-slate-400">© {new Date().getFullYear()} ThinkSales Pro. All rights reserved.</p>
        </section>
      </div>
    </main>
  );
}
