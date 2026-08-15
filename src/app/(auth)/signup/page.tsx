"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

function LogoMark({ dark = false }: { dark?: boolean }) {
  return (
    <div
      className={`flex h-12 w-12 items-center justify-center rounded-xl ${
        dark ? "bg-[#203820]" : "bg-[#203820]"
      }`}
    >
      <svg
        viewBox="0 0 42 42"
        className="h-8 w-8"
        fill="none"
        aria-hidden="true"
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

function UserIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5.5 20c.8-3.4 3-5 6.5-5s5.7 1.6 6.5 5" />
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
      strokeWidth="1.8"
    >
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <path d="m4.5 7 7.5 6 7.5-6" />
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
      strokeWidth="1.8"
    >
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
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
      strokeWidth="1.8"
    >
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
      <path d="M9.9 5.1A10.7 10.7 0 0 1 12 4.8c5 0 8.5 4.2 9.5 7.2a10.8 10.8 0 0 1-3.2 4.8" />
      <path d="M6.2 6.2C4.3 7.5 3.1 9.3 2.5 12c1 3 4.5 7.2 9.5 7.2 1 0 2-.2 2.9-.5" />
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

function ChartIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
    >
      <path d="M4 19V9" />
      <path d="M10 19V5" />
      <path d="M16 19v-7" />
      <path d="M22 19V3" />
    </svg>
  );
}

function BoxIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
    >
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path d="m4 7.5 8 4.5 8-4.5" />
      <path d="M12 12v9" />
    </svg>
  );
}

function CustomersIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
    >
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20c.7-3.4 2.5-5 5.5-5s4.8 1.6 5.5 5" />
      <path d="M15 5.5a3 3 0 0 1 0 5.5" />
      <path d="M17 15c2 .4 3.3 2 3.8 5" />
    </svg>
  );
}

function AnalyticsIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
    >
      <path d="M12 3v9h9" />
      <path d="M20.5 14a9 9 0 1 1-10.5-11" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5">
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.68-.06-1.34-.17-1.98H12v3.75h5.38a4.6 4.6 0 0 1-1.99 3.02v2.51h3.22c1.89-1.74 2.99-4.31 2.99-7.3Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.97-.9 6.62-2.47l-3.22-2.51c-.9.6-2.05.96-3.4.96-2.61 0-4.82-1.76-5.62-4.13H3.05v2.59A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.38 13.85A6 6 0 0 1 6.07 12c0-.64.11-1.27.31-1.85V7.56H3.05A10 10 0 0 0 2 12c0 1.61.39 3.13 1.05 4.44l3.33-2.59Z"
      />
      <path
        fill="#EA4335"
        d="M12 6.02c1.47 0 2.79.5 3.83 1.49l2.87-2.87C16.96 2.98 14.7 2 12 2a10 10 0 0 0-8.95 5.56l3.33 2.59C7.18 7.78 9.39 6.02 12 6.02Z"
      />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5">
      <rect x="2" y="2" width="9" height="9" fill="#F25022" />
      <rect x="13" y="2" width="9" height="9" fill="#7FBA00" />
      <rect x="2" y="13" width="9" height="9" fill="#00A4EF" />
      <rect x="13" y="13" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

function Feature({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#3b542d] bg-[#1c3418] text-[#8bc45d]">
        {icon}
      </div>

      <div>
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="mt-0.5 text-xs text-[#b9c2b4]">{description}</p>
      </div>
    </div>
  );
}

