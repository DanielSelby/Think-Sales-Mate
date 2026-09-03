"use client";

import { useAppStore, THEMES } from "@/store/useAppStore";
import { Sidebar } from "./sidebar";
import { TopNav } from "./top-nav";
import { SessionTimeout } from "./session-timeout";
import { NavigationLoading } from "./navigation-loading";

interface Props {
  children: React.ReactNode;
  orgName:  string;
  logoUrl?: string | null;
}

export function DashboardShell({ children, orgName, logoUrl }: Props) {
  const { sidebarCollapsed, activeTheme } = useAppStore();
  const theme = THEMES[activeTheme];

  return (
    <SessionTimeout>
      <NavigationLoading />
      <div className="flex h-screen overflow-hidden" style={{ background: theme.colors.background }}>
        <Sidebar collapsed={sidebarCollapsed} />
        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          <TopNav orgName={orgName} logoUrl={logoUrl} />
          <main className="page-canvas flex-1 overflow-y-auto p-4 sm:p-5">
            {children}
          </main>
        </div>
      </div>
    </SessionTimeout>
  );
}