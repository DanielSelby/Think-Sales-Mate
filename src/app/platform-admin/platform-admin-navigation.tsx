"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  Building2,
  CreditCard,
  Database,
  Flag,
  Headphones,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Network,
  ScrollText,
  Settings,
  Shield,
  ShieldCheck,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import type { PlatformAdminPage } from "@/lib/platform-admin-pages";

const pageIcons: Partial<Record<PlatformAdminPage, LucideIcon>> = {
  Overview: LayoutDashboard,
  Organizations: Building2,
  "Subscription Plans": CreditCard,
  "Feature Access": ShieldCheck,
  "Organization Builder": Network,
  "Usage & Analytics": BarChart3,
  "Activity Logs": ScrollText,
  Impersonation: Users,
  "Billing & Subscriptions": CreditCard,
  "Complaints & Support": Headphones,
  "API & Integrations": Database,
  "Security Center": Shield,
  "System Settings": Settings,
  "Feature Flags": Flag,
  "Audit Logs": ScrollText,
  "Login Experience": LayoutDashboard,
  registrations: Building2,
  communication: MessageSquare,
};

interface NavigationItem {
  page: PlatformAdminPage;
  label: string;
  href: string;
}

function isActive(item: NavigationItem, pathname: string, search: string) {
  if (item.href.startsWith("/platform-admin?")) {
    const tab = new URLSearchParams(search).get("tab") ?? "Overview";
    return pathname === "/platform-admin" && tab === item.page;
  }
  return pathname === item.href;
}

export default function PlatformAdminNavigation({
  items,
  isPlatformOwner,
}: {
  items: NavigationItem[];
  isPlatformOwner: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mobileOpen, setMobileOpen] = useState(false);
  const search = searchParams.toString();

  function renderLinks() {
    return items.map((item) => {
      const Icon = pageIcons[item.page] ?? LayoutDashboard;
      const active = isActive(item, pathname, search);
      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => setMobileOpen(false)}
          aria-current={active ? "page" : undefined}
          className={`flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
            active ? "bg-blue-600 text-white" : "text-blue-100 hover:bg-white/10 hover:text-white"
          }`}
        >
          <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span>{item.label}</span>
        </Link>
      );
    });
  }

  function renderSidebar() {
    return (
      <div className="flex h-full flex-col bg-[#06294a] px-3 py-5 text-white">
        <Link href="/platform-admin" onClick={() => setMobileOpen(false)} className="mb-6 flex items-center gap-3 px-2">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-800">
            <ShieldCheck aria-hidden="true" className="h-6 w-6" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-xs font-bold uppercase tracking-wide">Think Digital</span>
            <span className="block truncate text-[10px] text-blue-200">Platform Admin</span>
          </span>
        </Link>
        <nav aria-label="Platform Admin navigation" className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {renderLinks()}
          {isPlatformOwner && (
            <Link
              href="/platform-admin/users"
              onClick={() => setMobileOpen(false)}
              aria-current={pathname === "/platform-admin/users" ? "page" : undefined}
              className={`flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                pathname === "/platform-admin/users" ? "bg-blue-600 text-white" : "text-blue-100 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Users aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span>Platform Admin Users</span>
            </Link>
          )}
        </nav>
        <div className="mt-4 border-t border-white/10 px-2 pt-4 text-[10px] text-blue-200">
          Think Digital Solutions
        </div>
      </div>
    );
  }

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">
        {renderSidebar()}
      </aside>
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
        <Link href="/platform-admin" className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <ShieldCheck aria-hidden="true" className="h-5 w-5 text-blue-700" />
          Platform Admin
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open Platform Admin navigation"
          className="rounded-lg p-2 text-slate-700 hover:bg-slate-100"
        >
          <Menu aria-hidden="true" className="h-5 w-5" />
        </button>
      </div>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/50"
            onClick={() => setMobileOpen(false)}
            aria-label="Close Platform Admin navigation"
          />
          <aside className="absolute inset-y-0 left-0 w-72 shadow-2xl">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
              className="absolute right-3 top-4 z-10 rounded-lg p-2 text-white hover:bg-white/10"
            >
              <X aria-hidden="true" className="h-5 w-5" />
            </button>
            {renderSidebar()}
          </aside>
        </div>
      )}
    </>
  );
}
