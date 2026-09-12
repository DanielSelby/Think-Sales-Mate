"use client";

import React from "react";
import { useAppStore, THEMES } from "@/store/useAppStore";
import { Sidebar } from "./sidebar";
import { NAV_ITEMS } from "./sidebar";
import { TopNav } from "./top-nav";
import { SessionTimeout } from "./session-timeout";
import { NavigationLoading } from "./navigation-loading";
import type { ThemeKey } from "@/store/useAppStore";
import { GlobalCallNotifications } from "@/components/communication/global-call-notifications";

interface Props {
  children: React.ReactNode;
  orgName:  string;
  logoUrl?: string | null;
  roleTheme?: ThemeKey | null;
  userName?: string | null;
  userRole?: string | null;
  allowedLocationIds?: string[];
  canViewAllBranches?: boolean;
  canChangeTheme?: boolean;
  enabledModules?: string[];
}

export function DashboardShell({ children, orgName, logoUrl, roleTheme, userName, userRole, allowedLocationIds = [], canViewAllBranches = false, canChangeTheme = false, enabledModules }: Props) {
  const { sidebarCollapsed, activeTheme, setTheme } = useAppStore();
  React.useEffect(() => {
    if (roleTheme) setTheme(roleTheme);
  }, [roleTheme, setTheme]);
  const theme = THEMES[activeTheme];
  const mobileNav = NAV_ITEMS.filter((item) => ["/dashboard", "/pos", "/sales", "/inventory", "/approvals"].includes(item.href));

  return (
    <SessionTimeout>
      <NavigationLoading />
      <GlobalCallNotifications />
      <div className="flex h-screen overflow-hidden" style={{ background: theme.colors.background }}>
        <Sidebar collapsed={sidebarCollapsed} enabledModules={enabledModules} />
        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          <TopNav orgName={orgName} logoUrl={logoUrl} userName={userName} userRole={userRole} allowedLocationIds={allowedLocationIds} canViewAllBranches={canViewAllBranches} canChangeTheme={canChangeTheme} />
          <main className="page-canvas flex-1 overflow-y-auto p-4 sm:p-5">
            {children}
          </main>
          <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden dark:border-slate-700 dark:bg-ink-950/95">
            {mobileNav.map((item) => {
              const Icon = item.icon;
              return (
                <a key={item.href} href={item.href} className="flex min-h-14 flex-col items-center justify-center gap-1 text-[10px] font-semibold text-slate-500 hover:text-blue-600 dark:text-slate-300">
                  <Icon className="h-4 w-4" />
                  {item.label}
                </a>
              );
            })}
          </nav>
        </div>
      </div>
    </SessionTimeout>
  );
}