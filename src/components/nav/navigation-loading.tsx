"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AppLoading } from "@/components/ui/app-loading";

export function NavigationLoading() {
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);
  const [startedAt, setStartedAt] = useState(0);

  useEffect(() => {
    if (!loading) return;
    const elapsed = Date.now() - startedAt;
    const timer = window.setTimeout(() => setLoading(false), Math.max(0, 600 - elapsed));
    return () => window.clearTimeout(timer);
  }, [loading, pathname, startedAt]);

  useEffect(() => {
    const beginNavigation = (event: Event) => {
      const mouseEvent = event as MouseEvent;
      if (event.defaultPrevented || (mouseEvent.button !== undefined && mouseEvent.button !== 0) || mouseEvent.metaKey || mouseEvent.ctrlKey || mouseEvent.shiftKey || mouseEvent.altKey) return;
      const target = event.target instanceof Element ? event.target.closest("a") : null;
      if (!target) return;
      const href = target.getAttribute("href");
      if (!href || !href.startsWith("/") || href.startsWith("//")) return;
      const destination = href.split("#")[0].split("?")[0];
      if (destination === pathname) return;
      setStartedAt(Date.now());
      setLoading(true);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter") beginNavigation(event);
    };

    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;
    const beginHistoryNavigation = (url?: string | URL | null) => {
      if (!url) return;
      const destination = new URL(url.toString(), window.location.href);
      if (destination.origin !== window.location.origin || destination.pathname === window.location.pathname) return;
      setStartedAt(Date.now());
      setLoading(true);
    };
    window.history.pushState = function pushState(...args) {
      beginHistoryNavigation(args[2]);
      return originalPushState.apply(this, args);
    };
    window.history.replaceState = function replaceState(...args) {
      beginHistoryNavigation(args[2]);
      return originalReplaceState.apply(this, args);
    };
    const handlePopState = () => {
      if (window.location.pathname !== pathname) {
        setStartedAt(Date.now());
        setLoading(true);
      }
    };

    document.addEventListener("pointerdown", beginNavigation, true);
    document.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("popstate", handlePopState);
    return () => {
      document.removeEventListener("pointerdown", beginNavigation, true);
      document.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("popstate", handlePopState);
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
    };
  }, [pathname]);

  return loading ? <AppLoading /> : null;
}
