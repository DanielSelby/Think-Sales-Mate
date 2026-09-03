"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AppLoading } from "@/components/ui/app-loading";

export function NavigationLoading() {
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(false);
  }, [pathname]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest("a") : null;
      if (!target) return;
      const href = target.getAttribute("href");
      if (!href || !href.startsWith("/") || href.startsWith("//") || href === pathname) return;
      setLoading(true);
    };

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [pathname]);

  return loading ? <AppLoading /> : null;
}
