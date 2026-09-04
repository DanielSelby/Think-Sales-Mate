"use client";

import React from "react";
import { useAppStore, THEMES } from "@/store/useAppStore";
import { Sidebar } from "./sidebar";
import { TopNav } from "./top-nav";
import { SessionTimeout } from "./session-timeout";
import { NavigationLoading } from "./navigation-loading";
import type { ThemeKey } from "@/store/useAppStore";

interface Props {
  children: React.ReactNode;
  orgName:  string;
  logoUrl?: string | null;
  roleTheme?: ThemeKey | null;
  userName?: string | null;
  userRole?: string | null;
  canChangeTheme?: boolean;
}

export function DashboardShell({ children, orgName, logoUrl, roleTheme, userName, userRole, canChangeTheme = false }: Props) {
  const { sidebarCollapsed, activeTheme, setTheme } = useAppStore();
  React.useEffect(() => {
    if (roleTheme) setTheme(roleTheme);
  }, [roleTheme, setTheme]);
  const theme = THEMES[activeTheme];

  return (
    <SessionTimeout>
      <NavigationLoading />
      <div className="flex h-screen overflow-hidden" style={{ background: theme.colors.background }}>
        <Sidebar collapsed={sidebarCollapsed} />
        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          <TopNav orgName={orgName} logoUrl={logoUrl} userName={userName} userRole={userRole} canChangeTheme={canChangeTheme} />
          <main className="page-canvas flex-1 overflow-y-auto p-4 sm:p-5">
            {children}
          </main>
        </div>
      </div>
    </SessionTimeout>
  );
}