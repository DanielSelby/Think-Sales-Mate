"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Bell, Sun, Moon, ChevronDown, Check, LogOut, Settings } from "lucide-react";
import { useEffect } from "react";
import { CommandBar } from "./command-bar";
import { useAppStore, THEMES, type ThemeKey } from "@/store/useAppStore";
import { createClient } from "@/lib/supabase/client";

const THEME_OPTIONS: { key: ThemeKey; label: string }[] = [
  { key: "fintech", label: "Fintech Blue" },
  { key: "green",   label: "Forest Green" },
  { key: "navy",    label: "Navy & Gold"  },
  { key: "teal",    label: "Teal & Sand"  },
  { key: "plum",    label: "Plum & Blush" },
  { key: "eclipse", label: "Eclipse"      },
];

export function TopNav() {
  const { activeTheme, setTheme, commandBarOpen, setCommandBarOpen } = useAppStore();
  const theme   = THEMES[activeTheme];
  const sidebar = theme.sidebar;
  const topbar  = theme.topbar;
  const router  = useRouter();

  const [darkMode,    setDarkMode]    = useState(false);
  const [showThemes,  setShowThemes]  = useState(false);
  const [showUser,    setShowUser]    = useState(false);
  const [userName,    setUserName]    = useState("");
  const [userEmail,   setUserEmail]   = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setUserEmail(user.email ?? "");
          // Try full_name from user_metadata first, then email prefix
          const name = user.user_metadata?.full_name
            || user.user_metadata?.name
            || user.email?.split("@")[0]
            || "User";
          setUserName(name);
        }
      } catch { /* silent */ }
    };
    load();
  }, []);

  const initials = userName
    ? userName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
    : "U";

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  // Global Ctrl+/ shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault();
        setCommandBarOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setCommandBarOpen]);

  return (
    <>
    <CommandBar open={commandBarOpen} onClose={() => setCommandBarOpen(false)} />
    <header
      className="flex h-14 items-center gap-3 px-5 shrink-0 relative z-30"
      style={{ background: topbar.background, borderBottom: `1px solid ${sidebar.borderColor}` }}
    >
      {/* Search — opens command bar */}
      <button
        onClick={() => setCommandBarOpen(true)}
        className="flex items-center gap-2 h-8 w-64 rounded-xl border px-3 text-sm transition-all"
        style={{ borderColor: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.4)" }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = sidebar.hoverBackground; (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.7)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.4)"; }}
      >
        <Search className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 text-left hidden sm:block">Search anything…</span>
        <kbd className="hidden sm:flex items-center text-[10px] border rounded px-1.5 py-0.5 shrink-0"
          style={{ borderColor: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.25)" }}>
          Ctrl /
        </kbd>
      </button>

      <div className="flex-1" />

      {/* Theme picker */}
      <div className="relative">
        <button
          onClick={() => { setShowThemes(v => !v); setShowUser(false); }}
          className="flex items-center gap-2 h-8 px-3 rounded-xl text-xs font-semibold transition-all"
          style={{ color: "rgba(255,255,255,0.7)" }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = sidebar.hoverBackground }}
          onMouseLeave={e => { if (!showThemes) (e.currentTarget as HTMLElement).style.background = "transparent" }}
        >
          <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 shrink-0"
            style={{ background: theme.colors.accent }} />
          <span className="hidden sm:block">{THEME_OPTIONS.find(t => t.key === activeTheme)?.label}</span>
          <ChevronDown className="w-3 h-3 opacity-60" />
        </button>
        {showThemes && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowThemes(false)} />
            <div className="absolute right-0 top-10 z-50 w-52 rounded-xl border bg-white shadow-2xl overflow-hidden"
              style={{ borderColor: "#e2e8f0" }}>
              <div className="px-3 py-2.5 border-b border-slate-100">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Choose Theme</p>
              </div>
              {THEME_OPTIONS.map(t => {
                const th = THEMES[t.key];
                const isActive = activeTheme === t.key;
                return (
                  <button key={t.key}
                    onClick={() => { setTheme(t.key); setShowThemes(false); }}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors"
                    style={{ background: isActive ? th.colors.primaryPale : "transparent" }}
                    onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "#f8fafc" }}
                    onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent" }}
                  >
                    {/* Color swatch */}
                    <div className="flex gap-1 shrink-0">
                      <span className="w-4 h-4 rounded-full" style={{ background: th.colors.primary }} />
                      <span className="w-4 h-4 rounded-full" style={{ background: th.colors.accent }} />
                    </div>
                    <span className="text-xs font-medium flex-1" style={{ color: th.colors.text }}>{t.label}</span>
                    {isActive && (
                      <Check className="h-3.5 w-3.5 shrink-0" style={{ color: th.colors.primary }} />
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Dark mode */}
      <button
        onClick={() => { setDarkMode(v => !v); document.documentElement.classList.toggle("dark"); }}
        className="flex h-8 w-8 items-center justify-center rounded-xl transition-all"
        style={{ color: "rgba(255,255,255,0.7)" }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = sidebar.hoverBackground }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent" }}
      >
        {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      {/* Notifications */}
      <button
        className="relative flex h-8 w-8 items-center justify-center rounded-xl transition-all"
        style={{ color: "rgba(255,255,255,0.7)" }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = sidebar.hoverBackground }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent" }}
      >
        <Bell className="h-4 w-4" />
        <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full"
          style={{ background: theme.colors.accent, boxShadow: `0 0 0 2px ${topbar.background}` }} />
      </button>

      {/* User menu */}
      <div className="relative">
        <button
          onClick={() => { setShowUser(v => !v); setShowThemes(false); }}
          className="flex items-center gap-2 h-8 px-2 rounded-xl transition-all"
          style={{ color: "rgba(255,255,255,0.7)" }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = sidebar.hoverBackground }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent" }}
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold text-white shrink-0"
            style={{ background: theme.colors.accent }}>
            {initials}
          </div>
          {userName && (
            <span className="hidden sm:block text-xs font-semibold max-w-[100px] truncate"
              style={{ color: "rgba(255,255,255,0.85)" }}>
              {userName.split(" ")[0]}
            </span>
          )}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
        {showUser && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowUser(false)} />
            <div className="absolute right-0 top-10 z-50 w-52 rounded-xl border bg-white shadow-2xl overflow-hidden"
              style={{ borderColor: "#e2e8f0" }}>
              {/* User info header */}
              <div className="px-3 py-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold text-white shrink-0"
                    style={{ background: theme.colors.primary }}>
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">{userName || "User"}</p>
                    <p className="text-[10px] text-slate-400 truncate">{userEmail}</p>
                  </div>
                </div>
              </div>
              <button
                onClick={() => { router.push("/settings"); setShowUser(false); }}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-xs text-left text-slate-700 hover:bg-slate-50 transition-colors">
                <Settings className="h-3.5 w-3.5 text-slate-400" /> Settings
              </button>
              <div className="border-t border-slate-100" />
              <button
                onClick={handleSignOut}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-xs text-left text-red-600 hover:bg-red-50 transition-colors">
                <LogOut className="h-3.5 w-3.5" /> Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </header>
    </>
  );
}