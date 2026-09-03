"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Search, X, ChevronRight, Zap,
  LayoutDashboard, ShoppingCart, Boxes, Users, Contact,
  Wallet, Landmark, Receipt, Package, FolderKanban,
  BarChart3, Settings, Sparkles, Plus, ArrowLeftRight,
  FileText, Tag, TrendingUp, TrendingDown, Clock, MapPin, Truck,
} from "lucide-react";
import { useAppStore, THEMES } from "@/store/useAppStore";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/currency";

// The Zustand store's activeOrgId is never actually populated anywhere in
// this app — every page resolves the active org from the `active_org_id`
// cookie instead (see lib/organizations/current.ts). Read the same source
// here so search actually has an org to query against.
function getActiveOrgIdFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)active_org_id=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function resolveActiveOrgId(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<string | null> {
  const fromCookie = getActiveOrgIdFromCookie();
  if (fromCookie) return fromCookie;

  // Fallback if the cookie isn't present for some reason — first active
  // membership, same as the server-side resolver's default.
  const { data } = await supabase
    .from("organization_members")
    .select("org_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  return data?.org_id ?? null;
}

// ── Pages ─────────────────────────────────────────────────────
// ── Auto-detected from sidebar NAV_ITEMS ─────────────────────
// Add new pages to sidebar.tsx NAV_ITEMS and they appear here automatically
import { NAV_ITEMS } from "./sidebar";

function flattenNavItems(items: typeof NAV_ITEMS): { id: string; label: string; path: string; icon: any; group: string }[] {
  const result: { id: string; label: string; path: string; icon: any; group: string }[] = [];
  for (const item of items) {
    result.push({
      id:    item.href.replace(/\//g, "-").slice(1) || "home",
      label: item.label,
      path:  item.href,
      icon:  item.icon,
      group: "Pages",
    });
    if (item.children) {
      for (const child of item.children) {
        result.push({
          id:    child.href.replace(/\//g, "-").slice(1) || "child",
          label: child.label,
          path:  child.href,
          icon:  child.icon ?? item.icon,
          group: "Pages",
        });
      }
    }
  }
  // Add settings children
  result.push(
    { id: "settings-org",          label: "Organization Settings", path: "/settings/organization", icon: Settings, group: "Pages" },
    { id: "settings-team",         label: "Team Members",          path: "/settings/team",          icon: Users,    group: "Pages" },
    { id: "settings-billing",      label: "Billing",               path: "/settings/billing",       icon: Wallet,   group: "Pages" },
    { id: "settings-integrations", label: "Integrations",          path: "/settings/integrations",  icon: Settings, group: "Pages" },
    { id: "settings-locations",    label: "Locations",             path: "/settings/locations",     icon: MapPin,   group: "Pages" },
  );
  return result;
}

const PAGES = flattenNavItems(NAV_ITEMS);

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
  const [orgCurrency, setOrgCurrency] = useState("USD");

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

  // Load the org's currency once, so search results never hardcode "$"
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const orgId = await resolveActiveOrgId(supabase, user.id);
        if (!orgId) return;
        const { data } = await supabase.from("organizations").select("currency").eq("id", orgId).single();
        if (data?.currency) setOrgCurrency(data.currency);
      } catch { /* silent — falls back to USD */ }
    })();
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

      // Search the main operational records so the command bar works as a
      // system-wide finder rather than only a page navigator.
      const dbItems: CommandItem[] = [];
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const orgId = await resolveActiveOrgId(supabase, user.id);
          if (orgId) {
            const [
              { data: products },
              { data: customers },
              { data: sales },
              { data: invoices },
              { data: expenses },
              { data: suppliers },
              { data: locations },
            ] = await Promise.all([
              supabase.from("products").select("id, name, sku")
                .eq("org_id", orgId)
                .or(`name.ilike.%${q}%,sku.ilike.%${q}%`)
                .limit(4),
              supabase.from("customers").select("id, name, phone, email")
                .eq("org_id", orgId)
                .or(`name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`)
                .limit(4),
              supabase.from("sales").select("id, customer_name, total")
                .eq("org_id", orgId)
                .ilike("customer_name", `%${q}%`)
                .limit(4),
              supabase.from("invoices").select("id, customer_name, amount, status")
                .eq("org_id", orgId)
                .ilike("customer_name", `%${q}%`)
                .limit(4),
              supabase.from("expenses").select("id, category, vendor, amount")
                .eq("org_id", orgId)
                .or(`category.ilike.%${q}%,vendor.ilike.%${q}%`)
                .limit(4),
              supabase.from("suppliers").select("id, name, phone, email")
                .eq("org_id", orgId)
                .or(`name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`)
                .limit(4),
              supabase.from("business_locations").select("id, name, address, phone")
                .eq("org_id", orgId)
                .or(`name.ilike.%${q}%,address.ilike.%${q}%,phone.ilike.%${q}%`)
                .limit(4),
            ]);

            (products ?? []).forEach(p => dbItems.push({
              id: "prod-" + p.id, label: p.name, sub: `Product · ${p.sku ?? ""}`,
              icon: Boxes, group: "Products", action: () => { navigate("/inventory"); close(); }
            }));
            (customers ?? []).forEach(c => dbItems.push({
              id: "cust-" + c.id, label: c.name, sub: c.phone || c.email || "Customer",
              icon: Contact, group: "Customers", action: () => { navigate("/crm"); close(); }
            }));
            (sales ?? []).forEach(s => dbItems.push({
              id: "sale-" + s.id, label: s.customer_name || `Sale #${s.id.slice(-6)}`,
              sub: `Sale · ${formatMoney(Number(s.total), orgCurrency)}`,
              icon: Receipt, group: "Transactions", action: () => { navigate(`/sales/${s.id}`); close(); }
            }));
            (invoices ?? []).forEach(i => dbItems.push({
              id: "inv-" + i.id, label: i.customer_name || `Invoice #${i.id.slice(-6)}`,
              sub: `Invoice · ${formatMoney(Number(i.amount), orgCurrency)} · ${i.status}`,
              icon: FileText, group: "Transactions", action: () => { navigate("/accounting/invoices"); close(); }
            }));
            (expenses ?? []).forEach(e => dbItems.push({
              id: "exp-" + e.id, label: e.vendor || e.category, sub: `Expense · ${formatMoney(Number(e.amount), orgCurrency)}`,
              icon: TrendingDown, group: "Transactions", action: () => { navigate("/accounting/expenses"); close(); }
            }));
            (suppliers ?? []).forEach(s => dbItems.push({
              id: "supplier-" + s.id, label: s.name, sub: s.phone || s.email || "Supplier",
              icon: Truck, group: "Suppliers", action: () => { navigate("/purchases/suppliers"); close(); }
            }));
            (locations ?? []).forEach(l => dbItems.push({
              id: "location-" + l.id, label: l.name, sub: l.address || l.phone || "Business location",
              icon: MapPin, group: "Locations", action: () => { navigate("/settings/locations"); close(); }
            }));
          }
        }
      } catch { /* silent */ }

      setResults([...pageMatches, ...actionMatches, ...dbItems]);
      setSearching(false);
    }, 200);
    return () => clearTimeout(debounce.current);
  }, [query, orgCurrency]);

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
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100 bg-white">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search pages, actions, customers, products, transactions…"
              className="flex-1 text-sm bg-white outline-none placeholder:text-slate-400 text-slate-800"
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
          <div ref={listRef} className="max-h-[420px] overflow-y-auto py-2 bg-white">
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
