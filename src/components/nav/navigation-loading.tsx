"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export function NavigationLoading() {
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!loading) return;
    const timer = window.setTimeout(() => setLoading(false), 10000);
    return () => window.clearTimeout(timer);
  }, [loading, pathname]);

  useEffect(() => {
    setLoading(false);
  }, [pathname]);

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
      setLoading(true);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter") beginNavigation(event);
    };

    const handlePopState = () => {
      if (window.location.pathname !== pathname) {
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
    };
  }, [pathname]);

  return loading ? <div role="status" aria-label="Loading page" className="fixed inset-x-0 top-0 z-[9999] h-1 overflow-hidden bg-transparent"><span className="block h-full w-1/3 animate-pulse rounded-r-full bg-[var(--theme-primary,#1675d1)]" /></div> : null;
}
