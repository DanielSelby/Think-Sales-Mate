"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Search, X, ChevronRight, Zap,
  LayoutDashboard, ShoppingCart, Boxes, Users, Contact,
  Wallet, Landmark, Receipt, Package, FolderKanban,
  BarChart3, Settings, Sparkles, Plus, ArrowLeftRight,
  FileText, Tag, TrendingUp, TrendingDown, Clock,
} from "lucide-react";
import { useAppStore, THEMES } from "@/store/useAppStore";
import { createClient } from "@/lib/supabase/client";

// ── Pages ─────────────────────────────────────────────────────
const PAGES = [
  { id: "dashboard",  label: "Dashboard",      path: "/dashboard",           icon: LayoutDashboard, group: "Pages" },
  { id: "sales",      label: "Sales",          path: "/sales",               icon: Receipt,         group: "Pages" },
  { id: "inventory",  label: "Inventory",      path: "/inventory",           icon: Boxes,           group: "Pages" },
  { id: "crm",        label: "CRM",            path: "/crm",                 icon: Contact,         group: "Pages" },
  { id: "hrm",        label: "HRM & Payroll",  path: "/hrm",                 icon: Users,           group: "Pages" },
  { id: "accounting", label: "Accounting",     path: "/accounting",          icon: Wallet,          group: "Pages" },
  { id: "banking",    label: "Banking",        path: "/banking",             icon: Landmark,        group: "Pages" },
  { id: "assets",     label: "Assets",         path: "/assets",              icon: Package,         group: "Pages" },
  { id: "projects",   label: "Projects",       path: "/projects",            icon: FolderKanban,    group: "Pages" },
  { id: "reports",    label: "Reports",        path: "/reports",             icon: BarChart3,       group: "Pages" },
  { id: "ai",         label: "AI Assistant",   path: "/ai",                  icon: Sparkles,        group: "Pages" },
  { id: "settings",   label: "Settings",       path: "/settings",            icon: Settings,        group: "Pages" },
];

// ── Quick Actions ─────────────────────────────────────────────
const buildActions = (router: ReturnType<typeof useRouter>, close: () => void) => [
  { id: "new-sale",     label: "New Sale",         icon: ShoppingCart,   action: () => { router.push("/sales/new");                 close(); } },
  { id: "new-invoice",  label: "New Invoice",      icon: FileText,       action: () => { router.push("/accounting/invoices/new");   close(); } },
  { id: "new-expense",  label: "New Expense",      icon: TrendingDown,   action: () => { router.push("/accounting/expenses/new");   close(); } },
  { id: "new-customer", label: "New Customer",     icon: Contact,        action: () => { router.push("/crm/customers/new");         close(); } },
  { id: "new-product",  label: "New Product",      icon: Tag,            action: () => { router.push("/inventory/products/new");    close(); } },
  { id: "new-transfer", label: "Bank Transfer",    icon: ArrowLeftRight, action: () => { router.push("/banking/transfers/new");     close(); } },
];

interface CommandItem {
  id:     string;
  label:  string;
  sub?:   string;
  icon:   any;
  group:  string;
  action: () => void;
}

