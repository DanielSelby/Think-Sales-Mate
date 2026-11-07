"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAppStore, THEMES, type DarkStyleKey } from "@/store/useAppStore";
import { Sidebar } from "./sidebar";
import { NAV_ITEMS } from "./sidebar";
import { TopNav } from "./top-nav";
import { SessionTimeout } from "./session-timeout";
import { NavigationLoading } from "./navigation-loading";
import type { ThemeKey } from "@/store/useAppStore";
import { GlobalCallNotifications } from "@/components/communication/global-call-notifications";
import type { PlatformWatermarkConfiguration } from "@/lib/platform-watermark";
import { OrganizationExpiryWarning } from "@/components/organization/organization-access-expiry";
import type { OrganizationUsageSummary } from "@/lib/organizations/usage-summary";
import {
  getProductNavigationItems,
  getProductNavigationScope,
  getVisibleNavigationChildren,
} from "@/lib/product-navigation";

interface Props {
  children: React.ReactNode;
  userId: string;
  userEmail: string;
  orgId: string;
  currency: string;
  avatarUrl?: string | null;
  orgName:  string;
  logoUrl?: string | null;
  systemLogoUrl?: string | null;
  systemName?: string;
  roleTheme?: ThemeKey | null;
  darkStyle?: DarkStyleKey;
  userName?: string | null;
  userRole?: string | null;
  allowedLocationIds?: string[];
  canViewAllBranches?: boolean;
  canChangeTheme?: boolean;
  enabledModules?: string[];
  watermark?: PlatformWatermarkConfiguration | null;
  organizationAccessExpiresAt?: string | null;
  organizationUsage: OrganizationUsageSummary | null;
}

