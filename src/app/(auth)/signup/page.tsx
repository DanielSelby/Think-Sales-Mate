"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = await createClient();
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/onboarding`
      }
    });

    setLoading(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ledger-50 px-4 dark:bg-ink-950">
        <div className="max-w-sm rounded-card border border-ledger-100 bg-white p-6 text-center shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <p className="font-display text-lg font-semibold text-ledger-900 dark:text-white">Check your inbox</p>
          <p className="mt-2 text-sm text-ledger-500 dark:text-ledger-400">
            We sent a confirmation link to {email}. Follow it to finish setting up your workspace.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ledger-50 px-4 dark:bg-ink-950">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="font-display text-2xl font-semibold text-ledger-900 dark:text-white">SalesMate</p>
          <p className="mt-1 text-sm text-ledger-500 dark:text-ledger-400">Create your workspace</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-card border border-ledger-100 bg-white p-6 shadow-card dark:border-ledger-700 dark:bg-ink-900">
          {error && <p className="rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">{error}</p>}

          <div className="space-y-1.5">
            <label htmlFor="fullName" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
              Full name
            </label>
            <Input id="fullName" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ama Boateng" />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
              Work email
            </label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
              Password
            </label>
            <Input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating account…" : "Create account"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-ledger-500 dark:text-ledger-400">
          Already have a workspace?{" "}
          <Link href="/login" className="font-medium text-ledger-900 underline dark:text-white">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
