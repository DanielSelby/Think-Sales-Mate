"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";

export function TrackOrderLink({ orgSlug }: { orgSlug: string }) {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => setToken(window.localStorage.getItem(`thinksales-last-order-${orgSlug}`)), [orgSlug]);
  if (!token) return null;
  return (
    <Link href={`/order/${orgSlug}/track/${token}`} className="inline-flex items-center gap-2 rounded-xl border border-signal/30 bg-signal/10 px-3 py-2 text-xs font-bold text-signal hover:bg-signal/20">
      <MapPin className="h-3.5 w-3.5" /> Track Order
    </Link>
  );
}