export function DashboardShell({ children, userId, userEmail, orgId, currency, avatarUrl, darkStyle = "think-sales", orgName, logoUrl, systemLogoUrl, systemName, roleTheme, userName, userRole, allowedLocationIds = [], canViewAllBranches = false, canChangeTheme = false, enabledModules, watermark, organizationAccessExpiresAt, organizationUsage }: Props) {
  const { sidebarCollapsed, activeTheme, darkMode, setTheme } = useAppStore();
  const pathname = usePathname();
  const [mobileSidebarOpen, setMobileSidebarOpen] = React.useState(false);
  const useStandardLightSurfaces = pathname !== "/pos" &&
    !pathname.startsWith("/pos/");
  React.useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setMobileSidebarOpen(false);
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);
  React.useEffect(() => {
    if (roleTheme) setTheme(roleTheme);
  }, [roleTheme, setTheme]);
  const theme = THEMES[activeTheme];
  const productScope = getProductNavigationScope(pathname);
  const productNavItems = getProductNavigationItems(NAV_ITEMS, productScope);
  const mobileNav = productScope === "thinksales-erp"
    ? productNavItems.filter((item) => ["/dashboard", "/pos", "/sales", "/inventory", "/approvals"].includes(item.href))
    : productNavItems
      .filter((item) => !enabledModules || enabledModules.includes(item.label))
      .flatMap((item) =>
        getVisibleNavigationChildren(item.children, item.label, enabledModules)
      ).slice(0, 5);
  const watermarkPosition = watermark?.position === "top-left" ? "left top"
    : watermark?.position === "top-center" ? "center top"
      : watermark?.position === "top-right" ? "right top"
      : watermark?.position === "bottom-left" ? "left bottom"
        : watermark?.position === "bottom-center" ? "center bottom"
          : watermark?.position === "bottom-right" ? "right bottom"
            : "center";
  const watermarkStyle: React.CSSProperties = watermark?.enabled && watermark.imageUrl
    ? {
      "--platform-watermark-desktop-size": `${watermark.desktopSize}px`,
      "--platform-watermark-mobile-size": `${watermark.mobileSize}px`,
      backgroundImage: `linear-gradient(rgba(${darkMode ? "8, 17, 31" : "247, 248, 250"}, ${1 - watermark.opacity}), rgba(${darkMode ? "8, 17, 31" : "247, 248, 250"}, ${1 - watermark.opacity})), url("${watermark.imageUrl}")`,
      backgroundRepeat: "no-repeat, no-repeat",
      backgroundPosition: `center, ${watermarkPosition}`,
      backgroundSize: "100% 100%, auto var(--platform-watermark-desktop-size)",
      backgroundAttachment: "scroll, fixed",
    } as React.CSSProperties
    : {};
  const watermark3dPosition: React.CSSProperties = watermark?.position === "top-left"
    ? { top: 0, left: 0, transform: "perspective(900px) rotateX(10deg) rotateY(-8deg)" }
    : watermark?.position === "top-center"
      ? { top: 0, left: "50%", transform: "translateX(-50%) perspective(900px) rotateX(10deg) rotateY(-8deg)" }
      : watermark?.position === "top-right"
        ? { top: 0, right: 0, transform: "perspective(900px) rotateX(10deg) rotateY(-8deg)" }
        : watermark?.position === "bottom-left"
          ? { bottom: 0, left: 0, transform: "perspective(900px) rotateX(10deg) rotateY(-8deg)" }
          : watermark?.position === "bottom-center"
            ? { bottom: 0, left: "50%", transform: "translateX(-50%) perspective(900px) rotateX(10deg) rotateY(-8deg)" }
            : watermark?.position === "bottom-right"
              ? { bottom: 0, right: 0, transform: "perspective(900px) rotateX(10deg) rotateY(-8deg)" }
              : { top: "50%", left: "50%", transform: "translate(-50%, -50%) perspective(900px) rotateX(10deg) rotateY(-8deg)" };

  return (
    <SessionTimeout>
      <NavigationLoading />
      <GlobalCallNotifications userId={userId} orgId={orgId} />
      <OrganizationExpiryWarning expiryDate={organizationAccessExpiresAt ?? null} />
      <div
        className="flex h-screen overflow-hidden"
        style={{
          background: darkMode ? "#08111f" : "#f7f8fa",
          "--theme-primary": theme.colors.primary,
          "--theme-primary-pale": theme.colors.primaryPale,
          "--theme-header-light": theme.colors.primaryPale,
          "--theme-header-dark": `color-mix(in srgb, ${theme.colors.primary} 18%, #08111f)`,
          "--theme-header-border-light": `color-mix(in srgb, ${theme.colors.primary} 24%, white)`,
          "--theme-header-border-dark": `color-mix(in srgb, ${theme.colors.primary} 36%, #334155)`,
        } as React.CSSProperties}
      >
        <Sidebar
          collapsed={mobileSidebarOpen ? false : sidebarCollapsed}
          enabledModules={enabledModules}
          systemLogoUrl={systemLogoUrl}
          systemName={systemName}
          mobileOpen={mobileSidebarOpen}
          onNavigate={() => setMobileSidebarOpen(false)}
        />
        {mobileSidebarOpen && (
          <button
            type="button"
            aria-label="Close navigation menu"
            className="fixed inset-0 z-50 bg-black/50 md:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}
        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          <TopNav
            userId={userId}
            orgId={orgId}
            currency={currency}
            orgName={orgName}
            logoUrl={logoUrl}
            userName={userName}
            userEmail={userEmail}
            avatarUrl={avatarUrl}
            userRole={userRole}
            allowedLocationIds={allowedLocationIds}
            canViewAllBranches={canViewAllBranches}
            canChangeTheme={canChangeTheme}
            darkStyle={darkStyle}
            organizationUsage={organizationUsage}
            organizationAccessExpiresAt={organizationAccessExpiresAt ?? null}
            onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
          />
          <main
            className="page-canvas flex-1 overflow-y-auto p-4 pb-20 sm:p-5 md:pb-5"
            data-light-surfaces={useStandardLightSurfaces ? "standard" : undefined}
            data-platform-watermark={watermark?.enabled && watermark.imageUrl ? "enabled" : undefined}
            data-watermark-style={watermark?.displayStyle}
            style={watermark?.displayStyle === "3d" ? {} : watermarkStyle}
          >
            {watermark?.enabled && watermark.imageUrl && watermark.displayStyle === "3d" && (
              <Image
                src={watermark.imageUrl}
                alt=""
                aria-hidden="true"
                unoptimized
                width={800}
                height={800}
                className="platform-watermark-3d"
                style={{
                  ...watermark3dPosition,
                  "--platform-watermark-desktop-size": `${watermark.desktopSize}px`,
                  "--platform-watermark-mobile-size": `${watermark.mobileSize}px`,
                  "--platform-watermark-opacity": watermark.opacity,
                  filter: `drop-shadow(12px 14px 6px rgba(${darkMode ? "0, 0, 0" : "15, 23, 42"}, ${Math.min(0.35, watermark.opacity * 0.9)}))`,
                } as React.CSSProperties}
              />
            )}
            {children}
          </main>
          <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden dark:border-slate-700 dark:bg-ink-950/95">
            {mobileNav.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href} prefetch className="flex min-h-14 flex-col items-center justify-center gap-1 text-[10px] font-semibold text-slate-500 hover:text-blue-600 dark:text-slate-300">
                  {Icon && <Icon className="h-4 w-4" />}
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </SessionTimeout>
  );
}