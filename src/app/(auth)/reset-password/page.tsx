"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

function LogoMark() {
  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#203820]">
      <svg viewBox="0 0 42 42" className="h-8 w-8" fill="none" aria-hidden="true">
        <rect x="7" y="19" width="7" height="15" rx="1.5" fill="white" />
        <rect x="17.5" y="12" width="7" height="22" rx="1.5" fill="white" />
        <rect x="28" y="6" width="7" height="28" rx="1.5" fill="white" />
      </svg>
    </div>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7">
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
      <path d="M9.9 5.2A10.7 10.7 0 0 1 12 5c5 0 8.5 4.5 9.5 7-.4 1-1.4 2.5-2.9 3.8" />
      <path d="M6.3 6.3C4.1 7.8 2.9 10 2.5 12c1 2.5 4.5 7 9.5 7 1.2 0 2.3-.2 3.3-.6" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7 text-white" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasValidSession, setHasValidSession] = useState(false);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = await createClient();
      const {
        data: { session }
      } = await supabase.auth.getSession();
      setHasValidSession(!!session);
      setCheckingSession(false);
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);

    try {
      const supabase = await createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        setError(updateError.message);
        setLoading(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push("/dashboard");
        router.refresh();
      }, 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update your password.");
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f7f4] px-5">
        <p className="text-sm text-[#747a72]">Checking your reset link…</p>
      </main>
    );
  }

  if (!hasValidSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f7f4] px-5">
        <div className="w-full max-w-[460px]">
          <div className="rounded-[28px] border border-[#e4e8e1] bg-white p-8 text-center shadow-[0_25px_70px_rgba(29,43,29,0.09)] sm:p-10">
            <h1 className="text-2xl font-semibold text-[#20251f]">This link has expired</h1>
            <p className="mt-3 text-sm leading-6 text-[#737970]">
              Password reset links only work once and expire after a short time. Request a new one to continue.
            </p>
            <Link
              href="/forgot-password"
              className="mt-7 inline-flex h-11 items-center justify-center rounded-xl bg-[#203820] px-6 text-sm font-semibold text-white transition hover:bg-[#2b482b]"
            >
              Request a new link
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (success) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f7f4] px-5">
        <div className="w-full max-w-[460px]">
          <div className="rounded-[28px] border border-[#e4e8e1] bg-white p-8 text-center shadow-[0_25px_70px_rgba(29,43,29,0.09)] sm:p-10">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-[#203820]">
              <CheckCircleIcon />
            </div>
            <h1 className="mt-5 text-2xl font-semibold text-[#20251f]">Password updated</h1>
            <p className="mt-3 text-sm leading-6 text-[#737970]">Taking you to your dashboard…</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f7f4] px-5">
      <div className="w-full max-w-[460px]">
        <div className="rounded-[28px] border border-[#e5e7e3] bg-white p-7 shadow-[0_25px_70px_rgba(29,43,29,0.09)] sm:p-9">
          <div className="text-center">
            <div className="mx-auto mb-5">
              <LogoMark />
            </div>
            <h2 className="text-[27px] font-semibold tracking-[-0.7px] text-[#171b17]">Set a new password</h2>
            <p className="mt-2 text-[13px] text-[#747a72]">Choose a new password for your account.</p>
          </div>

          {error && (
            <div className="mt-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-7 space-y-5">
            <div>
              <label htmlFor="password" className="mb-2 block text-[12px] font-semibold text-[#30352f]">
                New password
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#7d847b]">
                  <LockIcon />
                </div>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="h-12 w-full rounded-xl border border-[#dedfdc] bg-white pl-12 pr-12 text-sm text-[#252925] outline-none transition placeholder:text-[#a6aaa4] focus:border-[#496b46] focus:ring-4 focus:ring-[#496b46]/10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#7d847b] transition hover:text-[#273126]"
                >
                  <EyeOffIcon />
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="mb-2 block text-[12px] font-semibold text-[#30352f]">
                Confirm new password
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#7d847b]">
                  <LockIcon />
                </div>
                <input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your new password"
                  className="h-12 w-full rounded-xl border border-[#dedfdc] bg-white pl-12 pr-4 text-sm text-[#252925] outline-none transition placeholder:text-[#a6aaa4] focus:border-[#496b46] focus:ring-4 focus:ring-[#496b46]/10"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex h-12 w-full items-center justify-center gap-3 rounded-xl bg-[#203421] px-5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(32,52,33,0.18)] transition hover:bg-[#2a432b] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Updating…" : "Reset password"}
              {!loading && <ArrowRightIcon />}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}