"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import Link from "next/link";

// ── Theme definitions ─────────────────────────────────────────
const LOGIN_THEMES = {
  forest: {
    key: "forest",
    label: "Forest",
    dot: "#203822",
    panel: { bg: "#172517", accent: "#688d5d", text: "#FFFFFF", sub: "rgba(255,255,255,0.6)" },
    card:  { bg: "#FFFFFF", border: "#e7e9e5", shadow: "0 25px 70px rgba(29,43,29,0.08)" },
    brand: { bg: "#203822", text: "#FFFFFF" },
    btn:   { bg: "#203421", hover: "#2a432b", shadow: "0 8px 20px rgba(32,52,33,0.18)" },
    input: { border: "#dedfdc", focus: "#496b46", ring: "rgba(73,107,70,0.20)" },
    link:  "#587c50",
    check: { bg: "#304730", border: "#3d563c" },
  },
  royal: {
    key: "royal",
    label: "Royal",
    dot: "#003fbd",
    panel: { bg: "#001a6e", accent: "#4d94ff", text: "#FFFFFF", sub: "rgba(255,255,255,0.6)" },
    card:  { bg: "#FFFFFF", border: "#dde3f5", shadow: "0 25px 70px rgba(0,63,189,0.10)" },
    brand: { bg: "#003fbd", text: "#FFFFFF" },
    btn:   { bg: "#003fbd", hover: "#0048d4", shadow: "0 8px 20px rgba(0,63,189,0.25)" },
    input: { border: "#dde3f5", focus: "#003fbd", ring: "rgba(0,63,189,0.15)" },
    link:  "#003fbd",
    check: { bg: "#003fbd", border: "#003fbd" },
  },
  harvest: {
    key: "harvest",
    label: "Harvest",
    dot: "#283618",
    panel: { bg: "#1a2410", accent: "#FEFAE0", text: "#FFFFFF", sub: "rgba(255,255,255,0.55)" },
    card:  { bg: "#FEFAE0", border: "#e8e4c8", shadow: "0 25px 70px rgba(40,54,24,0.12)" },
    brand: { bg: "#283618", text: "#FEFAE0" },
    btn:   { bg: "#283618", hover: "#344a20", shadow: "0 8px 20px rgba(40,54,24,0.20)" },
    input: { border: "#d4cfb0", focus: "#283618", ring: "rgba(40,54,24,0.15)" },
    link:  "#283618",
    check: { bg: "#283618", border: "#283618" },
  },
  fintech: {
    key: "fintech",
    label: "Fintech",
    dot: "#153361",
    panel: { bg: "#0d1f3c", accent: "#C99A32", text: "#FFFFFF", sub: "rgba(255,255,255,0.6)" },
    card:  { bg: "#FFFFFF", border: "#dde3f0", shadow: "0 25px 70px rgba(21,51,97,0.10)" },
    brand: { bg: "#153361", text: "#FFFFFF" },
    btn:   { bg: "#153361", hover: "#1e4a8a", shadow: "0 8px 20px rgba(21,51,97,0.22)" },
    input: { border: "#dde3f0", focus: "#153361", ring: "rgba(21,51,97,0.15)" },
    link:  "#153361",
    check: { bg: "#153361", border: "#153361" },
  },
} as const;

type LoginThemeKey = keyof typeof LOGIN_THEMES;

