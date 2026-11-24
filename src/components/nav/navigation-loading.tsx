"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function NavigationLoading({
  logoUrl,
  systemName = "Think Digital Solutions",
}: {
  logoUrl?: string | null;
  systemName?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const [loadingRoute, setLoadingRoute] = useState<string | null>(null);
  const loading = loadingRoute !== null && loadingRoute !== routeKey;

  useEffect(() => {
    if (!loading) return;
    const timer = window.setTimeout(() => setLoadingRoute(null), 10000);
    return () => window.clearTimeout(timer);
  }, [loading, routeKey]);

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
      setLoadingRoute(`${destination.pathname}?${destination.searchParams.toString()}`);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter") beginNavigation(event);
    };

    const handlePopState = () => {
      const currentRouteKey = `${window.location.pathname}?${new URLSearchParams(window.location.search).toString()}`;
      if (currentRouteKey !== routeKey) {
        setLoadingRoute(currentRouteKey);
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

  return loading ? (
    <div
      className="fixed inset-0 z-[9998] grid cursor-wait place-items-center bg-white/90 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-label={`Loading ${systemName}`}
    >
      <div className="flex flex-col items-center gap-5">
        <div className="relative grid h-24 w-24 place-items-center">
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-full border-4 border-blue-100 border-t-blue-700 motion-reduce:animate-none animate-spin"
          />
          {logoUrl
            ? <Image src={logoUrl} alt={systemName} width={64} height={64} unoptimized className="h-14 w-14 rounded-xl object-contain" />
            : <span aria-hidden="true" className="text-xl font-extrabold tracking-tight text-blue-800">TDS</span>}
        </div>
        <div className="text-center">
          <p className="text-base font-semibold text-slate-900">{systemName}</p>
          <p className="mt-1 text-sm text-slate-500">Loading...</p>
        </div>
      </div>
    </div>
  ) : null;
}
