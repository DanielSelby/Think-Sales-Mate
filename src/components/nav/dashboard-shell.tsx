"use client";

import { useAppStore, THEMES } from "@/store/useAppStore";
import { Sidebar } from "./sidebar";
import { TopNav } from "./top-nav";

interface Props {
  children: React.ReactNode;
  orgName:  string;
}

export function DashboardShell({ children, orgName }: Props) {
  const { sidebarCollapsed, activeTheme } = useAppStore();
  const theme = THEMES[activeTheme];

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: theme.colors.background }}>
      <Sidebar collapsed={sidebarCollapsed} />
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <TopNav />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}