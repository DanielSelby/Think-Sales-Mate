"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function TrackingAutoRefresh({ enabled = true }: { enabled?: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;

    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = window.setInterval(refreshIfVisible, 30000);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [enabled, router]);
  return null;
}
