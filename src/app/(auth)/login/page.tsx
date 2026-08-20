"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import Link from "next/link";

function BrandMark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const dimensions = {
    sm: "h-9 w-9",
    md: "h-11 w-11",
    lg: "h-14 w-14",
  };

  return (
    <div
      className={`${dimensions[size]} flex shrink-0 items-center justify-center rounded-xl bg-[#203822] shadow-[0_8px_24px_rgba(20,50,25,0.18)]`}
    >
      <svg
        viewBox="0 0 42 42"
        className="h-[65%] w-[65%]"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect
          x="7"
          y="19"
          width="7"
          height="15"
          rx="1.5"
          fill="white"
        />
        <rect
          x="17.5"
          y="12"
          width="7"
          height="22"
          rx="1.5"
          fill="white"
        />
        <rect
          x="28"
          y="6"
          width="7"
          height="28"
          rx="1.5"
          fill="white"
        />
      </svg>
    </div>
  );
}

function FeatureIcon({
  type,
}: {
  type: "sales" | "inventory" | "customers" | "analytics";
}) {
  if (type === "sales") {
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      >
        <path d="M4 19V10" />
        <path d="M10 19V5" />
        <path d="M16 19v-7" />
        <path d="M22 19V3" />
      </svg>
    );
  }

  if (type === "inventory") {
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
        <path d="m4.5 7.5 7.5 4 7.5-4" />
        <path d="M12 11.5V21" />
      </svg>
    );
  }

  if (type === "customers") {
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <circle cx="9" cy="8" r="3" />
        <path d="M3.5 20c.5-3.4 2.4-5.2 5.5-5.2s5 1.8 5.5 5.2" />
        <path d="M16 11a3 3 0 1 0 0-6" />
        <path d="M16 14.8c2.4.2 3.9 1.8 4.5 4.2" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
    >
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="m7 15 3.5-4 3 2 4.5-6" />
      <path d="M15.5 7H18v2.5" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
    >
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
      <path d="M9.9 5.2A10.7 10.7 0 0 1 12 5c5 0 8.5 4.5 9.5 7-.4 1-1.4 2.5-2.9 3.8" />
      <path d="M6.3 6.3C4.1 7.8 2.9 10 2.5 12c1 2.5 4.5 7 9.5 7 1.2 0 2.3-.2 3.3-.6" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
    >
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5">
      <path
        fill="#4285F4"
        d="M21.35 12.2c0-.7-.06-1.4-.18-2.05H12v3.88h5.22a4.46 4.46 0 0 1-1.94 2.93v2.43h3.14c1.84-1.7 2.93-4.2 2.93-7.19Z"
      />
      <path
        fill="#34A853"
        d="M12 21.7c2.63 0 4.84-.87 6.45-2.35l-3.14-2.43c-.87.58-1.98.92-3.31.92-2.55 0-4.72-1.72-5.5-4.04H3.25v2.51A9.75 9.75 0 0 0 12 21.7Z"
      />
      <path
        fill="#FBBC05"
        d="M6.5 13.8a5.87 5.87 0 0 1 0-3.6V7.69H3.25a9.76 9.76 0 0 0 0 8.62L6.5 13.8Z"
      />
      <path
        fill="#EA4335"
        d="M12 6.16c1.43 0 2.72.49 3.74 1.46l2.8-2.8C16.83 3.25 14.62 2.3 12 2.3a9.75 9.75 0 0 0-8.75 5.39L6.5 10.2c.78-2.32 2.95-4.04 5.5-4.04Z"
      />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5">
      <rect x="3" y="3" width="8.5" height="8.5" fill="#F25022" />
      <rect x="12.5" y="3" width="8.5" height="8.5" fill="#7FBA00" />
      <rect x="3" y="12.5" width="8.5" height="8.5" fill="#00A4EF" />
      <rect x="12.5" y="12.5" width="8.5" height="8.5" fill="#FFB900" />
    </svg>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    searchParams.get("error")
  );
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setLoading(true);
    setError(null);

    const supabase = await createClient();

    const { error: signInError } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    setLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    router.push(searchParams.get("next") ?? "/dashboard");
    router.refresh();
  }

  async function handleOAuth(provider: "google" | "azure") {
    setError(null);
    setLoading(true);

    try {
      const supabase = await createClient();

      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${searchParams.get("next") ?? "/dashboard"}`,
        },
      });

      if (oauthError) {
        setError(oauthError.message);
        setLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to continue with this provider.");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#f7f8f6]">
      <div className="grid min-h-screen lg:grid-cols-[50%_50%]">
        {/* LEFT BRANDING PANEL */}
        <section className="relative hidden overflow-hidden bg-[#172517] px-10 py-9 text-white lg:flex lg:flex-col xl:px-16">
          {/* Decorative background */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -right-28 -top-24 h-[480px] w-[480px] rounded-full border border-white/[0.035]" />
            <div className="absolute -right-10 -top-6 h-[390px] w-[390px] rounded-full border border-white/[0.035]" />
            <div className="absolute bottom-[-180px] left-[-100px] h-[450px] w-[450px] rounded-full border border-white/[0.025]" />

            <svg
              className="absolute right-0 top-0 h-full w-full opacity-[0.08]"
              viewBox="0 0 700 900"
              preserveAspectRatio="none"
            >
              <path
                d="M420 0C500 180 470 330 610 470C700 560 730 700 650 900"
                fill="none"
                stroke="white"
                strokeWidth="1"
              />
              <path
                d="M480 0C560 170 520 330 660 470C750 560 770 710 690 900"
                fill="none"
                stroke="white"
                strokeWidth="1"
              />
              <path
                d="M540 0C620 170 570 330 700 470"
                fill="none"
                stroke="white"
                strokeWidth="1"
              />
            </svg>
          </div>

          <div className="relative z-10 flex items-center gap-3">
            <BrandMark size="md" />

            <div>
              <div className="text-[23px] font-semibold tracking-[-0.7px]">
                ThinkSales <span className="text-[#688d5d]">Pro</span>
              </div>
              <div className="mt-[-2px] text-[11px] tracking-wide text-white/50">
                Sales Management System
              </div>
            </div>
          </div>

          <div className="relative z-10 mt-16 max-w-[520px] xl:mt-20">
            <h1 className="text-[42px] font-semibold leading-[1.08] tracking-[-1.8px] xl:text-[48px]">
              Smart Sales.
              <br />
              Stronger Business.
              <br />
              Better{" "}
              <span className="text-[#688d5d]">Growth.</span>
            </h1>

            <p className="mt-6 max-w-[450px] text-[15px] leading-6 text-white/60">
              Think-SalesMate ERP helps you manage your sales, inventory,
              customers and reports in one powerful platform.
            </p>
          </div>

          <div className="relative z-10 mt-10 space-y-5 xl:mt-12">
            {[
              {
                icon: "sales" as const,
                title: "Grow Your Sales",
                description: "Track performance and close more deals.",
              },
              {
                icon: "inventory" as const,
                title: "Manage Inventory",
                description: "Real-time stock tracking across locations.",
              },
              {
                icon: "customers" as const,
                title: "Know Your Customers",
                description: "Build stronger relationships that last.",
              },
              {
                icon: "analytics" as const,
                title: "Powerful Analytics",
                description: "Make data-driven decisions with ease.",
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="flex items-center gap-4"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#223b22] text-[#91aa87] shadow-inner shadow-black/10">
                  <FeatureIcon type={feature.icon} />
                </div>

                <div>
                  <p className="text-[14px] font-semibold text-white">
                    {feature.title}
                  </p>
                  <p className="mt-0.5 text-[12px] text-white/45">
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Dashboard preview */}
          <div className="relative z-10 mt-auto hidden pt-10 xl:block">
            <div className="relative ml-4 max-w-[500px] translate-y-20 rounded-t-2xl border border-white/10 bg-[#1d321d]/95 p-3 shadow-[0_-15px_60px_rgba(0,0,0,0.2)]">
              <div className="rounded-xl border border-white/[0.06] bg-[#172717] p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-[8px] text-white/40">Dashboard</p>
                    <p className="mt-1 text-xs font-medium">Overview</p>
                  </div>
                  <div className="rounded-lg bg-[#2b4b2b] px-2 py-1 text-[8px] text-white/50">
                    This month
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[
                    ["Total Sales", "GHS 154,890"],
                    ["Orders", "1,245"],
                    ["Customers", "856"],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-lg border border-white/[0.06] bg-white/[0.025] p-2"
                    >
                      <p className="text-[7px] text-white/35">{label}</p>
                      <p className="mt-1 text-[11px] font-semibold">
                        {value}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-3 h-28 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                  <p className="text-[8px] text-white/40">Sales Trend</p>

                  <svg
                    viewBox="0 0 400 90"
                    className="mt-2 h-20 w-full"
                    preserveAspectRatio="none"
                  >
                    <path
                      d="M0 72 L35 65 L65 70 L100 48 L130 56 L160 38 L195 50 L230 31 L260 42 L295 25 L330 34 L365 14 L400 20"
                      fill="none"
                      stroke="#6d9664"
                      strokeWidth="3"
                    />
                    <path
                      d="M0 72 L35 65 L65 70 L100 48 L130 56 L160 38 L195 50 L230 31 L260 42 L295 25 L330 34 L365 14 L400 20 V90 H0 Z"
                      fill="url(#salesGradient)"
                      opacity="0.18"
                    />
                    <defs>
                      <linearGradient
                        id="salesGradient"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop offset="0" stopColor="#6d9664" />
                        <stop offset="1" stopColor="#6d9664" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
              </div>

              <div className="absolute -right-5 top-[-20px] rounded-xl border border-white/10 bg-[#355635] px-4 py-3 shadow-xl">
                <div className="flex items-center gap-2">
                  <span className="text-lg text-[#8fb486]">↗</span>
                  <div>
                    <p className="text-sm font-semibold">+24%</p>
                    <p className="text-[8px] text-white/45">
                      Growth this month
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* RIGHT LOGIN AREA */}
        <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-8 sm:px-8 lg:px-10 xl:px-16">
          {/* Light decorative shapes */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -right-36 top-20 h-[430px] w-[430px] rounded-full border-[18px] border-[#e9ebe8]" />
            <div className="absolute -right-24 top-32 h-[350px] w-[350px] rounded-full border border-[#e5e8e3]" />

            <div className="absolute bottom-0 left-10 grid grid-cols-5 gap-3 opacity-40">
              {Array.from({ length: 35 }).map((_, index) => (
                <span
                  key={index}
                  className="h-1 w-1 rounded-full bg-[#cbd2c8]"
                />
              ))}
            </div>

            <div className="absolute bottom-[-180px] right-[-150px] h-[500px] w-[500px] rounded-full border-[20px] border-[#eef0ed]" />
          </div>

          <div className="relative z-10 w-full max-w-[500px]">
            {/* Small mobile logo */}
            <div className="mb-7 flex items-center justify-between lg:hidden">
              <div className="flex items-center gap-2.5">
                <BrandMark size="sm" />

                <div>
                  <div className="text-lg font-semibold tracking-tight text-[#1d2b1d]">
                    ThinkSales{" "}
                    <span className="text-[#5f8157]">Pro</span>
                  </div>
                  <p className="text-[9px] text-gray-400">
                    Sales Management System
                  </p>
                </div>
              </div>
            </div>

            {/* Login card */}
            <div className="rounded-[28px] border border-[#e7e9e5] bg-white p-7 shadow-[0_25px_70px_rgba(29,43,29,0.08)] sm:p-9 md:p-10">
              <div className="text-center">
                <div className="mx-auto mb-5">
                  <BrandMark size="lg" />
                </div>

                <h2 className="text-[27px] font-semibold tracking-[-0.8px] text-[#20251f]">
                  Welcome back!
                </h2>

                <p className="mt-2 text-[13px] text-[#858a83]">
                  Sign in to continue to Think-SalesMate ERP
                </p>
              </div>

              <form onSubmit={handleSubmit} className="mt-8">
                {error && (
                  <div className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                    {error}
                  </div>
                )}

                {/* Email */}
                <div>
                  <label
                    htmlFor="email"
                    className="mb-2 block text-[12px] font-semibold text-[#30352f]"
                  >
                    Email Address
                  </label>

                  <div className="relative">
                    <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#7d847b]">
                      <MailIcon />
                    </div>

                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email address"
                      className="h-12 rounded-xl border-[#dedfdc] bg-white pl-12 pr-4 text-sm shadow-none placeholder:text-[#a6aaa4] focus:border-[#496b46] focus:ring-[#496b46]/20"
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between">
                    <label
                      htmlFor="password"
                      className="block text-[12px] font-semibold text-[#30352f]"
                    >
                      Password
                    </label>

                    <Link
                      href="/forgot-password"
                      className="text-[12px] font-medium text-[#30352f] transition hover:text-[#587c50]"
                    >
                      Forgot password?
                    </Link>
                  </div>

                  <div className="relative">
                    <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#7d847b]">
                      <LockIcon />
                    </div>

                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="h-12 rounded-xl border-[#dedfdc] bg-white pl-12 pr-12 text-sm shadow-none placeholder:text-[#a6aaa4] focus:border-[#496b46] focus:ring-[#496b46]/20"
                    />

                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={
                        showPassword
                          ? "Hide password"
                          : "Show password"
                      }
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-[#7d847b] transition hover:text-[#273126]"
                    >
                      <EyeOffIcon />
                    </button>
                  </div>
                </div>

                {/* Remember / Secure */}
                <div className="mt-5 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setRememberMe((value) => !value)}
                    className="flex items-center gap-2 text-[12px] text-[#4c514b]"
                  >
                    <span
                      className={`flex h-[17px] w-[17px] items-center justify-center rounded-[4px] border transition ${
                        rememberMe
                          ? "border-[#3d563c] bg-[#304730] text-white"
                          : "border-[#cfd2cd] bg-white"
                      }`}
                    >
                      {rememberMe && <CheckIcon />}
                    </span>

                    Remember me
                  </button>

                  <span className="flex items-center gap-1.5 text-[11px] text-[#70776e]">
                    <span className="flex h-4 w-4 items-center justify-center rounded-full border border-[#91a88d] text-[#5c8154]">
                      ✓
                    </span>
                    Secure login
                  </span>
                </div>

                {/* Sign in */}
                <button
                  type="submit"
                  disabled={loading}
                  className="mt-6 flex h-12 w-full items-center justify-center gap-3 rounded-xl bg-[#203421] px-5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(32,52,33,0.18)] transition hover:bg-[#2a432b] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Signing in…" : "Sign In"}

                  {!loading && <ArrowRightIcon />}
                </button>
              </form>

              {/* Divider */}
              <div className="my-7 flex items-center gap-4">
                <div className="h-px flex-1 bg-[#e6e7e4]" />
                <span className="text-[11px] text-[#92968f]">
                  or continue with
                </span>
                <div className="h-px flex-1 bg-[#e6e7e4]" />
              </div>

              {/* OAuth buttons — wired to real Supabase OAuth */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleOAuth("google")}
                  className="flex h-11 items-center justify-center gap-2.5 rounded-xl border border-[#dedfdb] bg-white text-sm font-medium text-[#333731] transition hover:bg-[#f8f9f7] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <GoogleIcon />
                  Google
                </button>

                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleOAuth("azure")}
                  className="flex h-11 items-center justify-center gap-2.5 rounded-xl border border-[#dedfdb] bg-white text-sm font-medium text-[#333731] transition hover:bg-[#f8f9f7] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <MicrosoftIcon />
                  Microsoft
                </button>
              </div>

              {/* Signup */}
              <p className="mt-7 text-center text-[13px] text-[#858a83]">
                Don&apos;t have an account?{" "}
                <Link
                  href="/signup"
                  className="font-semibold text-[#283527] transition hover:text-[#5b8053]"
                >
                  Sign up
                </Link>
              </p>
            </div>

            <p className="mt-5 text-center text-[10px] text-[#a2a69f]">
              © {new Date().getFullYear()} Think-SalesMate ERP. All rights reserved.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}