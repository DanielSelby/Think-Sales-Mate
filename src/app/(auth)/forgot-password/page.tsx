"use client";

import { useState } from "react";
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

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M19 12H5" />
      <path d="m11 18-6-6 6-6" />
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

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const supabase = await createClient();
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${siteUrl}/auth/callback?next=/reset-password`
      });

      if (resetError) {
        setError(resetError.message);
        setLoading(false);
        return;
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the reset link.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f7f4] px-5">
        <div className="w-full max-w-[460px]">
          <div className="rounded-[28px] border border-[#e4e8e1] bg-white p-8 text-center shadow-[0_25px_70px_rgba(29,43,29,0.09)] sm:p-10">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-[#203820]">
              <CheckCircleIcon />
            </div>

            <h1 className="mt-5 text-2xl font-semibold text-[#20251f]">Check your inbox</h1>

            <p className="mt-3 text-sm leading-6 text-[#737970]">
              We sent a password reset link to <span className="font-medium text-[#30372d]">{email}</span>. Follow
              the link to set a new password.
            </p>

            <Link
              href="/login"
              className="mt-7 inline-flex h-11 items-center justify-center rounded-xl bg-[#203820] px-6 text-sm font-semibold text-white transition hover:bg-[#2b482b]"
            >
              Back to Sign In
            </Link>
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

            <h2 className="text-[27px] font-semibold tracking-[-0.7px] text-[#171b17]">Forgot password?</h2>

            <p className="mt-2 text-[13px] text-[#747a72]">
              Enter the email on your account and we&apos;ll send you a link to reset your password.
            </p>
          </div>

          {error && (
            <div className="mt-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-7">
            <label htmlFor="email" className="mb-2 block text-[12px] font-semibold text-[#30352f]">
              Email Address
            </label>

            <div className="relative">
              <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#7d847b]">
                <MailIcon />
              </div>

              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email address"
                className="h-12 w-full rounded-xl border border-[#dedfdc] bg-white pl-12 pr-4 text-sm text-[#252925] outline-none transition placeholder:text-[#a6aaa4] focus:border-[#496b46] focus:ring-4 focus:ring-[#496b46]/10"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-6 flex h-12 w-full items-center justify-center gap-3 rounded-xl bg-[#203421] px-5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(32,52,33,0.18)] transition hover:bg-[#2a432b] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Sending…" : "Send reset link"}
              {!loading && <ArrowRightIcon />}
            </button>
          </form>

          <Link
            href="/login"
            className="mt-6 flex items-center justify-center gap-1.5 text-[13px] font-medium text-[#30352f] transition hover:text-[#587c50]"
          >
            <ArrowLeftIcon />
            Back to Sign In
          </Link>
        </div>
      </div>
    </main>
  );
}