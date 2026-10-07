"use client";

import Link from "next/link";
import { useCallback, useSyncExternalStore } from "react";
import { MapPin } from "lucide-react";

export function TrackOrderLink({ orgSlug }: { orgSlug: string }) {
  const storageKey = `thinksales-last-order-${orgSlug}`;
  const subscribe = useCallback((onChange: () => void) => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === storageKey) onChange();
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [storageKey]);
  const getSnapshot = useCallback(() => window.localStorage.getItem(storageKey), [storageKey]);
  const token = useSyncExternalStore(subscribe, getSnapshot, () => null);
  if (!token) return null;
  return (
    <Link href={`/order/${orgSlug}/track/${token}`} className="inline-flex items-center gap-2 rounded-xl border border-signal/30 bg-signal/10 px-3 py-2 text-xs font-bold text-signal hover:bg-signal/20">
      <MapPin className="h-3.5 w-3.5" /> Track Order
    </Link>
  );
}
