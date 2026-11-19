"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Search, X, ChevronRight, Zap,
  LayoutDashboard, ShoppingCart, Boxes, Users, Contact,
  Landmark, Receipt, Package, FolderKanban,
  BarChart3, Settings, Sparkles, Plus, ArrowLeftRight, GraduationCap,
  FileText, Tag, TrendingUp, TrendingDown, Clock, MapPin, Truck,
  CalendarDays, Utensils, Wrench,
} from "lucide-react";
import { useAppStore, THEMES } from "@/store/useAppStore";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/currency";
import {
  getProductNavigationItems,
  getProductNavigationScope,
  getProductScopedHref,
  getVisibleNavigationChildren,
  type ProductNavigationScope,
} from "@/lib/product-navigation";
import { getProductAppPath } from "@/lib/product-app-routes";

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

type CommandPage = { id: string; label: string; path: string; icon: any; group: string };

function flattenNavItems(
  items: typeof NAV_ITEMS,
  pathname: string,
  enabledModules?: string[],
): CommandPage[] {
  const result: { id: string; label: string; path: string; icon: any; group: string }[] = [];
  const scope = getProductNavigationScope(pathname);
  for (const item of getProductNavigationItems(items, scope)) {
    if (enabledModules && !enabledModules.includes(item.label)) continue;
    const itemPath = getProductScopedHref(pathname, item.href);
    if (itemPath) result.push({
      id: item.href.replace(/\//g, "-").slice(1) || "home",
      label: item.label,
      path: itemPath,
      icon: item.icon,
      group: "Pages",
    });
    const children = getVisibleNavigationChildren(item.children, item.label, enabledModules);
    for (const child of children) {
      const childPath = getProductScopedHref(pathname, child.href);
      if (!childPath) continue;
      result.push({
        id: child.href.replace(/\//g, "-").slice(1) || "child",
        label: child.label,
        path: childPath,
        icon: child.icon ?? item.icon,
        group: "Pages",
      });
    }
  }
  for (const [id, label, href, icon] of [
    ["settings-org", "Organization Settings", "/settings/organization", Settings],
    ["settings-team", "Team Members", "/settings/team", Users],
    ["settings-locations", "Locations", "/settings/locations", MapPin],
  ] as const) {
    const path = getProductScopedHref(pathname, href);
    if (path) result.push({ id, label, path, icon, group: "Pages" });
  }
  return result;
}

type ActionDefinition = { id: string; label: string; icon: any; href: string };

function buildActions(
  router: ReturnType<typeof useRouter>,
  close: () => void,
  scope: ProductNavigationScope,
  pathname: string,
  pages: CommandPage[],
): CommandItem[] {
  const definitions: Record<ProductNavigationScope, ActionDefinition[]> = {
    "thinksales-erp": [
      { id: "new-sale", label: "New Sale", icon: ShoppingCart, href: "/sales/new" },
      { id: "new-invoice", label: "New Invoice", icon: FileText, href: "/accounting/invoices/new" },
      { id: "new-expense", label: "New Expense", icon: TrendingDown, href: "/expenses/new" },
      { id: "new-customer", label: "New Customer", icon: Contact, href: "/crm/customers/new" },
      { id: "new-product", label: "New Product", icon: Tag, href: "/inventory/new" },
      { id: "new-transfer", label: "Bank Transfer", icon: ArrowLeftRight, href: "/banking?transfer=1" },
    ],
    restaurant: [
      { id: "restaurant-pos", label: "Open Restaurant POS", icon: ShoppingCart, href: "/restaurant/pos" },
      { id: "restaurant-orders", label: "Open Orders & Kitchen", icon: Utensils, href: "/restaurant" },
      { id: "restaurant-menu", label: "Manage Menu", icon: Tag, href: "/restaurant?view=menu" },
    ],
    "think-service-repairs": [
      { id: "service-jobs", label: "Open Service Jobs", icon: Wrench, href: "/service-center#service-jobs" },
      { id: "service-appointments", label: "Open Appointments", icon: CalendarDays, href: "/service-center/appointments" },
      { id: "service-customers", label: "Open Customers", icon: Contact, href: "/service-center/customers" },
    ],
    "think-education": [
      { id: "education-students", label: "Open Students", icon: Users, href: "/education/students" },
      { id: "education-admissions", label: "Open Admissions", icon: Plus, href: "/education/admissions" },
      { id: "education-transfer", label: "Request Student Transfer", icon: Truck, href: "/education/transfers/request" },
    ],
  };
  const pagePaths = new Set(pages.map((page) => page.path));
  return definitions[scope].flatMap((definition) => {
    const href = getProductScopedHref(pathname, definition.href);
    if (!href) return [];
    const actionPath = new URL(href, "http://localhost").pathname;
    const hasVisibleDestination = [...pagePaths].some((pagePath) => {
      const visiblePath = new URL(pagePath, "http://localhost").pathname;
      return actionPath === visiblePath || actionPath.startsWith(`${visiblePath}/`);
    });
    if (!hasVisibleDestination) return [];
    return [{
      ...definition,
      sub: "Quick action",
      group: "Actions",
      action: () => { router.push(href); close(); },
    }];
  });
}

interface CommandItem {
  id:     string;
  label:  string;
  sub?:   string;
  icon:   any;
  group:  string;
  action: () => void;
}

export function CommandBar({ open, onClose, enabledModules }: { open: boolean; onClose: () => void; enabledModules?: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const { activeTheme } = useAppStore();
  const productScope = getProductNavigationScope(pathname);
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
  const pages = useMemo(() => flattenNavItems(NAV_ITEMS, pathname, enabledModules), [pathname, enabledModules]);

  const close = useCallback(() => {
    setQuery(""); setResults([]); setActiveIdx(0); onClose();
  }, [onClose]);

  const actions = useMemo(
    () => buildActions(router, close, productScope, pathname, pages),
    [router, close, productScope, pathname, pages],
  );

  function navigate(path: string) {
    try {
      const stored = JSON.parse(localStorage.getItem("sm-recent-nav") || "[]") as string[];
      const updated = [path, ...stored.filter(p => p !== path)].slice(0, 8);
      localStorage.setItem("sm-recent-nav", JSON.stringify(updated));
    } catch { /* silent */ }
    router.push(path);
  }

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setResults([]);
    setActiveIdx(0);
    setSearching(Boolean(value.trim()));
  };

  // Focus on open
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 40);
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
    let frame = 0;
    try {
      const stored = JSON.parse(localStorage.getItem("sm-recent-nav") || "[]") as string[];
      const items  = stored
        .map(path => pages.find(p => p.path === path))
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
      frame = window.requestAnimationFrame(() => setRecentItems(items));
    } catch { /* silent */ }
    return () => window.cancelAnimationFrame(frame);
  }, [open, pages]);

  // Search across pages + Supabase
  useEffect(() => {
    if (!query.trim()) return;
    clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setSearching(true);
      const q = query.trim().toLowerCase();

      // Page matches
      const pageMatches: CommandItem[] = pages
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
            if (productScope === "thinksales-erp") {
            const [
              { data: products },
              { data: customers },
              { data: sales },
              { data: invoices },
              { data: expenses },
              { data: suppliers },
              { data: locations },
              { data: assets },
              { data: employees },
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
              supabase.from("assets").select("id, name, category, location, status")
                .eq("org_id", orgId)
                .or(`name.ilike.%${q}%,category.ilike.%${q}%,location.ilike.%${q}%`)
                .limit(4),
              supabase.from("employees").select("id, full_name, employee_number, department, job_title")
                .eq("org_id", orgId)
                .or(`full_name.ilike.%${q}%,department.ilike.%${q}%,job_title.ilike.%${q}%`)
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
            (assets ?? []).forEach(a => dbItems.push({
              id: "asset-" + a.id, label: a.name,
              sub: `Asset · ${a.category ?? "Uncategorized"} · ${a.status.replaceAll("_", " ")}`,
              icon: Package, group: "Assets", action: () => { navigate("/assets"); close(); }
            }));
            (employees ?? []).forEach(e => dbItems.push({
              id: "employee-" + e.id, label: e.full_name,
              sub: `Employee · ${e.job_title ?? e.department ?? `#${e.employee_number}`}`,
              icon: Users, group: "Employees", action: () => { navigate("/hrm/employees"); close(); }
            }));
            } else if (productScope === "think-education") {
              const [
                { data: students, error: studentsError },
                { data: staff, error: staffError },
              ] = await Promise.all([
                supabase.from("education_students")
                  .select("id, student_number, first_name, last_name, other_names")
                  .eq("org_id", orgId)
                  .or(`student_number.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%,other_names.ilike.%${q}%`)
                  .limit(5),
                supabase.from("education_staff")
                  .select("id, staff_number, first_name, last_name")
                  .eq("org_id", orgId)
                  .or(`staff_number.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
                  .limit(5),
              ]);
              if (studentsError) throw studentsError;
              if (staffError) throw staffError;
              (students ?? []).forEach((student) => dbItems.push({
                id: `education-student-${student.id}`,
                label: [student.first_name, student.other_names, student.last_name].filter(Boolean).join(" "),
                sub: `Student · ${student.student_number}`,
                icon: GraduationCap,
                group: "Students",
                action: () => { navigate(getProductAppPath("think-education", `/students/${student.id}`)); close(); },
              }));
              (staff ?? []).forEach((member) => dbItems.push({
                id: `education-staff-${member.id}`,
                label: `${member.first_name} ${member.last_name}`,
                sub: `Staff · ${member.staff_number}`,
                icon: Users,
                group: "Staff",
                action: () => { navigate(getProductAppPath("think-education", `/staff/${member.id}`)); close(); },
              }));
            } else if (productScope === "restaurant") {
              const [
                { data: menuItems, error: menuError },
                { data: orders, error: ordersError },
              ] = await Promise.all([
                supabase.from("restaurant_menu_items")
                  .select("id, name, sku")
                  .eq("org_id", orgId)
                  .or(`name.ilike.%${q}%,sku.ilike.%${q}%`)
                  .limit(5),
                supabase.from("restaurant_orders")
                  .select("id, order_number, cue_number, customer_name, status")
                  .eq("org_id", orgId)
                  .or(`cue_number.ilike.%${q}%,customer_name.ilike.%${q}%`)
                  .limit(5),
              ]);
              if (menuError) throw menuError;
              if (ordersError) throw ordersError;
              (menuItems ?? []).forEach((item) => dbItems.push({
                id: `restaurant-menu-${item.id}`,
                label: item.name,
                sub: `Menu item${item.sku ? ` · ${item.sku}` : ""}`,
                icon: Utensils,
                group: "Menu",
                action: () => { navigate(getProductAppPath("restaurant", "/")); close(); },
              }));
              (orders ?? []).forEach((order) => dbItems.push({
                id: `restaurant-order-${order.id}`,
                label: order.customer_name || `Order #${order.order_number}`,
                sub: `Order ${order.cue_number} · ${order.status.replaceAll("_", " ")}`,
                icon: Receipt,
                group: "Orders",
                action: () => { navigate(getProductAppPath("restaurant", "/")); close(); },
              }));
            } else if (productScope === "think-service-repairs") {
              const { data: jobs, error: jobsError } = await supabase.from("service_jobs")
                .select("id, job_number, status, reported_problem")
                .eq("org_id", orgId)
                .or(`job_number.ilike.%${q}%,reported_problem.ilike.%${q}%`)
                .limit(8);
              if (jobsError) throw jobsError;
              (jobs ?? []).forEach((job) => dbItems.push({
                id: `service-job-${job.id}`,
                label: job.job_number,
                sub: `${job.status.replaceAll("_", " ")} · ${job.reported_problem}`,
                icon: Wrench,
                group: "Service jobs",
                action: () => { navigate(getProductAppPath("think-service-repairs", "/")); close(); },
              }));
            }
          }
        }
      } catch (error) {
        console.error(`Could not search ${productScope} records:`, error);
      }

      setResults([...pageMatches, ...actionMatches, ...dbItems]);
      setSearching(false);
    }, 200);
    return () => clearTimeout(debounce.current);
  }, [query, orgCurrency, productScope, pages, actions]);

  // Flat list for keyboard nav
  const flatItems = useMemo(() => {
    if (query.trim()) return results;
    return [...actions.map(a => ({ ...a, sub: "Quick action", group: "Quick Actions" })), ...recentItems, ...pages.map(p => ({ id: "page-" + p.id, label: p.label, sub: "Navigate", icon: p.icon, group: "Pages", action: () => { navigate(p.path); close(); } }))];
  }, [query, results, actions, recentItems, pages]);

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
              onChange={e => handleQueryChange(e.target.value)}
              placeholder={`Search ${productScope === "thinksales-erp" ? "pages, actions, customers, products, transactions" : productScope === "think-education" ? "education pages, students, and staff" : productScope === "restaurant" ? "restaurant pages, menu, and orders" : "service pages and jobs"}…`}
              className="flex-1 text-sm bg-white outline-none placeholder:text-slate-400 text-slate-800"
            />
            <div className="flex items-center gap-2 shrink-0">
              {searching && <div className="w-3.5 h-3.5 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin" />}
              {query && (
                <button onClick={() => handleQueryChange("")} className="text-slate-400 hover:text-slate-600 transition-colors">
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
                <p className="text-xs text-slate-300 mt-1">Try a page or record in this product</p>
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