// ── Icon helpers ──────────────────────────────────────────────
function BrandMark({ size = "md", theme }: { size?: "sm" | "md" | "lg"; theme: typeof LOGIN_THEMES[LoginThemeKey] }) {
  const sz = { sm: "h-9 w-9", md: "h-11 w-11", lg: "h-14 w-14" }[size];
  return (
    <div className={`${sz} flex shrink-0 items-center justify-center rounded-xl`}
      style={{ background: theme.brand.bg, boxShadow: `0 8px 24px ${theme.brand.bg}30` }}>
      <svg viewBox="0 0 42 42" className="h-[65%] w-[65%]" fill="none">
        <rect x="7"  y="19" width="7" height="15" rx="1.5" fill={theme.brand.text} />
        <rect x="17.5" y="12" width="7" height="22" rx="1.5" fill={theme.brand.text} />
        <rect x="28" y="6"  width="7" height="28" rx="1.5" fill={theme.brand.text} />
      </svg>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5">
      <path fill="#4285F4" d="M21.35 12.2c0-.7-.06-1.4-.18-2.05H12v3.88h5.22a4.46 4.46 0 0 1-1.94 2.93v2.43h3.14c1.84-1.7 2.93-4.2 2.93-7.19Z"/>
      <path fill="#34A853" d="M12 21.7c2.63 0 4.84-.87 6.45-2.35l-3.14-2.43c-.87.58-1.98.92-3.31.92-2.55 0-4.72-1.72-5.5-4.04H3.25v2.51A9.75 9.75 0 0 0 12 21.7Z"/>
      <path fill="#FBBC05" d="M6.5 13.8a5.87 5.87 0 0 1 0-3.6V7.69H3.25a9.76 9.76 0 0 0 0 8.62L6.5 13.8Z"/>
      <path fill="#EA4335" d="M12 6.16c1.43 0 2.72.49 3.74 1.46l2.8-2.8C16.83 3.25 14.62 2.3 12 2.3a9.75 9.75 0 0 0-8.75 5.39L6.5 10.2c.78-2.32 2.95-4.04 5.5-4.04Z"/>
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5">
      <rect x="3"    y="3"    width="8.5" height="8.5" fill="#F25022"/>
      <rect x="12.5" y="3"    width="8.5" height="8.5" fill="#7FBA00"/>
      <rect x="3"    y="12.5" width="8.5" height="8.5" fill="#00A4EF"/>
      <rect x="12.5" y="12.5" width="8.5" height="8.5" fill="#FFB900"/>
    </svg>
  );
}

// ── Theme Switcher ────────────────────────────────────────────
function ThemeSwitcher({ active, onChange }: { active: LoginThemeKey; onChange: (k: LoginThemeKey) => void }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 backdrop-blur-sm">
      {(Object.values(LOGIN_THEMES) as typeof LOGIN_THEMES[LoginThemeKey][]).map(t => (
        <button
          key={t.key}
          title={t.label}
          onClick={() => onChange(t.key as LoginThemeKey)}
          className="relative flex h-6 w-6 items-center justify-center rounded-full transition-all"
          style={{ background: t.dot, outline: active === t.key ? `2px solid white` : "none", outlineOffset: 2 }}
        />
      ))}
    </div>
  );
}

