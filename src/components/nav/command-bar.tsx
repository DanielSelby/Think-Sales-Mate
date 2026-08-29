"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Search, X, ChevronRight, Zap,
  Settings, Plus, ArrowLeftRight,
  FileText, TrendingDown, Contact,
  ShoppingCart, Boxes, Receipt, Users,
  Package, MapPin, Tag,
} from "lucide-react";
import { useAppStore, THEMES } from "@/store/useAppStore";
import { createClient } from "@/lib/supabase/client";
import { NAV_ITEMS, type NavItem } from "./sidebar";

// ── Flatten sidebar nav into pages ────────────────────────────
function flattenNav(items: NavItem[]) {
  const result: { id: string; label: string; path: string; icon: any; group: string }[] = [];
  for (const item of items) {
    if (item.status === "soon") continue;
    result.push({ id: item.href.replace(/\//g, "-").slice(1) || "home", label: item.label, path: item.href, icon: item.icon, group: "Pages" });
    if (item.children) {
      for (const child of item.children) {
        result.push({ id: child.href.replace(/\//g, "-").slice(1), label: child.label, path: child.href, icon: child.icon ?? item.icon, group: "Pages" });
      }
    }
  }
  result.push(
    { id: "settings-org",          label: "Organization Settings", path: "/settings/organization", icon: Settings,  group: "Pages" },
    { id: "settings-team",         label: "Team Members",          path: "/settings/team",          icon: Users,     group: "Pages" },
    { id: "settings-billing",      label: "Billing",               path: "/settings/billing",       icon: FileText,  group: "Pages" },
    { id: "settings-locations",    label: "Locations",             path: "/settings/locations",     icon: MapPin,    group: "Pages" },
    { id: "settings-integrations", label: "Integrations",          path: "/settings/integrations",  icon: Settings,  group: "Pages" },
  );
  return result;
}

const ALL_PAGES = flattenNav(NAV_ITEMS);

// ── Quick Actions ─────────────────────────────────────────────
const buildActions = (router: ReturnType<typeof useRouter>, close: () => void) => [
  { id: "new-sale",     label: "New Sale",       icon: ShoppingCart,  action: () => { router.push("/sales/new");               close(); } },
  { id: "new-invoice",  label: "New Invoice",    icon: FileText,      action: () => { router.push("/accounting/invoices/new"); close(); } },
  { id: "new-expense",  label: "New Expense",    icon: TrendingDown,  action: () => { router.push("/accounting/expenses/new"); close(); } },
  { id: "new-customer", label: "New Customer",   icon: Contact,       action: () => { router.push("/crm/customers/new");       close(); } },
  { id: "new-product",  label: "New Product",    icon: Tag,           action: () => { router.push("/inventory/new");           close(); } },
  { id: "new-transfer", label: "Bank Transfer",  icon: ArrowLeftRight,action: () => { router.push("/banking/transfers/new");   close(); } },
  { id: "new-employee", label: "Add Employee",   icon: Users,         action: () => { router.push("/hrm/new");                 close(); } },
  { id: "new-asset",    label: "Add Asset",      icon: Package,       action: () => { router.push("/assets/new");              close(); } },
];

interface CommandItem {
  id:     string;
  label:  string;
  sub?:   string;
  icon:   any;
  group:  string;
  action: () => void;
  badge?: string;
}

export function CommandBar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { activeTheme } = useAppStore();
  const theme   = THEMES[activeTheme];
  const primary = theme.colors.primary;

  const [query,       setQuery]       = useState("");
  const [results,     setResults]     = useState<CommandItem[]>([]);
  const [searching,   setSearching]   = useState(false);
  const [activeIdx,   setActiveIdx]   = useState(0);
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

  // Load recent from localStorage
  useEffect(() => {
    if (!open) return;
    try {
      const stored = JSON.parse(localStorage.getItem("sm-recent-nav") || "[]") as string[];
      const items = stored
        .map(path => ALL_PAGES.find(p => p.path === path))
        .filter(Boolean).slice(0, 4)
        .map(p => ({
          id: "recent-" + p!.id, label: p!.label, sub: "Recently visited",
          icon: p!.icon, group: "Recent",
          action: () => { navigate(p!.path); close(); },
        }));
      setRecentItems(items);
    } catch { /* silent */ }
  }, [open]);

  const navigate = (path: string) => {
    try {
      const stored = JSON.parse(localStorage.getItem("sm-recent-nav") || "[]") as string[];
      localStorage.setItem("sm-recent-nav", JSON.stringify([path, ...stored.filter(p => p !== path)].slice(0, 8)));
    } catch { /* silent */ }
    router.push(path);
  };

  // Search — pages + database
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setSearching(true);
      const q = query.trim().toLowerCase();

      // Page matches
      const pageMatches: CommandItem[] = ALL_PAGES
        .filter(p => p.label.toLowerCase().includes(q))
        .map(p => ({ id: "page-" + p.id, label: p.label, sub: "Navigate to page", icon: p.icon, group: "Pages", action: () => { navigate(p.path); close(); } }));

      // Action matches
      const actionMatches: CommandItem[] = actions
        .filter(a => a.label.toLowerCase().includes(q))
        .map(a => ({ ...a, sub: "Quick action", group: "Actions" }));

      // Database search
      const dbItems: CommandItem[] = [];
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        const orgId = document.cookie.split("; ").find(r => r.startsWith("active_org_id="))?.split("=")[1] ?? useAppStore.getState().activeOrgId;

        if (user && orgId) {
          const [
            { data: sales },
            { data: customers },
            { data: products },
            { data: employees },
            { data: expenses },
            { data: invoices },
            { data: assets },
            { data: suppliers },
          ] = await Promise.all([
            supabase.from("sales").select("id, customer_name, total, sale_date").eq("org_id", orgId)
              .or(`customer_name.ilike.%${q}%`).limit(3),
            supabase.from("customers").select("id, name, email, phone").eq("org_id", orgId)
              .or(`name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`).limit(4),
            supabase.from("products").select("id, name, sku, stock_quantity").eq("org_id", orgId)
              .or(`name.ilike.%${q}%,sku.ilike.%${q}%`).limit(4),
            supabase.from("employees").select("id, full_name, job_title, department").eq("org_id", orgId)
              .ilike("full_name", `%${q}%`).limit(3),
            supabase.from("expenses").select("id, category, vendor, amount, expense_date").eq("org_id", orgId)
              .or(`category.ilike.%${q}%,vendor.ilike.%${q}%`).limit(3),
            supabase.from("invoices").select("id, customer_name, amount, status").eq("org_id", orgId)
              .ilike("customer_name", `%${q}%`).limit(3),
            supabase.from("assets").select("id, name, category, current_value").eq("org_id", orgId)
              .ilike("name", `%${q}%`).limit(3),
            supabase.from("suppliers").select("id, name, contact_person").eq("org_id", orgId)
              .ilike("name", `%${q}%`).limit(3),
          ]);

          (sales ?? []).forEach(s => dbItems.push({
            id: "sale-"+s.id, label: s.customer_name || `Sale #${s.id.slice(-6).toUpperCase()}`,
            sub: `Sale · $${Number(s.total).toFixed(2)} · ${s.sale_date}`,
            icon: Receipt, group: "Sales", badge: "Sale",
            action: () => { navigate(`/sales/${s.id}`); close(); },
          }));

          (customers ?? []).forEach(c => dbItems.push({
            id: "cust-"+c.id, label: c.name,
            sub: `Customer · ${c.email || c.phone || "No contact"}`,
            icon: Contact, group: "Customers", badge: "Customer",
            action: () => { navigate(`/crm/customers/${c.id}`); close(); },
          }));

          (products ?? []).forEach(p => dbItems.push({
            id: "prod-"+p.id, label: p.name,
            sub: `Product · SKU: ${p.sku} · Stock: ${p.stock_quantity}`,
            icon: Boxes, group: "Products", badge: "Product",
            action: () => { navigate(`/inventory/${p.id}`); close(); },
          }));

          (employees ?? []).forEach(e => dbItems.push({
            id: "emp-"+e.id, label: e.full_name,
            sub: `Employee · ${e.job_title || e.department || "HRM"}`,
            icon: Users, group: "Employees", badge: "Employee",
            action: () => { navigate(`/hrm/${e.id}`); close(); },
          }));

          (expenses ?? []).forEach(e => dbItems.push({
            id: "exp-"+e.id, label: e.vendor || e.category,
            sub: `Expense · ${e.category} · $${Number(e.amount).toFixed(2)}`,
            icon: TrendingDown, group: "Expenses", badge: "Expense",
            action: () => { navigate(`/accounting/expenses`); close(); },
          }));

          (invoices ?? []).forEach(inv => dbItems.push({
            id: "inv-"+inv.id, label: inv.customer_name,
            sub: `Invoice · $${Number(inv.amount).toFixed(2)} · ${inv.status}`,
            icon: FileText, group: "Invoices", badge: "Invoice",
            action: () => { navigate(`/accounting/invoices/${inv.id}`); close(); },
          }));

          (assets ?? []).forEach(a => dbItems.push({
            id: "ast-"+a.id, label: a.name,
            sub: `Asset · ${a.category || "Asset"} · $${Number(a.current_value).toFixed(2)}`,
            icon: Package, group: "Assets", badge: "Asset",
            action: () => { navigate(`/assets/${a.id}`); close(); },
          }));

          (suppliers ?? []).forEach(s => dbItems.push({
            id: "sup-"+s.id, label: s.name,
            sub: `Supplier · ${s.contact_person || "No contact"}`,
            icon: Users, group: "Suppliers", badge: "Supplier",
            action: () => { navigate(`/inventory`); close(); },
          }));
        }
      } catch { /* silent */ }

      setResults([...pageMatches, ...actionMatches, ...dbItems]);
      setSearching(false);
    }, 220);
    return () => clearTimeout(debounce.current);
  }, [query]);

  // Flat list for keyboard nav
  const flatItems = useMemo(() => {
    if (query.trim()) return results;
    return [
      ...actions.map(a => ({ ...a, sub: "Quick action", group: "Quick Actions" })),
      ...recentItems,
      ...ALL_PAGES.slice(0, 10).map(p => ({
        id: "page-" + p.id, label: p.label, sub: "Navigate",
        icon: p.icon, group: "Pages",
        action: () => { navigate(p.path); close(); },
      })),
    ];
  }, [query, results, actions, recentItems]);

  // Keyboard nav
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape")    { close(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, flatItems.length - 1)); }
      if (e.key === "ArrowUp")   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
      if (e.key === "Enter")     { e.preventDefault(); flatItems[activeIdx]?.action(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, flatItems, activeIdx, close]);

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
      <div className="fixed left-1/2 top-[10%] -translate-x-1/2 z-50 w-full max-w-2xl px-4">
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden"
          style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }}>

          {/* Search input — white background */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100 bg-white">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search pages, sales, customers, products, employees…"
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
          <div ref={listRef} className="max-h-[480px] overflow-y-auto py-2">
            {flatItems.length === 0 && query && !searching && (
              <div className="px-4 py-8 text-center">
                <Search className="w-8 h-8 mx-auto mb-2 text-slate-200" />
                <p className="text-sm text-slate-400">No results for &quot;<span className="font-medium text-slate-600">{query}</span>&quot;</p>
                <p className="text-xs text-slate-300 mt-1">Try a customer name, product, employee, or page</p>
              </div>
            )}

            {Object.entries(grouped).map(([group, items]) => (
              <div key={group} className="mb-1">
                <p className="px-4 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">{group}</p>
                {items.map(item => {
                  const idx      = globalIdx++;
                  const isActive = idx === activeIdx;
                  const Icon     = item.icon;
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
                        {Icon && <Icon className="w-4 h-4" style={{ color: isActive ? primary : "#64748b" }} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700 truncate">{item.label}</p>
                        {item.sub && <p className="text-[11px] text-slate-400 truncate">{item.sub}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {item.badge && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                            style={{ background: primary + "15", color: primary }}>
                            {item.badge}
                          </span>
                        )}
                        {isActive && <ChevronRight className="w-4 h-4 text-slate-400" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="border-t border-slate-100 px-4 py-2 flex items-center justify-between text-[11px] text-slate-400 bg-slate-50/50">
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