export function CommandBar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { activeTheme } = useAppStore();
  const theme   = THEMES[activeTheme];
  const primary = theme.colors.primary;
  const accent  = theme.colors.accent;

  const [query,      setQuery]      = useState("");
  const [results,    setResults]    = useState<CommandItem[]>([]);
  const [searching,  setSearching]  = useState(false);
  const [activeIdx,  setActiveIdx]  = useState(0);
  const [recentItems, setRecentItems] = useState<CommandItem[]>([]);

  const inputRef  = useRef<HTMLInputElement>(null);
  const listRef   = useRef<HTMLDivElement>(null);
  const debounce  = useRef<NodeJS.Timeout>();

  const close = useCallback(() => {
    setQuery(""); setResults([]); setActiveIdx(0); onClose();
  }, [onClose]);

  const actions = useMemo(() => buildActions(router, close), [router, close]);

  // Focus on open
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 40);
      setQuery(""); setResults([]); setActiveIdx(0);
    }
  }, [open]);

  // Load recent items from localStorage
  useEffect(() => {
    if (!open) return;
    try {
      const stored = JSON.parse(localStorage.getItem("sm-recent-nav") || "[]") as string[];
      const items  = stored
        .map(path => PAGES.find(p => p.path === path))
        .filter(Boolean)
        .slice(0, 4)
        .map(p => ({
          id:     "recent-" + p!.id,
          label:  p!.label,
          sub:    "Recently visited",
          icon:   p!.icon,
          group:  "Recent",
          action: () => { navigate(p!.path); close(); },
        }));
      setRecentItems(items);
    } catch { /* silent */ }
  }, [open]);

  const navigate = (path: string) => {
    // Save to recent
    try {
      const stored = JSON.parse(localStorage.getItem("sm-recent-nav") || "[]") as string[];
      const updated = [path, ...stored.filter(p => p !== path)].slice(0, 8);
      localStorage.setItem("sm-recent-nav", JSON.stringify(updated));
    } catch { /* silent */ }
    router.push(path);
  };

  // Search across pages + Supabase
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setSearching(true);
      const q = query.trim().toLowerCase();

      // Page matches
      const pageMatches: CommandItem[] = PAGES
        .filter(p => p.label.toLowerCase().includes(q))
        .map(p => ({
          id:     "page-" + p.id,
          label:  p.label,
          sub:    "Navigate to page",
          icon:   p.icon,
          group:  "Pages",
          action: () => { navigate(p.path); close(); },
        }));

      // Action matches
      const actionMatches: CommandItem[] = actions
        .filter(a => a.label.toLowerCase().includes(q))
        .map(a => ({ ...a, sub: "Quick action", group: "Actions" }));

      // Supabase search
      const dbItems: CommandItem[] = [];
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          // Get org from store
          const orgId = useAppStore.getState().activeOrgId;
          if (orgId) {
            const [{ data: products }, { data: customers }, { data: sales }] = await Promise.all([
              supabase.from("products").select("id, name").eq("org_id", orgId).ilike("name", `%${q}%`).limit(3),
              supabase.from("customers").select("id, name").eq("org_id", orgId).ilike("name", `%${q}%`).limit(3),
              supabase.from("sales").select("id, customer_name, total").eq("org_id", orgId).ilike("customer_name", `%${q}%`).limit(3),
            ]);
            (products ?? []).forEach(p => dbItems.push({ id: "prod-"+p.id, label: p.name, sub: "Product", icon: Boxes, group: "Products", action: () => { navigate("/inventory"); close(); } }));
            (customers ?? []).forEach(c => dbItems.push({ id: "cust-"+c.id, label: c.name, sub: "Customer", icon: Contact, group: "Customers", action: () => { navigate("/crm"); close(); } }));
            (sales ?? []).forEach(s => dbItems.push({ id: "sale-"+s.id, label: s.customer_name || `Sale #${s.id.slice(-6)}`, sub: `Sale · $${Number(s.total).toFixed(2)}`, icon: Receipt, group: "Sales", action: () => { navigate(`/sales/${s.id}`); close(); } }));
          }
        }
      } catch { /* silent */ }

      setResults([...pageMatches, ...actionMatches, ...dbItems]);
      setSearching(false);
    }, 200);
    return () => clearTimeout(debounce.current);
  }, [query]);

  // Flat list for keyboard nav
  const flatItems = useMemo(() => {
    if (query.trim()) return results;
    return [...actions.map(a => ({ ...a, sub: "Quick action", group: "Quick Actions" })), ...recentItems, ...PAGES.map(p => ({ id: "page-" + p.id, label: p.label, sub: "Navigate", icon: p.icon, group: "Pages", action: () => { navigate(p.path); close(); } }))];
  }, [query, results, actions, recentItems]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape")     { close(); return; }
      if (e.key === "ArrowDown")  { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, flatItems.length - 1)); }
      if (e.key === "ArrowUp")    { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
      if (e.key === "Enter")      { e.preventDefault(); flatItems[activeIdx]?.action(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, flatItems, activeIdx, close]);

  // Scroll active into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIdx}"]`) as HTMLElement;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  useEffect(() => { setActiveIdx(0); }, [query]);

  if (!open) return null;

  // Group items
  const grouped = flatItems.reduce<Record<string, CommandItem[]>>((acc, item) => {
    if (!acc[item.group]) acc[item.group] = [];
    acc[item.group].push(item);
    return acc;
  }, {});

  let globalIdx = 0;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={close} />

      {/* Panel */}
      <div className="fixed left-1/2 top-[12%] -translate-x-1/2 z-50 w-full max-w-xl px-4">
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden"
          style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }}>

          {/* Input */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search pages, actions, customers, products…"
              className="flex-1 text-sm bg-transparent outline-none placeholder:text-slate-400 text-slate-800"
            />
            <div className="flex items-center gap-2 shrink-0">
              {searching && <div className="w-3.5 h-3.5 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin" />}
              {query && (
                <button onClick={() => setQuery("")} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <kbd className="hidden sm:flex items-center text-[10px] font-medium text-slate-400 border border-slate-200 rounded px-1.5 py-0.5 bg-slate-50">Esc</kbd>
            </div>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-[420px] overflow-y-auto py-2">
            {flatItems.length === 0 && query && !searching && (
              <div className="px-4 py-8 text-center">
                <Search className="w-8 h-8 mx-auto mb-2 text-slate-200" />
                <p className="text-sm text-slate-400">No results for &quot;<span className="font-medium text-slate-600">{query}</span>&quot;</p>
                <p className="text-xs text-slate-300 mt-1">Try a page name, customer, or product</p>
              </div>
            )}

            {Object.entries(grouped).map(([group, items]) => (
              <div key={group} className="mb-1">
                <p className="px-4 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">{group}</p>
                {items.map(item => {
                  const idx     = globalIdx++;
                  const isActive = idx === activeIdx;
                  const Icon    = item.icon;
                  return (
                    <button
                      key={item.id}
                      data-idx={idx}
                      onClick={item.action}
                      onMouseEnter={() => setActiveIdx(idx)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                      style={{ background: isActive ? theme.colors.primaryPale : "transparent" }}
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
                        style={{ background: isActive ? primary + "18" : "#f1f5f9" }}>
                        <Icon className="w-4 h-4" style={{ color: isActive ? primary : "#64748b" }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700 truncate">{item.label}</p>
                        {item.sub && <p className="text-[11px] text-slate-400 truncate">{item.sub}</p>}
                      </div>
                      {isActive && <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="border-t border-slate-100 px-4 py-2 flex items-center justify-between text-[11px] text-slate-400"
            style={{ background: "#fafafa" }}>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1"><kbd className="border border-slate-200 rounded px-1 bg-white">↑</kbd><kbd className="border border-slate-200 rounded px-1 bg-white">↓</kbd> navigate</span>
              <span className="flex items-center gap-1"><kbd className="border border-slate-200 rounded px-1 bg-white">↵</kbd> select</span>
              <span className="flex items-center gap-1"><kbd className="border border-slate-200 rounded px-1 bg-white">Esc</kbd> close</span>
            </div>
            <span className="flex items-center gap-1 font-semibold" style={{ color: primary }}>
              <Zap className="w-3 h-3" /> SalesMate
            </span>
          </div>
        </div>
      </div>
    </>
  );
}