// ── Login Form ────────────────────────────────────────────────
function LoginForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [themeKey, setThemeKey] = useState<LoginThemeKey>("forest");
  const theme = LOGIN_THEMES[themeKey];

  const [email,       setEmail]       = useState("");
  const [password,    setPassword]    = useState("");
  const [error,       setError]       = useState<string | null>(searchParams.get("error"));
  const [loading,     setLoading]     = useState(false);
  const [showPass,    setShowPass]    = useState(false);
  const [rememberMe,  setRememberMe]  = useState(true);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) { setError(err.message); return; }
    router.push(searchParams.get("next") ?? "/dashboard");
    router.refresh();
  }

  async function handleOAuth(provider: "google" | "azure") {
    setError(null); setLoading(true);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}/auth/callback?next=${searchParams.get("next") ?? "/dashboard"}` },
      });
      if (err) { setError(err.message); setLoading(false); }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to continue.");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen overflow-hidden" style={{ background: "#f7f8f6" }}>
      <div className="grid min-h-screen lg:grid-cols-[50%_50%]">

        {/* ── LEFT PANEL ── */}
        <section className="relative hidden overflow-hidden px-10 py-9 text-white lg:flex lg:flex-col xl:px-16"
          style={{ background: theme.panel.bg }}>

          {/* Decorative */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -right-28 -top-24 h-[480px] w-[480px] rounded-full border border-white/[0.035]" />
            <div className="absolute -right-10 -top-6  h-[390px] w-[390px] rounded-full border border-white/[0.035]" />
            <div className="absolute bottom-[-180px] left-[-100px] h-[450px] w-[450px] rounded-full border border-white/[0.025]" />
          </div>

          {/* Top bar */}
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BrandMark size="md" theme={theme} />
              <div>
                <div className="text-[23px] font-semibold tracking-[-0.7px]">
                  ThinkSales <span style={{ color: theme.panel.accent }}>Pro</span>
                </div>
                <div className="mt-[-2px] text-[11px] tracking-wide" style={{ color: theme.panel.sub }}>
                  Sales Management System
                </div>
              </div>
            </div>
            {/* Theme switcher on left panel */}
            <ThemeSwitcher active={themeKey} onChange={setThemeKey} />
          </div>

          <div className="relative z-10 mt-16 max-w-[520px] xl:mt-20">
            <h1 className="text-[42px] font-semibold leading-[1.08] tracking-[-1.8px] xl:text-[48px]">
              Smart Sales.<br />Stronger Business.<br />Better{" "}
              <span style={{ color: theme.panel.accent }}>Growth.</span>
            </h1>
            <p className="mt-6 max-w-[450px] text-[15px] leading-6" style={{ color: theme.panel.sub }}>
              Think-SalesMate ERP helps you manage your sales, inventory, customers and reports in one powerful platform.
            </p>
          </div>

          {/* Features */}
          <div className="relative z-10 mt-10 space-y-5 xl:mt-12">
            {[
              { title: "Grow Your Sales",       desc: "Track performance and close more deals."        },
              { title: "Manage Inventory",       desc: "Real-time stock tracking across locations."     },
              { title: "Know Your Customers",    desc: "Build stronger relationships that last."        },
              { title: "Powerful Analytics",     desc: "Make data-driven decisions with ease."          },
            ].map(f => (
              <div key={f.title} className="flex items-center gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: "rgba(255,255,255,0.08)" }}>
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7">
                    <path d="m5 12 4 4L19 6"/>
                  </svg>
                </div>
                <div>
                  <p className="text-[14px] font-semibold">{f.title}</p>
                  <p className="mt-0.5 text-[12px]" style={{ color: theme.panel.sub }}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Dashboard preview */}
          <div className="relative z-10 mt-auto hidden pt-10 xl:block">
            <div className="relative ml-4 max-w-[500px] translate-y-20 rounded-t-2xl border border-white/10 p-3"
              style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(12px)" }}>
              <div className="rounded-xl border border-white/[0.06] p-4" style={{ background: "rgba(0,0,0,0.2)" }}>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-[8px]" style={{ color: theme.panel.sub }}>Dashboard</p>
                    <p className="mt-1 text-xs font-medium">Overview</p>
                  </div>
                  <div className="rounded-lg px-2 py-1 text-[8px]" style={{ background: "rgba(255,255,255,0.08)", color: theme.panel.sub }}>This month</div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[["Total Sales","GHS 154,890"],["Orders","1,245"],["Customers","856"]].map(([l,v]) => (
                    <div key={l} className="rounded-lg border border-white/[0.06] p-2" style={{ background: "rgba(255,255,255,0.03)" }}>
                      <p className="text-[7px]" style={{ color: theme.panel.sub }}>{l}</p>
                      <p className="mt-1 text-[11px] font-semibold">{v}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 h-24 rounded-lg border border-white/[0.06] p-3" style={{ background: "rgba(255,255,255,0.02)" }}>
                  <p className="text-[8px]" style={{ color: theme.panel.sub }}>Sales Trend</p>
                  <svg viewBox="0 0 400 70" className="mt-2 h-16 w-full" preserveAspectRatio="none">
                    <path d="M0 55 L50 48 L100 52 L150 30 L200 38 L250 18 L300 28 L350 10 L400 14"
                      fill="none" stroke={theme.panel.accent} strokeWidth="2.5" />
                    <path d="M0 55 L50 48 L100 52 L150 30 L200 38 L250 18 L300 28 L350 10 L400 14 V70 H0 Z"
                      fill={theme.panel.accent} opacity="0.12" />
                  </svg>
                </div>
              </div>
              <div className="absolute -right-5 top-[-20px] rounded-xl border border-white/10 px-4 py-3 shadow-xl"
                style={{ background: theme.panel.accent === "#FEFAE0" ? "#283618" : theme.brand.bg }}>
                <div className="flex items-center gap-2">
                  <span className="text-lg" style={{ color: theme.panel.accent }}>↗</span>
                  <div>
                    <p className="text-sm font-semibold">+24%</p>
                    <p className="text-[8px]" style={{ color: "rgba(255,255,255,0.5)" }}>Growth this month</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── RIGHT LOGIN PANEL ── */}
        <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-8 sm:px-8 lg:px-10 xl:px-16"
          style={{ background: themeKey === "harvest" ? "#FEFAE0" : "#f7f8f6" }}>

          {/* Decorative shapes */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -right-36 top-20 h-[430px] w-[430px] rounded-full border-[18px]"
              style={{ borderColor: themeKey === "harvest" ? "#e8e4c8" : "#e9ebe8" }} />
            <div className="absolute bottom-0 left-10 grid grid-cols-5 gap-3 opacity-30">
              {Array.from({ length: 35 }).map((_, i) => (
                <span key={i} className="h-1 w-1 rounded-full" style={{ background: theme.btn.bg + "40" }} />
              ))}
            </div>
          </div>

          {/* Mobile theme switcher */}
          <div className="absolute top-5 right-5 lg:hidden z-10">
            <div className="flex items-center gap-2 rounded-full border px-3 py-1.5"
              style={{ borderColor: theme.input.border, background: "white" }}>
              {(Object.values(LOGIN_THEMES) as typeof LOGIN_THEMES[LoginThemeKey][]).map(t => (
                <button key={t.key} title={t.label} onClick={() => setThemeKey(t.key as LoginThemeKey)}
                  className="h-5 w-5 rounded-full transition-all"
                  style={{ background: t.dot, outline: themeKey === t.key ? `2px solid ${t.dot}` : "none", outlineOffset: 2 }} />
              ))}
            </div>
          </div>

          <div className="relative z-10 w-full max-w-[480px]">
            {/* Mobile logo */}
            <div className="mb-7 flex items-center justify-between lg:hidden">
              <div className="flex items-center gap-2.5">
                <BrandMark size="sm" theme={theme} />
                <div>
                  <div className="text-lg font-semibold tracking-tight" style={{ color: theme.btn.bg }}>
                    ThinkSales <span style={{ color: theme.link }}>Pro</span>
                  </div>
                  <p className="text-[9px] text-gray-400">Sales Management System</p>
                </div>
              </div>
            </div>

            {/* Card */}
            <div className="rounded-[28px] p-7 sm:p-9"
              style={{ background: theme.card.bg, border: `1px solid ${theme.card.border}`, boxShadow: theme.card.shadow }}>
              <div className="text-center">
                <div className="mx-auto mb-5 flex justify-center">
                  <BrandMark size="lg" theme={theme} />
                </div>
                <h2 className="text-[27px] font-semibold tracking-[-0.8px]" style={{ color: theme.btn.bg }}>
                  Welcome back!
                </h2>
                <p className="mt-2 text-[13px] text-slate-400">Sign in to continue to Think-SalesMate ERP</p>
              </div>

              <form onSubmit={handleSubmit} className="mt-8">
                {error && (
                  <div className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
                )}

                {/* Email */}
                <div>
                  <label className="mb-2 block text-[12px] font-semibold" style={{ color: theme.btn.bg }}>Email Address</label>
                  <div className="relative">
                    <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>
                    </div>
                    <Input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)}
                      placeholder="Enter your email address"
                      className="h-12 rounded-xl pl-12 pr-4 text-sm shadow-none placeholder:text-slate-400"
                      style={{ borderColor: theme.input.border }} />
                  </div>
                </div>

                {/* Password */}
                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between">
                    <label className="text-[12px] font-semibold" style={{ color: theme.btn.bg }}>Password</label>
                    <Link href="/forgot-password" className="text-[12px] font-medium" style={{ color: theme.link }}>
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
                    </div>
                    <Input type={showPass ? "text" : "password"} autoComplete="current-password" required
                      value={password} onChange={e => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="h-12 rounded-xl pl-12 pr-12 text-sm shadow-none placeholder:text-slate-400"
                      style={{ borderColor: theme.input.border }} />
                    <button type="button" onClick={() => setShowPass(v => !v)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors">
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7">
                        <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10.7 10.7 0 0 1 12 5c5 0 8.5 4.5 9.5 7-.4 1-1.4 2.5-2.9 3.8M6.3 6.3C4.1 7.8 2.9 10 2.5 12c1 2.5 4.5 7 9.5 7 1.2 0 2.3-.2 3.3-.6"/>
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Remember me */}
                <div className="mt-5 flex items-center justify-between">
                  <button type="button" onClick={() => setRememberMe(v => !v)}
                    className="flex items-center gap-2 text-[12px] text-slate-500">
                    <span className="flex h-[17px] w-[17px] items-center justify-center rounded-[4px] border transition"
                      style={rememberMe ? { background: theme.check.bg, borderColor: theme.check.border } : { borderColor: "#cfd2cd", background: "white" }}>
                      {rememberMe && (
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="white" strokeWidth="2.5"><path d="m5 12 4 4L19 6"/></svg>
                      )}
                    </span>
                    Remember me
                  </button>
                  <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    <span className="flex h-4 w-4 items-center justify-center rounded-full border text-[10px]"
                      style={{ borderColor: theme.input.border, color: theme.link }}>✓</span>
                    Secure login
                  </span>
                </div>

                {/* Submit */}
                <button type="submit" disabled={loading}
                  className="mt-6 flex h-12 w-full items-center justify-center gap-3 rounded-xl px-5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ background: theme.btn.bg, boxShadow: theme.btn.shadow }}>
                  {loading ? "Signing in…" : "Sign In"}
                  {!loading && (
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>
                    </svg>
                  )}
                </button>
              </form>

              {/* Divider */}
              <div className="my-7 flex items-center gap-4">
                <div className="h-px flex-1" style={{ background: theme.card.border }} />
                <span className="text-[11px] text-slate-400">or continue with</span>
                <div className="h-px flex-1" style={{ background: theme.card.border }} />
              </div>

              {/* OAuth */}
              <div className="grid grid-cols-2 gap-3">
                <button type="button" disabled={loading} onClick={() => handleOAuth("google")}
                  className="flex h-11 items-center justify-center gap-2.5 rounded-xl border text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                  style={{ borderColor: theme.card.border }}>
                  <GoogleIcon /> Google
                </button>
                <button type="button" disabled={loading} onClick={() => handleOAuth("azure")}
                  className="flex h-11 items-center justify-center gap-2.5 rounded-xl border text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                  style={{ borderColor: theme.card.border }}>
                  <MicrosoftIcon /> Microsoft
                </button>
              </div>

              <p className="mt-7 text-center text-[13px] text-slate-400">
                Don&apos;t have an account?{" "}
                <Link href="/signup" className="font-semibold transition" style={{ color: theme.btn.bg }}>Sign up</Link>
              </p>
            </div>

            <p className="mt-5 text-center text-[10px] text-slate-400">
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