export default function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setLoading(true);
    setError(null);

    try {
      const supabase = await createClient();

      const siteUrl =
        process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;

      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
          emailRedirectTo: `${siteUrl}/auth/callback?next=/onboarding`,
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }

      setSubmitted(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to create your account."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleOAuth(provider: "google" | "azure") {
    setError(null);
    setLoading(true);

    try {
      const supabase = await createClient();

      const { error: oauthError } =
        await supabase.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
          },
        });

      if (oauthError) {
        setError(oauthError.message);
        setLoading(false);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to continue with this provider."
      );
      setLoading(false);
    }
  }

  /*
   * Email confirmation screen
   */
  if (submitted) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f7f4] px-5">
        <div className="w-full max-w-[460px]">
          <div className="rounded-[28px] border border-[#e4e8e1] bg-white p-8 text-center shadow-[0_25px_70px_rgba(29,43,29,0.09)] sm:p-10">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-[#203820]">
              <svg
                viewBox="0 0 24 24"
                className="h-7 w-7 text-white"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="m5 12 4 4L19 6" />
              </svg>
            </div>

            <h1 className="mt-5 text-2xl font-semibold text-[#20251f]">
              Check your inbox
            </h1>

            <p className="mt-3 text-sm leading-6 text-[#737970]">
              We sent a confirmation link to{" "}
              <span className="font-medium text-[#30372d]">
                {email}
              </span>
              . Follow the link to finish setting up your ThinkSales Pro
              workspace.
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
    <main className="min-h-screen bg-[#f5f7f4] p-0 lg:p-2">
      <div className="flex min-h-screen overflow-hidden lg:min-h-[calc(100vh-16px)] lg:rounded-[28px]">

        {/* =========================================================
            LEFT BRAND PANEL
        ========================================================= */}
        <section className="relative hidden overflow-hidden bg-[#0e1d0d] lg:flex lg:w-[50%] xl:w-[51%]">
          {/* Background glow */}
          <div className="absolute -right-24 -top-24 h-[500px] w-[500px] rounded-full bg-[#2d5a23]/20 blur-3xl" />

          {/* Curved pattern */}
          <div className="pointer-events-none absolute -right-20 -top-20 h-[440px] w-[440px] rounded-full border border-[#718b5a]/10" />
          <div className="pointer-events-none absolute -right-10 -top-10 h-[380px] w-[380px] rounded-full border border-[#718b5a]/10" />
          <div className="pointer-events-none absolute right-10 top-10 h-[320px] w-[320px] rounded-full border border-[#718b5a]/10" />

          {/* Bottom glow */}
          <div className="absolute bottom-0 left-0 h-72 w-full bg-gradient-to-t from-[#0a1809] to-transparent" />

          <div className="relative z-10 flex w-full flex-col px-10 py-10 xl:px-16 xl:py-12">

            {/* Brand */}
            <div className="flex items-center gap-4">
              <LogoMark dark />

              <div>
                <div className="text-[26px] font-semibold tracking-tight text-white">
                  ThinkSales{" "}
                  <span className="text-[#76a950]">Pro</span>
                </div>

                <p className="text-xs text-[#b9c2b4]">
                  Sales Management System
                </p>
              </div>
            </div>

            {/* Hero */}
            <div className="mt-14 xl:mt-16">
              <h1 className="max-w-[520px] text-[42px] font-semibold leading-[1.08] tracking-[-1.5px] text-white xl:text-[48px]">
                Smart Sales.
                <br />
                Stronger Business.
                <br />
                Better{" "}
                <span className="text-[#79a957]">Growth.</span>
              </h1>

              <p className="mt-6 max-w-[460px] text-[15px] leading-7 text-[#b9c2b4]">
                ThinkSales Pro helps you manage your sales, inventory,
                customers and reports in one powerful platform.
              </p>
            </div>

            {/* Features */}
            <div className="mt-8 space-y-4 xl:mt-9">
              <Feature
                icon={<ChartIcon />}
                title="Grow Your Sales"
                description="Track performance and close more deals."
              />

              <Feature
                icon={<BoxIcon />}
                title="Manage Inventory"
                description="Real-time stock tracking across locations."
              />

              <Feature
                icon={<CustomersIcon />}
                title="Know Your Customers"
                description="Build stronger relationships that last."
              />

              <Feature
                icon={<AnalyticsIcon />}
                title="Powerful Analytics"
                description="Make data-driven decisions with ease."
              />
            </div>

            {/* Dashboard preview */}
            <div className="relative mt-7 flex-1">
              {/* Growth badge */}
              <div className="absolute right-3 top-0 z-20 rounded-xl border border-[#64844d] bg-[#263f20]/95 px-5 py-3 shadow-xl backdrop-blur">
                <div className="flex items-center gap-2">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-7 w-7 text-[#80bd58]"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="m4 16 5-5 4 3 7-8" />
                    <path d="M15 6h5v5" />
                  </svg>

                  <div>
                    <p className="text-xl font-semibold text-white">
                      +24%
                    </p>
                    <p className="text-[10px] text-[#c4cebd]">
                      Growth this month
                    </p>
                  </div>
                </div>
              </div>

              {/* Dashboard */}
              <div className="absolute bottom-[-65px] left-0 right-0 h-[290px] overflow-hidden rounded-t-[22px] border border-[#31452d] bg-[#172417]/95 shadow-2xl">
                <div className="flex h-full">

                  {/* Sidebar */}
                  <div className="w-[85px] shrink-0 border-r border-[#30422d] px-2 py-3">
                    <div className="mb-3 rounded-lg bg-[#284023] px-2 py-2 text-[8px] text-white">
                      ▮ Dashboard
                    </div>

                    <div className="space-y-3 px-2 text-[8px] text-[#89988a]">
                      <p>Overview</p>
                      <p>Sales</p>
                      <p>Inventory</p>
                      <p>Customers</p>
                      <p>Reports</p>
                      <p>Analytics</p>
                      <p>Settings</p>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 p-4">
                    <p className="text-sm font-medium text-white">
                      Dashboard
                    </p>
                    <p className="mt-1 text-[9px] text-[#879486]">
                      Overview
                    </p>

                    {/* KPIs */}
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {[
                        ["Total Sales", "GHS 154,890", "+18.2%"],
                        ["Orders", "1,245", "+15.6%"],
                        ["Customers", "856", "+8.7%"],
                      ].map(([title, value, growth]) => (
                        <div
                          key={title}
                          className="rounded-lg border border-[#3a5034] bg-[#1b2c1a] p-2"
                        >
                          <p className="text-[7px] text-[#9aa699]">
                            {title}
                          </p>
                          <p className="mt-1 text-[11px] font-semibold text-white">
                            {value}
                          </p>
                          <p className="mt-1 text-[7px] text-[#72ad50]">
                            {growth} vs last month
                          </p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 grid grid-cols-[1.6fr_1fr] gap-2">
                      {/* Chart */}
                      <div className="rounded-lg border border-[#3a5034] bg-[#1b2c1a] p-3">
                        <p className="text-[8px] font-medium text-white">
                          Sales Trend
                        </p>

                        <div className="relative mt-4 h-[105px]">
                          <svg
                            viewBox="0 0 400 120"
                            className="h-full w-full"
                            preserveAspectRatio="none"
                          >
                            <defs>
                              <linearGradient
                                id="salesGradient"
                                x1="0"
                                y1="0"
                                x2="0"
                                y2="1"
                              >
                                <stop
                                  offset="0%"
                                  stopColor="#72a94d"
                                  stopOpacity="0.45"
                                />
                                <stop
                                  offset="100%"
                                  stopColor="#72a94d"
                                  stopOpacity="0"
                                />
                              </linearGradient>
                            </defs>

                            <path
                              d="M0 95 C30 65 45 82 65 65 C90 43 105 85 130 72 C155 60 175 80 195 60 C220 38 240 62 260 50 C285 35 305 42 325 25 C350 5 375 20 400 3 V120 H0Z"
                              fill="url(#salesGradient)"
                            />

                            <path
                              d="M0 95 C30 65 45 82 65 65 C90 43 105 85 130 72 C155 60 175 80 195 60 C220 38 240 62 260 50 C285 35 305 42 325 25 C350 5 375 20 400 3"
                              fill="none"
                              stroke="#7db655"
                              strokeWidth="3"
                            />
                          </svg>

                          <div className="absolute bottom-0 left-0 right-0 flex justify-between text-[7px] text-[#788476]">
                            <span>Jan</span>
                            <span>Feb</span>
                            <span>Mar</span>
                            <span>Apr</span>
                            <span>May</span>
                            <span>Jun</span>
                            <span>Jul</span>
                          </div>
                        </div>
                      </div>

                      {/* Products */}
                      <div className="rounded-lg border border-[#3a5034] bg-[#1b2c1a] p-3">
                        <p className="text-[8px] font-medium text-white">
                          Top Products
                        </p>

                        <div className="mt-3 space-y-3">
                          {[
                            ["Wireless Earbuds", "GHS 12,450"],
                            ["4K LED TV", "GHS 9,870"],
                            ["Smartwatch", "GHS 6,230"],
                          ].map(([name, price]) => (
                            <div
                              key={name}
                              className="flex items-center gap-2"
                            >
                              <div className="h-6 w-6 rounded bg-[#31442e]" />

                              <div>
                                <p className="text-[7px] text-white">
                                  {name}
                                </p>
                                <p className="text-[7px] text-[#879486]">
                                  {price}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* =========================================================
            RIGHT SIDE
        ========================================================= */}
        <section className="relative flex min-h-screen flex-1 items-center justify-center overflow-hidden bg-[#f7f8f6] px-5 py-8 sm:px-8 lg:min-h-0 lg:px-10 xl:px-16">

          {/* Background decorative curves */}
          <div className="pointer-events-none absolute -right-40 top-20 h-[600px] w-[600px] rounded-full border-[55px] border-[#e8ebe6]" />
          <div className="pointer-events-none absolute -right-28 top-32 h-[500px] w-[500px] rounded-full border-[35px] border-[#eef0ed]" />

          {/* Top controls */}
          <div className="absolute right-5 top-5 z-20 flex items-center gap-3 sm:right-8 sm:top-7 lg:right-10 xl:right-16">

            <button
              type="button"
              aria-label="Theme"
              className="flex h-10 items-center gap-2 rounded-full border border-[#dfe2dd] bg-white px-3 text-[#333831] shadow-sm"
            >
              <span className="text-lg">☼</span>
              <span className="text-[#a0a49f]">☾</span>
            </button>

            <button
              type="button"
              className="flex h-10 items-center gap-2 rounded-full border border-[#dfe2dd] bg-white px-4 text-sm text-[#343933] shadow-sm"
            >
              <span className="text-base">◎</span>
              English
              <span className="text-xs">⌄</span>
            </button>
          </div>

          {/* Signup card */}
          <div className="relative z-10 mt-12 w-full max-w-[590px] rounded-[28px] border border-[#e5e7e3] bg-white p-7 shadow-[0_25px_80px_rgba(31,45,31,0.10)] sm:p-9 lg:mt-5 xl:p-10">

            {/* Header */}
            <div className="text-center">
              <div className="mx-auto">
                <LogoMark />
              </div>

              <h2 className="mt-4 text-[27px] font-semibold tracking-[-0.7px] text-[#171b17] sm:text-[30px]">
                Create your account
              </h2>

              <p className="mt-2 text-sm text-[#747a72]">
                Join ThinkSales Pro and grow your business
              </p>
            </div>

            {/* Error */}
            {error && (
              <div className="mt-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            {/* Form */}
            <form
              onSubmit={handleSubmit}
              className="mt-7 space-y-5"
            >
              {/* Full name */}
              <div>
                <label
                  htmlFor="fullName"
                  className="mb-2 block text-sm font-semibold text-[#252a24]"
                >
                  Full name
                </label>

                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#4f5750]">
                    <UserIcon />
                  </span>

                  <input
                    id="fullName"
                    type="text"
                    autoComplete="name"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your full name"
                    className="h-[52px] w-full rounded-xl border border-[#dfe1de] bg-white pl-12 pr-4 text-sm text-[#252925] outline-none transition placeholder:text-[#9da19c] focus:border-[#54794d] focus:ring-4 focus:ring-[#54794d]/10"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-sm font-semibold text-[#252a24]"
                >
                  Work email
                </label>

                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#4f5750]">
                    <MailIcon />
                  </span>

                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your work email address"
                    className="h-[52px] w-full rounded-xl border border-[#dfe1de] bg-white pl-12 pr-4 text-sm text-[#252925] outline-none transition placeholder:text-[#9da19c] focus:border-[#54794d] focus:ring-4 focus:ring-[#54794d]/10"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block text-sm font-semibold text-[#252a24]"
                >
                  Password
                </label>

                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#4f5750]">
                    <LockIcon />
                  </span>

                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create a password"
                    className="h-[52px] w-full rounded-xl border border-[#dfe1de] bg-white pl-12 pr-12 text-sm text-[#252925] outline-none transition placeholder:text-[#9da19c] focus:border-[#54794d] focus:ring-4 focus:ring-[#54794d]/10"
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[#4f5750] transition hover:text-[#203820]"
                  >
                    <EyeOffIcon />
                  </button>
                </div>

                {/* Password requirement */}
                <div className="mt-3 flex items-center gap-2 text-xs text-[#737970]">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4 text-[#56834d]"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M12 3 20 6v5c0 5-3.4 8.3-8 10-4.6-1.7-8-5-8-10V6l8-3Z" />
                    <path d="m8.5 12 2.2 2.2 4.8-5" />
                  </svg>

                  <span>
                    At least 8 characters with letters and numbers
                  </span>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="group flex h-[54px] w-full items-center justify-center rounded-xl bg-[#203820] px-5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(32,56,32,0.18)] transition hover:bg-[#2a4829] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span>
                  {loading ? "Creating account..." : "Create account"}
                </span>

                {!loading && (
                  <span className="ml-auto transition-transform group-hover:translate-x-1">
                    <ArrowRightIcon />
                  </span>
                )}
              </button>
            </form>

            {/* Divider */}
            <div className="my-6 flex items-center gap-4">
              <div className="h-px flex-1 bg-[#e1e3df]" />
              <span className="text-xs text-[#777d75]">
                or sign up with
              </span>
              <div className="h-px flex-1 bg-[#e1e3df]" />
            </div>

            {/* OAuth */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => handleOAuth("google")}
                className="flex h-[52px] items-center justify-center gap-3 rounded-xl border border-[#dfe1de] bg-white text-sm font-medium text-[#30352f] transition hover:bg-[#f8f9f7] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <GoogleIcon />
                Google
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={() => handleOAuth("azure")}
                className="flex h-[52px] items-center justify-center gap-3 rounded-xl border border-[#dfe1de] bg-white text-sm font-medium text-[#30352f] transition hover:bg-[#f8f9f7] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <MicrosoftIcon />
                Microsoft
              </button>
            </div>

            {/* Login */}
            <p className="mt-7 text-center text-sm text-[#777d75]">
              Already have a workspace?{" "}
              <Link
                href="/login"
                className="font-semibold text-[#365532] transition hover:text-[#64885c]"
              >
                Sign in
              </Link>
            </p>
          </div>

          {/* Bottom dots */}
          <div className="pointer-events-none absolute bottom-6 left-8 grid grid-cols-5 gap-2 opacity-50 lg:left-12">
            {Array.from({ length: 25 }).map((_, i) => (
              <span
                key={i}
                className="h-1 w-1 rounded-full bg-[#b9c2b5]"
              />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}