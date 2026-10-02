"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { AppLoading } from "@/components/ui/app-loading";

export function NavigationLoading() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!loading) return;
    const timer = window.setTimeout(() => setLoading(false), 10000);
    return () => window.clearTimeout(timer);
  }, [loading, routeKey]);

  useEffect(() => {
    setLoading(false);
  }, [routeKey]);

  useEffect(() => {
    const beginNavigation = (event: Event) => {
      const mouseEvent = event as MouseEvent;
      if (event.defaultPrevented || (mouseEvent.button !== undefined && mouseEvent.button !== 0) || mouseEvent.metaKey || mouseEvent.ctrlKey || mouseEvent.shiftKey || mouseEvent.altKey) return;
      const target = event.target instanceof Element ? event.target.closest("a") : null;
      if (!target) return;
      const href = target.getAttribute("href");
      if (!href || !href.startsWith("/") || href.startsWith("//")) return;
      const destination = new URL(href, window.location.origin);
      if (`${destination.pathname}?${destination.searchParams.toString()}` === routeKey) return;
      setLoading(true);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter") beginNavigation(event);
    };

    const handlePopState = () => {
      const currentRouteKey = `${window.location.pathname}?${new URLSearchParams(window.location.search).toString()}`;
      if (currentRouteKey !== routeKey) {
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
  }, [pathname, routeKey]);

  return loading ? <AppLoading /> : null;
}
