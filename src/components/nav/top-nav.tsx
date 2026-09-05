"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, Bell, Sun, Moon, ChevronDown, Check, LogOut, Settings, Package, CheckCircle2, MapPin, MessageSquare, Building2, Coins } from "lucide-react";
import { CommandBar } from "./command-bar";
import { useAppStore, THEMES, type ThemeKey } from "@/store/useAppStore";
import { useAccountingStore } from "@/lib/accounting/accounting-store";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/sales/format";

const THEME_OPTIONS: { key: ThemeKey; label: string }[] = [
  { key: "fintech", label: "Fintech Blue" },
  { key: "green",   label: "Forest Green" },
  { key: "navy",    label: "Navy & Gold"  },
  { key: "teal",    label: "Teal & Sand"  },
  { key: "plum",    label: "Plum & Blush" },
  { key: "eclipse", label: "Eclipse"      },
  { key: "harvest", label: "Harvest"      },
  { key: "royal",   label: "Royal Blue"   },
];

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  entity_id: string | null;
  created_at: string;
}

export function TopNav({ orgName, logoUrl, userName: initialUserName, userRole, allowedLocationIds = [], canViewAllBranches = false, canChangeTheme = false }: { orgName: string; logoUrl?: string | null; userName?: string | null; userRole?: string | null; allowedLocationIds?: string[]; canViewAllBranches?: boolean; canChangeTheme?: boolean }) {
  const { activeTheme, setTheme, commandBarOpen, setCommandBarOpen } = useAppStore();
  const theme   = THEMES[activeTheme];
  const sidebar = theme.sidebar;
  const topbar  = theme.topbar;
  const router  = useRouter();

  const [darkMode,          setDarkMode]          = useState(false);
  const [showThemes,        setShowThemes]        = useState(false);
  const [showUser,          setShowUser]          = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [userName,         setUserName]         = useState(initialUserName ?? "");
  const [userEmail,         setUserEmail]         = useState("");
  const [notifications,     setNotifications]     = useState<NotificationItem[]>([]);
  const [unreadCount,       setUnreadCount]       = useState(0);
  const [branchOptions,     setBranchOptions]     = useState<Array<{ id: string; name: string }>>([]);
  const [currencyOptions,   setCurrencyOptions]   = useState<Array<{ code: string; label: string }>>([]);
  const [popupNotification, setPopupNotification] = useState<NotificationItem | null>(null);
  const previousNotificationIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setUserEmail(user.email ?? "");
          const name = initialUserName
            || user.user_metadata?.full_name
            || user.user_metadata?.name
            || user.email?.split("@")[0]
            || "User";
          setUserName(name);

          const { data: membership } = await supabase
            .from("organization_members")
            .select("org_id, organizations(currency)")
            .eq("user_id", user.id)
            .eq("status", "active")
            .limit(1)
            .maybeSingle();

          const organization = Array.isArray(membership?.organizations)
            ? membership.organizations[0]
            : membership?.organizations;
          const orgId = membership?.org_id;
          if (orgId) {
            const { data: locations } = await supabase
              .from("business_locations")
              .select("id, name")
              .eq("org_id", orgId)
              .eq("is_active", true)
              .order("name");
            const options = canViewAllBranches
              ? (locations ?? [])
              : (locations ?? []).filter((location) => allowedLocationIds.includes(location.id));
            setBranchOptions(options);
            const selectedBranch = useAccountingStore.getState().currentBranch;
            if (!canViewAllBranches && selectedBranch === "all" && options.length > 0) {
              useAccountingStore.getState().setBranch(options[0].name);
            } else if (selectedBranch !== "all" && options.length > 0 && !options.some((location) => location.name === selectedBranch)) {
              useAccountingStore.getState().setBranch(options[0].name);
            }
          }
          if (organization?.currency) {
            const code = organization.currency;
            setCurrencyOptions([{ code, label: code }]);
            useAccountingStore.getState().setCurrency(code);
          }

          // Fetch recent notifications
          const { data: notifs } = await supabase
            .from("notifications")
            .select("id, title, message, type, is_read, entity_id, created_at")
            .order("created_at", { ascending: false })
            .limit(10);

          if (notifs) {
            const fresh = notifs.filter((notification) => !previousNotificationIds.current.has(notification.id));
            if (previousNotificationIds.current.size > 0 && fresh.length > 0) {
              const latest = fresh[0] as NotificationItem;
              setPopupNotification(latest);
              playNotificationBeep(latest.type);
              window.setTimeout(() => setPopupNotification(null), 5000);
            }
            previousNotificationIds.current = new Set(notifs.map((notification) => notification.id));
            setNotifications(notifs as NotificationItem[]);
            setUnreadCount(notifs.filter((n) => !n.is_read).length);
          }
        }
      } catch { /* silent */ }
    };
    load();
    const refreshTimer = window.setInterval(load, 5000);
    return () => window.clearInterval(refreshTimer);
  }, [initialUserName, allowedLocationIds, canViewAllBranches]);

  const initials = userName
    ? userName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
    : "U";

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  const markAllRead = async () => {
    const supabase = createClient();
    await supabase.from("notifications").update({ is_read: true }).eq("is_read", false);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  const { currentBranch, setBranch, currentCurrency, setCurrency } = useAccountingStore();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [showBranches, setShowBranches] = useState(false);
  const [showCurrencies, setShowCurrencies] = useState(false);

  const selectBranch = (branch: { id: string; name: string } | null) => {
    setBranch(branch?.name ?? "all");
    const params = new URLSearchParams(searchParams.toString());
    if (branch) params.set("location", branch.id);
    else params.delete("location");
    router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ""}`);
    setShowBranches(false);
  };

  // Global Ctrl+K / Ctrl+/ shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K" || e.key === "/")) {
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
        className="flex items-center gap-2 h-8.5 w-72 rounded-xl border px-3 text-xs transition-all"
        style={{ borderColor: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.5)" }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = sidebar.hoverBackground; (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.8)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.5)"; }}
      >
        <Search className="h-3.5 w-3.5 shrink-0 text-white/40" />
        <span className="flex-1 text-left hidden sm:block truncate">Search anything... (accounts, transactions, reports...)</span>
        <kbd className="hidden sm:flex items-center text-[10px] border rounded px-1.5 py-0.5 shrink-0 bg-white/5 border-white/20 text-white/50 font-mono">
          Ctrl + K
        </kbd>
      </button>

      <div className="flex-1" />
      <div className="hidden items-center gap-2 lg:flex">
        <img src={logoUrl || "/thinksales-logo.jpeg"} alt="" width={28} height={28} className="h-7 w-7 rounded-lg object-cover" />
        <span className="max-w-[180px] truncate text-xs font-semibold text-white/85">{orgName}</span>
      </div>

      {/* Branch Selector */}
      <div className="relative">
        <button
          disabled={branchOptions.length === 0}
          onClick={() => { setShowBranches(v => !v); setShowCurrencies(false); setShowThemes(false); setShowUser(false); setShowNotifications(false); }}
          className="flex items-center gap-1.5 h-8 px-2.5 rounded-xl text-xs font-medium transition-all text-white/80 hover:bg-white/10"
        >
          <Building2 className="h-3.5 w-3.5 text-white/60" />
          <span className="hidden sm:block">{branchOptions.length > 0 ? (currentBranch === "all" ? "All Branches" : currentBranch) : "No locations"}</span>
          <ChevronDown className="w-3 h-3 opacity-60" />
        </button>
        {showBranches && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowBranches(false)} />
            <div className="absolute right-0 top-10 z-50 w-48 rounded-xl border bg-white shadow-2xl overflow-hidden dark:bg-slate-900 border-slate-200 dark:border-slate-800">
              <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Select Branch</p>
              </div>
              {branchOptions.length > 0 ? (
                <>
                {canViewAllBranches && <button
                  onClick={() => selectBranch(null)}
                  className="flex w-full items-center justify-between px-3 py-2 text-xs text-left hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                >
                  <span>All Branches</span>
                  {currentBranch === "all" && <Check className="h-3.5 w-3.5 text-blue-600" />}
                </button>}
                {branchOptions.map((branch) => (
                <button
                  key={branch.id}
                  onClick={() => selectBranch(branch)}
                  className="flex w-full items-center justify-between px-3 py-2 text-xs text-left hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                >
                  <span>{branch.name}</span>
                  {currentBranch === branch.name && <Check className="h-3.5 w-3.5 text-blue-600" />}
                </button>
                ))}
                </>
              ) : (
                <p className="px-3 py-2 text-xs text-slate-500">No active locations configured</p>
              )}
            </div>
          </>
        )}
      </div>

      {/* Currency Selector */}
      <div className="relative">
        <button
          onClick={() => { setShowCurrencies(v => !v); setShowBranches(false); setShowThemes(false); setShowUser(false); setShowNotifications(false); }}
          className="flex items-center gap-1.5 h-8 px-2.5 rounded-xl text-xs font-medium transition-all text-white/80 hover:bg-white/10"
        >
          <Coins className="h-3.5 w-3.5 text-white/60" />
          <span>{currencyOptions.find(c => c.code === currentCurrency)?.label || currentCurrency}</span>
          <ChevronDown className="w-3 h-3 opacity-60" />
        </button>
        {showCurrencies && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowCurrencies(false)} />
            <div className="absolute right-0 top-10 z-50 w-40 rounded-xl border bg-white shadow-2xl overflow-hidden dark:bg-slate-900 border-slate-200 dark:border-slate-800">
              <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Select Currency</p>
              </div>
              {currencyOptions.length > 0 ? currencyOptions.map((curr) => (
                <button
                  key={curr.code}
                  onClick={() => { setCurrency(curr.code); setShowCurrencies(false); }}
                  className="flex w-full items-center justify-between px-3 py-2 text-xs text-left hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                >
                  <span>{curr.label}</span>
                  {currentCurrency === curr.code && <Check className="h-3.5 w-3.5 text-blue-600" />}
                </button>
              )) : (
                <p className="px-3 py-2 text-xs text-slate-500">No currency configured</p>
              )}
            </div>
          </>
        )}
      </div>

      {/* Theme picker */}
      <div className="relative">
        <button
          onClick={() => { if (!canChangeTheme) return; setShowThemes(v => !v); setShowUser(false); setShowNotifications(false); }}
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

      {/* Notifications Popover */}
      <div className="relative">
        <button
          onClick={() => { setShowNotifications(v => !v); setShowUser(false); setShowThemes(false); }}
          className="relative flex h-8 w-8 items-center justify-center rounded-xl transition-all text-white/70 hover:bg-white/10"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-sm">{unreadCount}</span>}
        </button>

        {showNotifications && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
            <div className="absolute right-0 top-10 z-50 w-80 rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-100 dark:border-slate-800">
                <p className="text-xs font-bold text-slate-800 dark:text-white">Notifications ({unreadCount} new)</p>
                <button onClick={markAllRead} className="text-[11px] font-medium text-blue-600 hover:underline">
                  Mark all read
                </button>
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {notifications.length === 0 ? <p className="p-4 text-xs text-slate-400">No notifications.</p> : notifications.map((notification) => (
                  <div key={notification.id} className="flex items-start gap-2.5 p-3 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors">
                    <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${notification.type.includes("reject") ? "bg-rose-100 text-rose-600" : notification.type.includes("order") ? "bg-blue-100 text-blue-600" : "bg-emerald-100 text-emerald-600"}`}><CheckCircle2 className="h-3 w-3" /></span>
                    <div className="min-w-0 flex-1"><p className="font-semibold text-slate-800 dark:text-white">{notification.title}</p><p className="text-slate-600 dark:text-slate-300 text-[11px] mt-0.5">{notification.message}</p></div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Messages Icon */}
      <div className="relative">
        <button
          onClick={() => router.push("/crm")}
          className="relative flex h-8 w-8 items-center justify-center rounded-xl transition-all text-white/70 hover:bg-white/10"
        >
          <MessageSquare className="h-4 w-4" />
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-sm">
            5
          </span>
        </button>
      </div>

      {/* User profile menu */}
      <div className="relative">
        <button
          onClick={() => { setShowUser(v => !v); setShowThemes(false); setShowNotifications(false); }}
          className="flex items-center gap-2.5 h-9 px-2 rounded-xl transition-all hover:bg-white/10"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 font-semibold text-xs text-white ring-2 ring-white/20 shrink-0">
            {initials}
          </div>
          <div className="text-left hidden md:block">
            <p className="text-xs font-semibold text-white leading-tight">{userName || "User"}</p>
            <p className="text-[10px] text-white/60 leading-tight">{userRole ? userRole.replace(/_/g, " ") : "User"}</p>
          </div>
          <ChevronDown className="h-3 w-3 text-white/60" />
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
    {popupNotification && <div className="fixed right-5 top-20 z-[60] w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900"><div className="flex items-start gap-3"><span className="rounded-full bg-blue-100 p-2 text-blue-600"><Bell className="h-4 w-4" /></span><div className="min-w-0"><p className="text-sm font-semibold text-slate-900 dark:text-white">{popupNotification.title}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-300">{popupNotification.message}</p></div><button onClick={() => setPopupNotification(null)} className="text-xs text-slate-400">×</button></div></div>}
    </>
  );
}

function playNotificationBeep(type: string) {
  if (typeof window === "undefined") return;
  const context = new AudioContext();
  const rejected = type.includes("reject");
  const transaction = type.includes("order") || type.includes("sale") || type.includes("transaction") || type.includes("product");
  const first = context.createOscillator();
  const second = context.createOscillator();
  const gain = context.createGain();
  first.type = rejected ? "sawtooth" : transaction ? "triangle" : "sine";
  second.type = first.type;
  first.frequency.value = rejected ? 260 : transaction ? 740 : 880;
  second.frequency.value = rejected ? 180 : transaction ? 1040 : 880;
  gain.gain.setValueAtTime(transaction ? 0.22 : 0.05, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + (transaction ? 0.55 : rejected ? 0.28 : 0.16));
  first.connect(gain).connect(context.destination);
  second.connect(gain);
  first.start();
  second.start(context.currentTime + (transaction ? 0.12 : 0));
  first.stop(context.currentTime + (transaction ? 0.32 : rejected ? 0.28 : 0.16));
  second.stop(context.currentTime + (transaction ? 0.55 : rejected ? 0.28 : 0.16));
  void context.resume();
}
